import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart, isoToIsraelSec, todayInIsrael } from "@/lib/dates";
import { computeSlotWindows, pickLiveSlot } from "@/lib/slot-live-match";

/** Parse "HH:MM" or "HH:MM:SS" to seconds-since-midnight */
function timeToSec(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

/**
 * After recording playout, find the matching slot in today's lineup and persist actual
 * broadcast data. Returns the slot id that was updated (or null if none matched), so the
 * caller can pin that same slot for the corresponding stop event via `knownSlotId`.
 *
 * Matching is purely by time: Companion no longer sends any usable clip identifier, so
 * this finds whichever not-yet-finished slot's own scheduled window contains `startAt`
 * (see src/lib/slot-live-match.ts — shared with the client so both always agree on the
 * same slot).
 *
 * `knownSlotId` bypasses matching entirely — used when stopping a clip, so the stop event
 * always lands on the exact slot the start event resolved, instead of re-running the match
 * a second time (and used by manual operator overrides, which target an exact slot the
 * operator already picked).
 */
async function saveActualBroadcastToSlot(
  startAt: string, durationSec?: number, knownSlotId?: string | null
): Promise<string | null> {
  try {
    const now2 = new Date().toISOString();

    if (knownSlotId) {
      await prisma.$executeRaw`
        UPDATE "LineupSlot"
        SET actualBroadcastAt = ${startAt}, actualDurationSec = ${durationSec ?? null}, updatedAt = ${now2}
        WHERE id = ${knownSlotId}
      `;
      return knownSlotId;
    }

    // Use Israel's calendar day, not the server's UTC clock — a call made between
    // local midnight and ~03:00 is still "yesterday" in UTC and would otherwise
    // resolve to the wrong LineupDay (see todayInIsrael's doc comment).
    const israelToday = todayInIsrael();
    const ws = toWeekStart(israelToday);
    // SQLite stores datetimes with +00:00 suffix; use LIKE to avoid format mismatch with Z suffix
    const weekDatePrefix = ws.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const dow = israelToday.getUTCDay();

    const lineups = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Lineup" WHERE weekStart LIKE ${weekDatePrefix + "%"} LIMIT 1
    `;
    if (!lineups[0]) return null;
    const lineupId = lineups[0].id;

    // A single dayOfWeek can have multiple sessions (e.g. a morning + an afternoon
    // lesson on the same day), each its own LineupDay row sharing the same
    // playoutCode/mediaCode (same underlying series, different segments).
    const days = await prisma.$queryRaw<{ id: string; broadcastStartTime: string | null; broadcastEndTime: string | null }[]>`
      SELECT id, broadcastStartTime, broadcastEndTime FROM "LineupDay" WHERE lineupId = ${lineupId} AND dayOfWeek = ${dow}
    `;
    if (days.length === 0) return null;

    // Automatic (Companion) plays are only ever real broadcast data if they land inside
    // the session's actual broadcast window. Equipment/cueing tests happen before showtime
    // and must never be recorded as if they aired — so there's no grace period before
    // start, only a small grace window after the nominal end (a broadcast can run long).
    const GRACE_AFTER_END_SEC = 10 * 60;
    const actualSec = isoToIsraelSec(startAt);
    const day = days.find((d) => {
      if (!d.broadcastStartTime) return false;
      const startSec = timeToSec(d.broadcastStartTime);
      if (!d.broadcastEndTime) return actualSec >= startSec; // no configured end — never before start
      let windowLen = timeToSec(d.broadcastEndTime) + GRACE_AFTER_END_SEC - startSec;
      if (windowLen < 0) windowLen += 86400; // window wraps past midnight
      const diff = ((actualSec - startSec) % 86400 + 86400) % 86400;
      return diff <= windowLen;
    });
    if (!day) return null; // outside every session's broadcast window — treat as a test, ignore
    const dayId = day.id;

    const slots = await prisma.lineupSlot.findMany({
      where: { dayId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, slotType: true, durationSec: true, startTimecode: true, endTimecode: true,
        parentSlotId: true, actualBroadcastAt: true, actualDurationSec: true,
        lesson: { select: { startTimecode: true, endTimecode: true, videoDurationSec: true } },
      },
    });
    const windows = computeSlotWindows(slots, day.broadcastStartTime ?? "03:00");
    const bestId = pickLiveSlot(slots, windows, isoToIsraelSec(startAt));
    if (!bestId) return null;
    await prisma.$executeRaw`
      UPDATE "LineupSlot"
      SET actualBroadcastAt = ${startAt}, actualDurationSec = ${durationSec ?? null}, updatedAt = ${now2}
      WHERE id = ${bestId}
    `;
    return bestId;
  } catch (e) {
    console.error("[playout] saveActualBroadcastToSlot:", e);
    return null;
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
    // clipName is accepted but purely a display/debug label — Companion doesn't send a
    // usable identifier, and nothing here matches a slot by it. slotId is used only by
    // manual operator overrides, which already know the exact slot (no matching needed).
    const { clipName, durationSec, actualStartAt, manual, slotId } = body as {
      clipName?: string; durationSec?: number; actualStartAt?: string; manual?: boolean; slotId?: string;
    };

    const startAt = actualStartAt ?? new Date().toISOString();

    // Manual operator adjustments only save to the slot — they don't touch PlayoutNowPlaying
    // so the LIVE badge is not affected. Only Companion-triggered calls update live state.
    if (manual) {
      if (!slotId) return NextResponse.json({ error: "slotId required for manual updates" }, { status: 400 });
      saveActualBroadcastToSlot(startAt, durationSec, slotId);
      return NextResponse.json({ actualStartAt: startAt, durationSec: durationSec ?? null });
    }

    // For Companion calls: check if the same clip is already playing (its actualStartAt,
    // the real clip start time, stays identical across re-POSTs of one still-playing clip).
    // If so, preserve actualStartAt so duration calculations remain correct even when
    // Companion re-POSTs every ~30s.
    const existing = await prisma.playoutNowPlaying.findUnique({ where: { id: "current" } });
    const isSameClip = existing && Math.abs(new Date(existing.actualStartAt).getTime() - new Date(startAt).getTime()) < 5000;

    if (isSameClip) {
      // Same clip re-POST: only refresh durationSec + updatedAt (for TTL), keep actualStartAt
      const record = await prisma.playoutNowPlaying.update({
        where: { id: "current" },
        data: { durationSec: durationSec ?? null },
      });
      return NextResponse.json(record);
    }

    // New clip: resolve the slot first so we can pin it for the eventual stop event,
    // then persist both the slot's actual data and the resolved id together.
    const matchedSlotId = await saveActualBroadcastToSlot(startAt, durationSec);
    const record = await prisma.playoutNowPlaying.upsert({
      where: { id: "current" },
      create: { id: "current", clipName: clipName ?? "", actualStartAt: startAt, durationSec: durationSec ?? null, matchedSlotId },
      update: { clipName: clipName ?? "", actualStartAt: startAt, durationSec: durationSec ?? null, matchedSlotId },
    });
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
      // Pass matchedSlotId so the stop event updates the exact same slot the start event
      // resolved, rather than re-running the match (which could otherwise now pick a
      // different still-unplayed slot whose window also overlaps).
      await saveActualBroadcastToSlot(row.actualStartAt, computedDurationSec, row.matchedSlotId);
    }
    await prisma.playoutNowPlaying.deleteMany({ where: { id: "current" } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
