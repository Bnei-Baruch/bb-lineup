import { SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";
import { timecodeToSeconds } from "@/lib/timecodes";

export function slotEffectiveDuration(slot: SlotWithLesson): number {
  if (slot.slotType === "part_header") return 0;
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    const hasSlotTC = slot.startTimecode && slot.endTimecode;
    const inTC = hasSlotTC ? slot.startTimecode : slot.lesson.startTimecode;
    const outTC = hasSlotTC ? slot.endTimecode : slot.lesson.endTimecode;
    if (inTC && outTC) {
      const dur = timecodeToSeconds(outTC) - timecodeToSeconds(inTC);
      if (dur > 0) return dur;
    }
    return slot.lesson.videoDurationSec ?? 0;
  }
  return slot.durationSec ?? 0;
}
