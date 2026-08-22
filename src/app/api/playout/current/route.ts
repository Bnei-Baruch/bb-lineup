import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart, isoToIsraelSec, todayInIsrael } from "@/lib/dates";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { SlotType } from "@/types";

/** Parse "HH:MM" or "HH:MM:SS" to seconds-since-midnight */
function timeToSec(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

/** Circular distance in seconds between two times-of-day (handles wrap past midnight) */
function clockDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 86400 - diff);
}

/**
 * Several slots on the same day can share one playoutCode/mediaCode (e.g. multiple
 * timecode segments cut from the same recorded lesson). Disambiguate instead of writing
 * the same actual data to every matching row:
 *   1. Prefer candidates that haven't already been marked as played (no actualBroadcastAt yet).
 *   2. Among those, pick the one whose *scheduled* clock time is closest to when the clip
 *      actually started.
 */
async function pickBestSlotMatch(dayId: string, candidateIds: string[], startAt: string): Promise<string | null> {
  if (candidateIds.length <= 1) return candidateIds[0] ?? null;

  const day = await prisma.lineupDay.findUnique({ where: { id: dayId }, select: { broadcastStartTime: true } });
  const slots = await prisma.lineupSlot.findMany({
    where: { dayId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, slotType: true, durationSec: true, startTimecode: true, endTimecode: true,
      parentSlotId: true, actualBroadcastAt: true,
      lesson: { select: { startTimecode: true, endTimecode: true, videoDurationSec: true } },
    },
  });

  let running = timeToSec(day?.broadcastStartTime ?? "03:00");
  const scheduledStartSec = new Map<string, number>();
  const alreadyPlayed = new Set<string>();
  for (const slot of slots) {
    const isChild = !!slot.parentSlotId;
    const startSec = isChild ? (scheduledStartSec.get(slot.parentSlotId!) ?? running) : running;
    scheduledStartSec.set(slot.id, startSec);
    if (slot.actualBroadcastAt) alreadyPlayed.add(slot.id);
    if (!isChild) {
      running += slotEffectiveDuration({ ...slot, slotType: slot.slotType as SlotType } as Parameters<typeof slotEffectiveDuration>[0]);
    }
  }

  const unplayed = candidateIds.filter((id) => !alreadyPlayed.has(id));
  const pool = unplayed.length > 0 ? unplayed : candidateIds;

  const actualSec = isoToIsraelSec(startAt);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const id of pool) {
    const sched = scheduledStartSec.get(id);
    if (sched === undefined) continue;
    const dist = clockDistance(sched, actualSec);
    if (dist < bestDist) { bestDist = dist; best = id; }
  }
  return best ?? pool[0] ?? null;
}

/**
 * After recording playout, find the matching slot in today's lineup and persist actual
 * broadcast data. Returns the slot id that was updated (or null if none matched), so the
 * caller can pin that same slot for the corresponding stop event via `knownSlotId`.
 *
 * `knownSlotId` bypasses matching entirely — used when stopping a clip, so the stop event
 * always lands on the exact slot the start event resolved, instead of re-running the
 * (potentially ambiguous) code-based match a second time.
 */
async function saveActualBroadcastToSlot(
  clipName: string, startAt: string, durationSec?: number, knownSlotId?: string | null
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
      return slotsById[0].id;
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
    const candidateIds = Array.from(new Set([...matched, ...matchedByMediaCode].map((s) => s.id)));
    const bestId = await pickBestSlotMatch(dayId, candidateIds, startAt);
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

    // New clip: resolve the slot first so we can pin it for the eventual stop event,
    // then persist both the slot's actual data and the resolved id together.
    const matchedSlotId = await saveActualBroadcastToSlot(clipName, startAt, durationSec);
    const record = await prisma.playoutNowPlaying.upsert({
      where: { id: "current" },
      create: { id: "current", clipName, actualStartAt: startAt, durationSec: durationSec ?? null, matchedSlotId },
      update: { clipName, actualStartAt: startAt, durationSec: durationSec ?? null, matchedSlotId },
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
      // resolved, rather than re-running the code match (which could now pick a different
      // still-unplayed slot sharing the same playoutCode/mediaCode).
      await saveActualBroadcastToSlot(row.clipName, row.actualStartAt, computedDurationSec, row.matchedSlotId);
    }
    await prisma.playoutNowPlaying.deleteMany({ where: { id: "current" } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
