import { prisma } from "@/lib/prisma";
import { dayDate } from "@/lib/dates";

async function getDayDate(dayId: string): Promise<Date> {
  const day = await prisma.lineupDay.findUniqueOrThrow({
    where: { id: dayId },
    select: { dayOfWeek: true, lineup: { select: { weekStart: true } } },
  });
  return dayDate(day.lineup.weekStart, day.dayOfWeek);
}

async function setBroadcastDate(
  lessonId: string | null | undefined,
  lessonPartId: string | null | undefined,
  date: Date | null
) {
  if (lessonPartId) {
    await prisma.lessonPart.update({ where: { id: lessonPartId }, data: { broadcastDate: date } });
  } else if (lessonId) {
    await prisma.lesson.update({ where: { id: lessonId }, data: { broadcastDate: date } });
  }
}

/** Sets the lesson's (or lesson part's) broadcastDate to the date of the lineup day it's now
 *  placed in. Call whenever a slot is created, or re-linked to a lesson/lessonPart, or moved
 *  to another day. Writes to LessonPart when the slot has a lessonPartId — multi-part lessons
 *  carry their per-session date on the part, not the parent lesson. */
export async function syncBroadcastDateOnPlacement(
  dayId: string,
  lessonId: string | null | undefined,
  lessonPartId: string | null | undefined
) {
  if (!lessonId && !lessonPartId) return;
  const date = await getDayDate(dayId);
  await setBroadcastDate(lessonId, lessonPartId, date);
}

/** Call when a slot stops referencing a lesson/part (deleted, moved off it, or swapped out).
 *  If the lesson/part is still scheduled in another slot elsewhere, keeps that placement's
 *  date instead of clearing it. */
export async function syncBroadcastDateOnRemoval(
  lessonId: string | null | undefined,
  lessonPartId: string | null | undefined
) {
  if (!lessonId && !lessonPartId) return;
  const remaining = await prisma.lineupSlot.findFirst({
    where: lessonPartId ? { lessonPartId } : { lessonId },
    select: { day: { select: { dayOfWeek: true, lineup: { select: { weekStart: true } } } } },
  });
  const date = remaining ? dayDate(remaining.day.lineup.weekStart, remaining.day.dayOfWeek) : null;
  await setBroadcastDate(lessonId, lessonPartId, date);
}
