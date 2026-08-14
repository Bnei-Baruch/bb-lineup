import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart } from "@/lib/dates";

/** After recording playout, find the matching slot in today's lineup and persist actual broadcast data */
async function saveActualBroadcastToSlot(clipName: string, startAt: string, durationSec?: number) {
  try {
    const now = new Date();
    const ws = toWeekStart(now);
    // SQLite stores datetimes with +00:00 suffix; use LIKE to avoid format mismatch with Z suffix
    const weekDatePrefix = ws.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const dow = now.getUTCDay();

    const lineups = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Lineup" WHERE weekStart LIKE ${weekDatePrefix + "%"} LIMIT 1
    `;
    if (!lineups[0]) return;
    const lineupId = lineups[0].id;

    const days = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "LineupDay" WHERE lineupId = ${lineupId} AND dayOfWeek = ${dow} LIMIT 1
    `;
    if (!days[0]) return;
    const dayId = days[0].id;
    const now2 = new Date().toISOString();

    // Try matching by slot id first
    const slotsById = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "LineupSlot" WHERE id = ${clipName} AND dayId = ${dayId} LIMIT 1
    `;
    if (slotsById[0]) {
      await prisma.$executeRaw`
        UPDATE "LineupSlot"
        SET actualBroadcastAt = ${startAt}, actualDurationSec = ${durationSec ?? null}, updatedAt = ${now2}
        WHERE id = ${slotsById[0].id}
      `;
      return;
    }

    // Match by series.playoutCode via JOIN (case-insensitive via UPPER) — covers
    // slots with a library lesson attached
    const matched = await prisma.$queryRaw<{ id: string }[]>`
      SELECT ls.id FROM "LineupSlot" ls
      JOIN "Lesson" l ON ls.lessonId = l.id
      JOIN "Series" s ON l.seriesId = s.id
      WHERE ls.dayId = ${dayId} AND UPPER(s.playoutCode) = UPPER(${clipName})
    `;
    // Match by the slot's own mediaCode — covers non-lesson segments (transitions,
    // openers, etc.) that have no Series to carry a playoutCode
    const matchedByMediaCode = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "LineupSlot"
      WHERE dayId = ${dayId} AND mediaCode IS NOT NULL AND UPPER(mediaCode) = UPPER(${clipName})
    `;
    for (const slot of [...matched, ...matchedByMediaCode]) {
      await prisma.$executeRaw`
        UPDATE "LineupSlot"
        SET actualBroadcastAt = ${startAt}, actualDurationSec = ${durationSec ?? null}, updatedAt = ${now2}
        WHERE id = ${slot.id}
      `;
    }
  } catch (e) {
    console.error("[playout] saveActualBroadcastToSlot:", e);
  }
}

export async function GET() {
  try {
    const row = await prisma.playoutNowPlaying.findUnique({ where: { id: "current" } });
    if (!row) return NextResponse.json(null);

    // TTL: use updatedAt (time we received the POST) not actualStartAt (Playdeck clip time,
    // which may be from yesterday). Companion-provided clip start times can be stale.
    if (row.durationSec) {
      const updatedMs = new Date(row.updatedAt).getTime();
      const expireMs = updatedMs + (Number(row.durationSec) + 15) * 1000;
      if (Date.now() > expireMs) {
        await prisma.playoutNowPlaying.delete({ where: { id: "current" } }).catch(() => {});
        return NextResponse.json(null);
      }
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clipName, durationSec, actualStartAt, manual } = body as {
      clipName: string; durationSec?: number; actualStartAt?: string; manual?: boolean;
    };
    if (!clipName) return NextResponse.json({ error: "clipName required" }, { status: 400 });

    const startAt = actualStartAt ?? new Date().toISOString();

    // Manual operator adjustments only save to the slot — they don't touch PlayoutNowPlaying
    // so the LIVE badge is not affected. Only Companion-triggered calls update live state.
    if (manual) {
      saveActualBroadcastToSlot(clipName, startAt, durationSec);
      return NextResponse.json({ clipName, actualStartAt: startAt, durationSec: durationSec ?? null });
    }

    // For Companion calls: check if the same clip is already playing.
    // If so, preserve actualStartAt (the original clip start time) so duration
    // calculations remain correct even when Companion re-POSTs every 30s.
    const existing = await prisma.playoutNowPlaying.findUnique({ where: { id: "current" } });
    const isSameClip = existing && existing.clipName.toUpperCase() === clipName.toUpperCase();

    if (isSameClip) {
      // Same clip re-POST: only refresh durationSec + updatedAt (for TTL), keep actualStartAt
      const record = await prisma.playoutNowPlaying.update({
        where: { id: "current" },
        data: { durationSec: durationSec ?? null },
      });
      return NextResponse.json(record);
    }

    // New clip: full upsert, save original start time, persist to slot
    const record = await prisma.playoutNowPlaying.upsert({
      where: { id: "current" },
      create: { id: "current", clipName, actualStartAt: startAt, durationSec: durationSec ?? null },
      update: { clipName, actualStartAt: startAt, durationSec: durationSec ?? null },
    });
    saveActualBroadcastToSlot(clipName, startAt, durationSec);
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const row = await prisma.playoutNowPlaying.findUnique({ where: { id: "current" } });
    if (row) {
      // actualStartAt is preserved from the first Companion POST (same-clip re-POSTs don't
      // update it), so duration = stopTime - originalStartTime = correct total play time.
      const stopMs = Date.now();
      const startMs = new Date(row.actualStartAt).getTime();
      const computedDurationSec = Math.max(1, Math.round((stopMs - startMs) / 1000));
      // Await the save so the duration is in the DB before we return 204.
      // DayView fetches actuals immediately after seeing null from the poll — the save
      // must be complete by then or it will read stale data.
      await saveActualBroadcastToSlot(row.clipName, row.actualStartAt, computedDurationSec);
    }
    await prisma.playoutNowPlaying.deleteMany({ where: { id: "current" } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
