import { PrismaClient, Lesson } from "@prisma/client";
import { timecodeToSeconds } from "@/lib/timecodes";

const FULLY_CONSUMED_EPSILON_SEC = 15;

function lessonEffectiveRange(lesson: Lesson): { startSec: number; endSec: number } {
  if (lesson.startTimecode && lesson.endTimecode) {
    return { startSec: timecodeToSeconds(lesson.startTimecode), endSec: timecodeToSeconds(lesson.endTimecode) };
  }
  return { startSec: 0, endSec: lesson.videoDurationSec ?? 0 };
}

export interface NextLessonResult {
  lesson: Lesson;
  /** Seconds into the lesson's effective range already aired — 0 unless resuming a partially-aired lesson. */
  resumeFromSec: number;
  /** Whether an article_reading slot already exists for this lesson (so a resumed lesson isn't re-scheduled). */
  alreadyReadArticle: boolean;
}

/** A lesson from this series explicitly assigned to broadcast on this exact date (e.g. imported
 *  from a curriculum/planning sheet) — checked first by both continuous and pickable resolution,
 *  regardless of series mode, since an explicit date assignment is a stronger signal than either
 *  sequential position or duration-fit ranking. Returns null if none is assigned for this date,
 *  or if the assigned one has already fully aired. */
export async function findLessonAssignedForDate(
  prisma: PrismaClient,
  seriesId: string,
  date: Date,
  excludeDayId?: string | null
): Promise<Lesson | null> {
  const targetTime = date.getTime();
  const candidates = await prisma.lesson.findMany({ where: { seriesId, approvalStatus: { not: "used" }, broadcastDate: date } });
  const lesson = candidates.find((l) => l.broadcastDate?.getTime() === targetTime) ?? null;
  if (!lesson) return null;

  // Exclude the day being (re-)resolved itself - its own existing slots are about to be replaced,
  // not real consumption history, so they must not make an assigned lesson look already-aired.
  const slots = await prisma.lineupSlot.findMany({
    where: { lessonId: lesson.id, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
    select: { startTimecode: true, endTimecode: true },
  });
  const { startSec, endSec } = lessonEffectiveRange(lesson);
  let consumedTo = startSec;
  for (const slot of slots) {
    const slotEnd = slot.startTimecode && slot.endTimecode ? timecodeToSeconds(slot.endTimecode) : endSec;
    consumedTo = Math.max(consumedTo, slotEnd);
  }
  return consumedTo >= endSec - FULLY_CONSUMED_EPSILON_SEC ? null : lesson;
}

/** The next lesson in a "continuous" series: ordered by broadcastDate — the planned sequence
 *  position (e.g. imported from a curriculum sheet), which is authoritative over recordingDate.
 *  recordingDate reflects when a lecture was historically recorded, not where it sits in the
 *  study sequence - the same passage is sometimes re-recorded on a later date, and unrelated
 *  passages can be recorded out of curriculum order, so sorting by it directly produces the wrong
 *  sequence. Falls back to recordingDate only for lessons that have no broadcastDate at all.
 *  Skips any already fully aired - derived from LineupSlot history (not a stored cursor) so it
 *  can never desync from what actually happened.
 *
 *  If `targetDate` (the day actually being built) is given, a lesson already planned for exactly
 *  that date takes priority over "whatever's next in sequence" - the curriculum sheet is explicit
 *  about which date a part belongs to, so that's a stronger signal than sequential position alone
 *  (e.g. catches up correctly even if earlier dates were skipped for unrelated reasons). */
export async function getNextLessonForSeries(
  prisma: PrismaClient,
  seriesId: string,
  targetDate?: Date | null,
  excludeDayId?: string | null
): Promise<NextLessonResult | null> {
  const unsorted = await prisma.lesson.findMany({
    where: { seriesId, approvalStatus: { not: "used" } },
  });
  if (unsorted.length === 0) return null;

  const sortKey = (l: (typeof unsorted)[number]) => l.broadcastDate?.getTime() ?? l.recordingDate?.getTime() ?? Infinity;
  const lessons = [...unsorted].sort((a, b) => {
    const diff = sortKey(a) - sortKey(b);
    if (diff !== 0) return diff;
    const tcDiff = (a.startTimecode ?? "").localeCompare(b.startTimecode ?? "");
    if (tcDiff !== 0) return tcDiff;
    return a.id.localeCompare(b.id);
  });

  const lessonIds = lessons.map((l) => l.id);
  const slots = await prisma.lineupSlot.findMany({
    where: { lessonId: { in: lessonIds }, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
    select: { lessonId: true, startTimecode: true, endTimecode: true },
  });

  const lessonsById = new Map(lessons.map((l) => [l.id, l]));
  const maxEndByLessonId = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.lessonId) continue;
    const lesson = lessonsById.get(slot.lessonId);
    if (!lesson) continue;
    const { startSec: lessonStart, endSec: lessonEnd } = lessonEffectiveRange(lesson);
    const slotEnd = slot.startTimecode && slot.endTimecode ? timecodeToSeconds(slot.endTimecode) : lessonEnd;
    const prev = maxEndByLessonId.get(slot.lessonId) ?? lessonStart;
    maxEndByLessonId.set(slot.lessonId, Math.max(prev, slotEnd));
  }

  async function resultFor(lesson: Lesson): Promise<NextLessonResult | null> {
    const { startSec, endSec } = lessonEffectiveRange(lesson);
    const consumedTo = maxEndByLessonId.get(lesson.id) ?? startSec;
    if (consumedTo >= endSec - FULLY_CONSUMED_EPSILON_SEC) return null; // this one's fully aired
    const alreadyReadArticle =
      (await prisma.lineupSlot.count({ where: { lessonId: lesson.id, slotType: "article_reading" } })) > 0;
    return { lesson, resumeFromSec: consumedTo, alreadyReadArticle };
  }

  if (targetDate != null) {
    const assigned = await findLessonAssignedForDate(prisma, seriesId, targetDate, excludeDayId);
    if (assigned) {
      const result = await resultFor(assigned);
      if (result) return result;
      // Planned for this date but already fully aired - fall through to sequential order below.
    }
  }

  for (const lesson of lessons) {
    const result = await resultFor(lesson);
    if (result) return result;
  }
  return null; // series fully consumed
}

export interface PickableCandidate {
  lesson: Lesson;
  totalSec: number;
  diffSec: number; // signed: totalSec - remainingSec
}

/** Ranked (never auto-picked) candidates for a "pickable" series: unused, approved lessons ordered
 *  by how closely (video + article reading time) matches whatever time is left in the day. */
export async function getBestFitCandidates(
  prisma: PrismaClient,
  seriesId: string,
  remainingSec: number,
  limit = 5,
  excludeDayId?: string | null
): Promise<PickableCandidate[]> {
  const lessons = await prisma.lesson.findMany({
    where: { seriesId, approvalStatus: "approved", videoDurationSec: { not: null } },
  });
  if (lessons.length === 0) return [];

  const lessonIds = lessons.map((l) => l.id);
  const usedSlots = await prisma.lineupSlot.findMany({
    where: { lessonId: { in: lessonIds }, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
    select: { lessonId: true },
    distinct: ["lessonId"],
  });
  const usedIds = new Set(usedSlots.map((s) => s.lessonId));

  const scored: PickableCandidate[] = lessons
    .filter((l) => !usedIds.has(l.id))
    .map((lesson) => {
      const totalSec = (lesson.videoDurationSec ?? 0) + (lesson.articleReadingSec ?? 0);
      return { lesson, totalSec, diffSec: totalSec - remainingSec };
    });
  scored.sort((a, b) => Math.abs(a.diffSec) - Math.abs(b.diffSec));
  return scored.slice(0, limit);
}
