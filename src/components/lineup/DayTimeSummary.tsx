import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";

function timeToSeconds(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return parts[0] * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

function addSeconds(hhmm: string, sec: number): string {
  const total = (timeToSeconds(hhmm) + sec) % (24 * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface DayTimeSummaryProps {
  slots: SlotWithLesson[];
  startTime?: string;
  endTime?: string;
  startIndex?: number | null;
  cutoffIndex?: number | null;
}

export function DayTimeSummary({ slots, startTime, endTime, startIndex, cutoffIndex }: DayTimeSummaryProps) {
  const from = startIndex ?? 0;
  const countedSlots = cutoffIndex != null ? slots.slice(from, cutoffIndex) : slots.slice(from);
  let total = 0;
  for (const slot of countedSlots) {
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

  if (slots.length === 0) return null;


  let targetSec: number | null = null;
  if (startTime && endTime) {
    let diff = timeToSeconds(endTime) - timeToSeconds(startTime);
    if (diff < 0) diff += 24 * 3600; // crosses midnight
    targetSec = diff;
  }

  const diff = targetSec !== null ? total - targetSec : null;
  const isOver = diff !== null && diff > 0;
  const isUnder = diff !== null && diff < 0;

  const endTimestamp = startTime ? addSeconds(startTime, total) : null;

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
