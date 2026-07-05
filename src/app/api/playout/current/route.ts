import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart } from "@/lib/dates";

/** After recording playout, find the matching slot in today's lineup and persist actualBroadcastAt */
async function saveActualBroadcastToSlot(clipName: string, startAt: string) {
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
        UPDATE "LineupSlot" SET actualBroadcastAt = ${startAt}, updatedAt = ${now2} WHERE id = ${slotsById[0].id}
      `;
      return;
    }

    // Match by series.playoutCode via JOIN (case-insensitive via UPPER)
    const matched = await prisma.$queryRaw<{ id: string }[]>`
      SELECT ls.id FROM "LineupSlot" ls
      JOIN "Lesson" l ON ls.lessonId = l.id
      JOIN "Series" s ON l.seriesId = s.id
      WHERE ls.dayId = ${dayId} AND UPPER(s.playoutCode) = UPPER(${clipName})
    `;
    for (const slot of matched) {
      await prisma.$executeRaw`
        UPDATE "LineupSlot" SET actualBroadcastAt = ${startAt}, updatedAt = ${now2} WHERE id = ${slot.id}
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

    // TTL: if durationSec known and clip should have ended > 15s ago, treat as stale
    if (row.durationSec) {
      const startMs = new Date(row.actualStartAt).getTime();
      const expireMs = startMs + (row.durationSec + 15) * 1000;
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
    const { clipName, durationSec, actualStartAt } = body as {
      clipName: string; durationSec?: number; actualStartAt?: string;
    };
    if (!clipName) return NextResponse.json({ error: "clipName required" }, { status: 400 });

    const startAt = actualStartAt ?? new Date().toISOString();

    const record = await prisma.playoutNowPlaying.upsert({
      where: { id: "current" },
      create: {
        id: "current",
        clipName,
        actualStartAt: startAt,
        durationSec: durationSec ?? null,
      },
      update: {
        clipName,
        actualStartAt: startAt,
        durationSec: durationSec ?? null,
      },
    });

    // Persist actual start time back to the matching slot (fire-and-forget)
    saveActualBroadcastToSlot(clipName, startAt);

    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.playoutNowPlaying.deleteMany({ where: { id: "current" } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
