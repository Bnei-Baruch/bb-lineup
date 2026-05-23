import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";

export function DayTimeSummary({ slots }: { slots: SlotWithLesson[] }) {
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

  return (
    <div className="px-3 py-2 bg-muted border-t border-border text-sm font-medium text-muted-foreground flex items-center justify-between">
      <span>סה״כ</span>
      <span className="tabular-nums font-semibold text-foreground">{formatDurationSec(total)}</span>
    </div>
  );
}
