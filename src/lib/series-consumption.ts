import { PrismaClient, Lesson, LessonPart } from "@prisma/client";
import { timecodeToSeconds } from "@/lib/timecodes";

const FULLY_CONSUMED_EPSILON_SEC = 15;

type LessonWithParts = Lesson & { parts: LessonPart[] };

function lessonEffectiveRange(lesson: Lesson): { startSec: number; endSec: number } {
  if (lesson.startTimecode && lesson.endTimecode) {
    return { startSec: timecodeToSeconds(lesson.startTimecode), endSec: timecodeToSeconds(lesson.endTimecode) };
  }
  return { startSec: 0, endSec: lesson.videoDurationSec ?? 0 };
}

/** Ranks a lesson for "continuous" sequencing. collectionOrder (the lesson's position within
 *  the KabbalaMedia collection it was imported from) is a more reliable sequence signal than
 *  dates when present — recordingDate/broadcastDate can be missing or duplicated across many
 *  lessons (e.g. a placeholder date), which silently breaks pure date sorting. collectionOrder
 *  values are always small integers, so they naturally sort before any real date's millisecond
 *  timestamp without needing an explicit offset — but they're only meaningfully comparable to
 *  other lessons imported from the *same* collection. */
function lessonOrderKey(lesson: Lesson): number {
  return lesson.collectionOrder ?? lesson.broadcastDate?.getTime() ?? lesson.recordingDate?.getTime() ?? Infinity;
}

function partRange(part: LessonPart): { startSec: number; endSec: number } | null {
  if (!part.startTimecode || !part.endTimecode) return null;
  const startSec = timecodeToSeconds(part.startTimecode);
  const endSec = timecodeToSeconds(part.endTimecode);
  return endSec > startSec ? { startSec, endSec } : null;
}

export interface NextLessonResult {
  lesson: Lesson;
  /** Which part is being scheduled, or null for a lesson with no parts (old whole-lesson behavior). */
  part: LessonPart | null;
  /** Seconds into the lesson's/part's effective range already aired — 0 unless resuming a
   *  partially-aired no-parts lesson. For a part, this always equals the part's own start —
   *  parts are atomic, either aired or not, never partially resumed mid-part. */
  resumeFromSec: number;
  /** End of the range to schedule — the part's own end when `part` is set, otherwise the
   *  lesson's raw end. Always use this instead of re-deriving from the lesson alone: for a
   *  multi-part lesson the lesson's own timecodes don't reflect any single part's boundaries. */
  endSec: number;
  /** Whether an article_reading slot already exists for this lesson (so a resumed lesson isn't re-scheduled). */
  alreadyReadArticle: boolean;
}

/** Has this specific part already aired (a LineupSlot referencing it exists)? Parts are atomic —
 *  scheduled or not — unlike a no-parts lesson, which can be resumed mid-way. */
async function isPartUsed(
  prisma: PrismaClient,
  partId: string,
  excludeDayId?: string | null
): Promise<boolean> {
  const count = await prisma.lineupSlot.count({
    where: { lessonPartId: partId, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
  });
  return count > 0;
}

/** A lesson (or a specific part of one) from this series explicitly assigned to broadcast on
 *  this exact date (e.g. imported from a curriculum/planning sheet) — checked first by both
 *  continuous and pickable resolution, regardless of series mode, since an explicit date
 *  assignment is a stronger signal than either sequential position or duration-fit ranking.
 *  For a lesson with parts, each part's *own* broadcastDate is checked (a multi-part lesson's
 *  own top-level broadcastDate is normally unset — the parts carry per-session dates instead).
 *  Returns null if nothing is assigned for this date, or if the assigned one already aired. */
export async function findLessonAssignedForDate(
  prisma: PrismaClient,
  seriesId: string,
  date: Date,
  excludeDayId?: string | null
): Promise<{ lesson: Lesson; part: LessonPart | null } | null> {
  const targetTime = date.getTime();
  const candidates = await prisma.lesson.findMany({
    where: { seriesId, approvalStatus: { not: "used" } },
    include: { parts: { orderBy: { partNumber: "asc" } } },
  }) as LessonWithParts[];

  for (const lesson of candidates) {
    if (lesson.parts.length > 0) {
      for (const part of lesson.parts) {
        if (part.broadcastDate?.getTime() !== targetTime) continue;
        if (!partRange(part)) continue;
        if (await isPartUsed(prisma, part.id, excludeDayId)) continue;
        return { lesson, part };
      }
      continue;
    }
    if (lesson.broadcastDate?.getTime() !== targetTime) continue;
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
    if (consumedTo >= endSec - FULLY_CONSUMED_EPSILON_SEC) continue;
    return { lesson, part: null };
  }
  return null;
}

/** The next lesson (or lesson part) in a "continuous" series: ordered by broadcastDate — the
 *  planned sequence position (e.g. imported from a curriculum sheet), which is authoritative
 *  over recordingDate. recordingDate reflects when a lecture was historically recorded, not
 *  where it sits in the study sequence - the same passage is sometimes re-recorded on a later
 *  date, and unrelated passages can be recorded out of curriculum order, so sorting by it
 *  directly produces the wrong sequence. Falls back to recordingDate only for lessons/parts
 *  that have no broadcastDate at all.
 *
 *  A lesson with parts contributes one candidate per part (bounded by that part's own IN/OUT,
 *  sorted by the part's own broadcastDate), each atomically used-or-not. A lesson with no parts
 *  contributes a single candidate spanning its raw range, resumable mid-way exactly as before
 *  (derived from LineupSlot history, not a stored cursor, so it can never desync from what
 *  actually happened) — this keeps existing continuous series (e.g. TES, chopped by day-sized
 *  duration cuts rather than pre-defined parts) working unchanged.
 *
 *  If `targetDate` (the day actually being built) is given, a candidate already planned for
 *  exactly that date takes priority over "whatever's next in sequence" - the curriculum sheet
 *  is explicit about which date a part belongs to, so that's a stronger signal than sequential
 *  position alone (e.g. catches up correctly even if earlier dates were skipped for unrelated
 *  reasons). */
export async function getNextLessonForSeries(
  prisma: PrismaClient,
  seriesId: string,
  targetDate?: Date | null,
  excludeDayId?: string | null
): Promise<NextLessonResult | null> {
  const lessons = await prisma.lesson.findMany({
    where: { seriesId, approvalStatus: { not: "used" } },
    include: { parts: { orderBy: { partNumber: "asc" } } },
  }) as LessonWithParts[];
  if (lessons.length === 0) return null;

  interface Candidate {
    lesson: LessonWithParts;
    part: LessonPart | null;
    sortKey: number;
    tieBreakTC: string;
  }

  const candidates: Candidate[] = [];
  for (const lesson of lessons) {
    if (lesson.parts.length > 0) {
      for (const part of lesson.parts) {
        if (!partRange(part)) continue;
        candidates.push({
          lesson,
          part,
          sortKey: part.broadcastDate?.getTime() ?? lessonOrderKey(lesson),
          tieBreakTC: part.startTimecode ?? "",
        });
      }
    } else {
      candidates.push({
        lesson,
        part: null,
        sortKey: lessonOrderKey(lesson),
        tieBreakTC: lesson.startTimecode ?? "",
      });
    }
  }

  candidates.sort((a, b) => {
    const diff = a.sortKey - b.sortKey;
    if (diff !== 0) return diff;
    const tcDiff = a.tieBreakTC.localeCompare(b.tieBreakTC);
    if (tcDiff !== 0) return tcDiff;
    return a.lesson.id.localeCompare(b.lesson.id);
  });

  // No-parts lessons resume mid-way, tracked from real slot history (same as before parts existed).
  const noPartsLessonIds = candidates.filter((c) => !c.part).map((c) => c.lesson.id);
  const slotsForNoPartsLessons = noPartsLessonIds.length > 0
    ? await prisma.lineupSlot.findMany({
        where: { lessonId: { in: noPartsLessonIds }, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
        select: { lessonId: true, startTimecode: true, endTimecode: true },
      })
    : [];
  const lessonsById = new Map(candidates.filter((c) => !c.part).map((c) => [c.lesson.id, c.lesson]));
  const maxEndByLessonId = new Map<string, number>();
  for (const slot of slotsForNoPartsLessons) {
    if (!slot.lessonId) continue;
    const lesson = lessonsById.get(slot.lessonId);
    if (!lesson) continue;
    const { startSec: lessonStart, endSec: lessonEnd } = lessonEffectiveRange(lesson);
    const slotEnd = slot.startTimecode && slot.endTimecode ? timecodeToSeconds(slot.endTimecode) : lessonEnd;
    const prev = maxEndByLessonId.get(slot.lessonId) ?? lessonStart;
    maxEndByLessonId.set(slot.lessonId, Math.max(prev, slotEnd));
  }

  async function resultFor(c: Candidate): Promise<NextLessonResult | null> {
    if (c.part) {
      const range = partRange(c.part)!;
      if (await isPartUsed(prisma, c.part.id, excludeDayId)) return null;
      const alreadyReadArticle =
        (await prisma.lineupSlot.count({ where: { lessonId: c.lesson.id, slotType: "article_reading" } })) > 0;
      return { lesson: c.lesson, part: c.part, resumeFromSec: range.startSec, endSec: range.endSec, alreadyReadArticle };
    }
    const { startSec, endSec } = lessonEffectiveRange(c.lesson);
    const consumedTo = maxEndByLessonId.get(c.lesson.id) ?? startSec;
    if (consumedTo >= endSec - FULLY_CONSUMED_EPSILON_SEC) return null; // fully aired
    const alreadyReadArticle =
      (await prisma.lineupSlot.count({ where: { lessonId: c.lesson.id, slotType: "article_reading" } })) > 0;
    return { lesson: c.lesson, part: null, resumeFromSec: consumedTo, endSec, alreadyReadArticle };
  }

  if (targetDate != null) {
    const assigned = await findLessonAssignedForDate(prisma, seriesId, targetDate, excludeDayId);
    if (assigned) {
      const c: Candidate = assigned.part
        ? { lesson: assigned.lesson as LessonWithParts, part: assigned.part, sortKey: 0, tieBreakTC: "" }
        : { lesson: assigned.lesson as LessonWithParts, part: null, sortKey: 0, tieBreakTC: "" };
      const result = await resultFor(c);
      if (result) return result;
      // Planned for this date but already fully aired - fall through to sequential order below.
    }
  }

  // Resume priority: once a multi-part lesson has begun airing, its next unaired part takes
  // priority over jumping to a different lesson — the parts of one lesson are meant to be
  // watched in order, back to back, regardless of how the wider series would otherwise sort
  // (e.g. other lessons with earlier or missing dates shouldn't cut in line mid-lesson).
  const seenLessonIds = new Set<string>();
  for (const c of candidates) {
    if (seenLessonIds.has(c.lesson.id)) continue;
    seenLessonIds.add(c.lesson.id);
    if (c.lesson.parts.length === 0) continue;
    let anyPartUsed = false;
    for (const part of c.lesson.parts) {
      if (await isPartUsed(prisma, part.id, excludeDayId)) { anyPartUsed = true; break; }
    }
    if (!anyPartUsed) continue;
    for (const part of c.lesson.parts) {
      const range = partRange(part);
      if (!range) continue;
      if (await isPartUsed(prisma, part.id, excludeDayId)) continue;
      const alreadyReadArticle =
        (await prisma.lineupSlot.count({ where: { lessonId: c.lesson.id, slotType: "article_reading" } })) > 0;
      return { lesson: c.lesson, part, resumeFromSec: range.startSec, endSec: range.endSec, alreadyReadArticle };
    }
    // All parts of this in-progress lesson are used after all - nothing left to resume here.
  }

  for (const c of candidates) {
    const result = await resultFor(c);
    if (result) return result;
  }
  return null; // series fully consumed
}

export interface PickableCandidate {
  lesson: Lesson;
  /** Which part this candidate represents, or null for a lesson with no parts. */
  part: LessonPart | null;
  totalSec: number;
  diffSec: number; // signed: totalSec - remainingSec
}

/** Ranked (never auto-picked) candidates for a "pickable" series: unused, approved lessons/parts
 *  ordered by how closely (video + article reading time) matches whatever time is left in the
 *  day. A lesson with parts contributes one candidate per not-yet-aired part, bounded by that
 *  part's own cut — not the whole video — and tracked as used per-part (via LineupSlot.lessonPartId)
 *  rather than per-lesson, so scheduling part 1 doesn't hide part 2 from future suggestions. The
 *  article's reading time is only added to whichever part would be the first one aired (parts
 *  already aired, or offered earlier in this same list, don't repeat it) — a simplification since
 *  there's one shared article per lesson, not per part. */
export async function getBestFitCandidates(
  prisma: PrismaClient,
  seriesId: string,
  remainingSec: number,
  limit = 5,
  excludeDayId?: string | null
): Promise<PickableCandidate[]> {
  const lessons = await prisma.lesson.findMany({
    where: { seriesId, approvalStatus: "approved" },
    include: { parts: { orderBy: { partNumber: "asc" } } },
  }) as LessonWithParts[];
  if (lessons.length === 0) return [];

  const lessonIds = lessons.map((l) => l.id);
  const usedSlots = await prisma.lineupSlot.findMany({
    where: { lessonId: { in: lessonIds }, ...(excludeDayId ? { dayId: { not: excludeDayId } } : {}) },
    select: { lessonId: true, lessonPartId: true },
  });
  const usedLessonIds = new Set(usedSlots.map((s) => s.lessonId).filter((id): id is string => !!id));
  const usedPartIds = new Set(usedSlots.map((s) => s.lessonPartId).filter((id): id is string => !!id));

  const scored: PickableCandidate[] = [];
  for (const lesson of lessons) {
    if (lesson.parts.length === 0) {
      if (usedLessonIds.has(lesson.id)) continue;
      if (lesson.videoDurationSec == null) continue;
      const totalSec = lesson.videoDurationSec + (lesson.articleReadingSec ?? 0);
      scored.push({ lesson, part: null, totalSec, diffSec: totalSec - remainingSec });
      continue;
    }
    let articleAlreadyCovered = false;
    for (const part of lesson.parts) {
      if (usedPartIds.has(part.id)) { articleAlreadyCovered = true; continue; }
      const range = partRange(part);
      if (!range) continue;
      const cutSec = range.endSec - range.startSec;
      const totalSec = cutSec + (articleAlreadyCovered ? 0 : (lesson.articleReadingSec ?? 0));
      scored.push({ lesson, part, totalSec, diffSec: totalSec - remainingSec });
      articleAlreadyCovered = true;
    }
  }
  scored.sort((a, b) => Math.abs(a.diffSec) - Math.abs(b.diffSec));
  return scored.slice(0, limit);
}
