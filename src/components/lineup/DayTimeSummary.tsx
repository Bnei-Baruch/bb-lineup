import { formatDurationSec } from "@/lib/time";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { timeToSeconds } from "@/lib/day-budget";
import { addSecondsToTime } from "@/lib/timecodes";
import { SlotWithLesson } from "@/types";

interface DayTimeSummaryProps {
  slots: SlotWithLesson[];
  startTime?: string;
  endTime?: string;
  startIndex?: number | null;
  cutoffIndex?: number | null;
}

// Nested children don't add to the parent's time budget — only top-level slots count.
function slotDur(slot: SlotWithLesson): number {
  if (slot.parentSlotId) return 0;
  return slotEffectiveDuration(slot);
}

export function DayTimeSummary({ slots, startTime, endTime, startIndex, cutoffIndex }: DayTimeSummaryProps) {
  const from = startIndex ?? 0;
  const contentSlots = cutoffIndex != null ? slots.slice(from, cutoffIndex) : slots.slice(from);

  let total = 0;
  for (const slot of contentSlots) total += slotDur(slot);

  if (slots.length === 0) return null;

  // Pre-content: slots before the תחילת תוכן marker
  let preContentSec = 0;
  for (const slot of slots.slice(0, from)) preContentSec += slotDur(slot);

  // Target = broadcast window − pre-content (= time available for content)
  let targetSec: number | null = null;
  if (startTime && endTime) {
    let window = timeToSeconds(endTime) - timeToSeconds(startTime);
    if (window < 0) window += 24 * 3600;
    targetSec = window - preContentSec;
  }

  const diff = targetSec !== null ? total - targetSec : null;
  const isOver = diff !== null && diff > 0;
  const isUnder = diff !== null && diff < 0;

  // End timestamp = when the content section finishes on the clock
  const endTimestamp = startTime ? addSecondsToTime(startTime, preContentSec + total) : null;

  return (
    <div className="px-3 py-2 bg-muted border-t border-border text-sm font-medium text-muted-foreground flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 tabular-nums">
        <span>סה״כ</span>
        {endTimestamp && (
          <span className="text-foreground font-semibold">{endTimestamp}</span>
        )}
      </div>
      <div className="flex items-center gap-4 tabular-nums">
        <span className="font-semibold text-foreground">{formatDurationSec(total)}</span>
        {isOver && (
          <span className="text-red-500 font-semibold">
            +{formatDurationSec(diff!)} חריגה
          </span>
        )}
        {isUnder && (
          <span className="text-green-600 font-semibold">
            {formatDurationSec(-diff!)} נותר
          </span>
        )}
        {diff === 0 && (
          <span className="text-green-600 font-semibold">בדיוק!</span>
        )}
      </div>
    </div>
  );
}
