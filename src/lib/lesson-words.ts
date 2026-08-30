import { PrismaClient } from "@prisma/client";

/** Resolves the narrator opening/closing words to prefill on a lineup slot from whichever
 *  lesson (or specific part) it's being scheduled for. Prefers LessonPart's own
 *  openingStatement/closingStatement when the slot has a lessonPartId — a multi-part lesson's
 *  per-session words naturally differ part to part, unlike a single-part lesson's one-time
 *  opening/closing, which lives on the Lesson itself. */
export async function resolveLessonWords(
  prisma: PrismaClient,
  lessonId: string | null | undefined,
  lessonPartId: string | null | undefined
): Promise<{ openingWords: string | null; closingWords: string | null }> {
  if (lessonPartId) {
    const part = await prisma.lessonPart.findUnique({
      where: { id: lessonPartId },
      select: { openingStatement: true, closingStatement: true },
    });
    if (part) return { openingWords: part.openingStatement, closingWords: part.closingStatement };
  }
  if (lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { openingStatement: true, closingStatement: true },
    });
    if (lesson) return { openingWords: lesson.openingStatement, closingWords: lesson.closingStatement };
  }
  return { openingWords: null, closingWords: null };
}
