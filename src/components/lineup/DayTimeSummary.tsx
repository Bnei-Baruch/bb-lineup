import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";

function timeToSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 3600 + m * 60;
}

interface DayTimeSummaryProps {
  slots: SlotWithLesson[];
  startTime?: string;
  endTime?: string;
}

export function DayTimeSummary({ slots, startTime, endTime }: DayTimeSummaryProps) {
  let total = 0;
  for (const slot of slots) {
    if (slot.slotType === "part_header") continue;
    if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
      if (slot.startTimecode && slot.endTimecode) {
        const dur = timecodeToSeconds(slot.endTimecode) - timecodeToSeconds(slot.startTimecode);
        total += dur > 0 ? dur : (slot.lesson.videoDurationSec ?? 0);
      } else {
        total += slot.lesson.videoDurationSec ?? 0;
      }
    } else {
      total += slot.durationSec ?? 0;
    }
  }

  if (total === 0) return null;

  let targetSec: number | null = null;
  if (startTime && endTime) {
    let diff = timeToSeconds(endTime) - timeToSeconds(startTime);
    if (diff < 0) diff += 24 * 3600; // crosses midnight
    targetSec = diff;
  }

  const diff = targetSec !== null ? total - targetSec : null;
  const isOver = diff !== null && diff > 0;
  const isUnder = diff !== null && diff < 0;

  return (
    <div className="px-3 py-2 bg-muted border-t border-border text-sm font-medium text-muted-foreground flex items-center justify-between gap-4">
      <span>סה״כ</span>
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
