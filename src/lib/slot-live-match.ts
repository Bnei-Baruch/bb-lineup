import { isoToIsraelSec } from "@/lib/dates";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { LESSON_SLOT_TYPES } from "@/types";

/**
 * Parse "HH:MM" or "HH:MM:SS" to seconds-since-midnight. Deliberately a local
 * copy rather than importing from a client component (slot-table-shared.tsx
 * pulls in react-dom) or the route (server-only) — this module is imported by
 * both.
 */
function timeToSec(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

/**
 * Minimal slot shape needed to compute scheduled clock windows. Structurally
 * compatible with the richer SlotWithLesson (client) and the narrower Prisma
 * select the server uses — neither side needs to transform its data to call
 * these functions.
 */
export interface LiveMatchSlot {
  id: string;
  slotType: string;
  parentSlotId: string | null;
  durationSec: number | null;
  startTimecode: string | null;
  endTimecode: string | null;
  actualBroadcastAt: string | null;
  actualDurationSec: number | null;
  lesson: { startTimecode: string | null; endTimecode: string | null; videoDurationSec: number | null } | null;
}

export interface SlotWindow {
  startSec: number;
  endSec: number;
}

/**
 * Walk a day's slots in order and compute each one's scheduled [start, end)
 * window, in accumulating Israel-seconds (not wrapped to a single day — same
 * domain as the running clock this mirrors). A slot with its own confirmed
 * actualBroadcastAt/actualDurationSec uses that real value as its anchor
 * (and to advance the running clock for what follows) instead of a guess.
 * Children inherit their parent's start unless they have their own confirmed
 * time.
 */
export function computeSlotWindows(slots: LiveMatchSlot[], broadcastStartTime: string): SlotWindow[] {
  const windows: SlotWindow[] = new Array(slots.length);
  const parentStartSecs = new Map<string, number>();
  let runningSec = timeToSec(broadcastStartTime);

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const isChild = !!slot.parentSlotId;
    const dur = slot.actualDurationSec ?? slotEffectiveDuration(slot as unknown as Parameters<typeof slotEffectiveDuration>[0]);
    const confirmedStartSec = slot.actualBroadcastAt ? isoToIsraelSec(slot.actualBroadcastAt) : null;

    let startSec: number;
    if (isChild) {
      const parentStart = parentStartSecs.get(slot.parentSlotId!) ?? runningSec;
      startSec = confirmedStartSec !== null ? confirmedStartSec : parentStart;
    } else {
      if (confirmedStartSec !== null) runningSec = confirmedStartSec;
      startSec = runningSec;
    }

    windows[i] = { startSec, endSec: startSec + dur };

    if (!isChild) {
      parentStartSecs.set(slot.id, startSec);
      runningSec = startSec + dur;
    }
  }

  return windows;
}

const DEFAULT_TOLERANCE_SEC = 2;

/**
 * Pick which slot is "live" at targetSec: the not-yet-finished slot whose
 * (tolerance-widened) window contains targetSec. Tolerance scales down for
 * very short slots so it never dominates their own length (an 8s slot gets
 * ±2s, a 4s slot gets ±1s), and back-to-back short slots stay disambiguated.
 * Among multiple matches (e.g. a short child fully inside its parent's much
 * longer window), the narrowest window wins. Returns the slot id, or null if
 * nothing matches.
 *
 * Only a recorded lesson (LESSON_SLOT_TYPES with a lesson attached) is ever
 * eligible — Companion can only report on a real playable video, never on a
 * live in-studio segment (no file, nothing to play). Those live segments'
 * planned durations are rough placeholders for scheduling only; treating them
 * as match candidates lets a Companion event for the lesson that follows get
 * misattributed to the placeholder if it's still "nominally" running per the
 * static plan (this happened in production: a 4-minute placeholder swallowed
 * an event for the 25-minute lesson starting right after it).
 */
export function pickLiveSlot(
  slots: LiveMatchSlot[],
  windows: SlotWindow[],
  targetSec: number,
  toleranceSec: number = DEFAULT_TOLERANCE_SEC
): string | null {
  if (windows.length === 0) return null;

  // windows[] accumulates in Israel-seconds and can exceed 86400 for a
  // session that runs past local midnight; targetSec (a wall-clock read) is
  // always wrapped to [0, 86400). Align the domains before comparing.
  let normalizedTarget = targetSec;
  const firstStart = windows[0].startSec;
  if (normalizedTarget < firstStart - 43200) normalizedTarget += 86400;

  let bestId: string | null = null;
  let bestWidth = Infinity;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!LESSON_SLOT_TYPES.includes(slot.slotType as (typeof LESSON_SLOT_TYPES)[number]) || !slot.lesson) continue;

    const { startSec, endSec } = windows[i];
    const dur = endSec - startSec;
    if (dur <= 0) continue;

    const tol = Math.min(toleranceSec, dur / 4);
    if (normalizedTarget < startSec - tol || normalizedTarget >= endSec + tol) continue;

    if (dur < bestWidth) {
      bestWidth = dur;
      bestId = slot.id;
    }
  }

  return bestId;
}
