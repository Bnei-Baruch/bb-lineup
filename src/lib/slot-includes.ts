import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { fetchTemplates, templateLabel } from "@/lib/kli-client";

/** Supplement slot results with lesson startTimecode/endTimecode via raw SQL.
 *  Needed because the Prisma client may not yet include these columns after a schema change. */
export async function withLessonTimecodes<T extends { lesson: { id: string; startTimecode?: string | null; endTimecode?: string | null } | null }>(
  prisma: PrismaClient,
  slots: T[]
): Promise<T[]> {
  const lessonIds = Array.from(new Set(slots.map((s) => s.lesson?.id).filter(Boolean) as string[]));
  if (lessonIds.length === 0) return slots;
  try {
    const rows = await prisma.$queryRaw<{ id: string; startTimecode: string | null; endTimecode: string | null }[]>`
      SELECT id, startTimecode, endTimecode FROM "Lesson" WHERE id IN (${Prisma.join(lessonIds)})
    `;
    const map = new Map(rows.map((r) => [r.id, r]));
    return slots.map((s) => {
      if (!s.lesson) return s;
      const tc = map.get(s.lesson.id);
      if (!tc) return s;
      return { ...s, lesson: { ...s.lesson, startTimecode: tc.startTimecode, endTimecode: tc.endTimecode } };
    });
  } catch {
    return slots;
  }
}

/** Resolve slot.lessonPart.partType (a study.kli.one template id) to its Hebrew label —
 *  mirrors withLessonTimecodes's shape, called at the same sites. */
export async function withPartTypeLabels<T extends { lessonPart: { partType?: string | null } | null }>(
  slots: T[]
): Promise<T[]> {
  if (!slots.some((s) => s.lessonPart?.partType)) return slots;
  const templates = await fetchTemplates();
  return slots.map((s) => {
    if (!s.lessonPart) return s;
    return { ...s, lessonPart: { ...s.lessonPart, partTypeLabel: templateLabel(templates, s.lessonPart.partType) } };
  });
}

/** Shared Prisma include/select for slots with lessons — used across API routes */
export const slotWithLessonInclude = {
  lesson: {
    select: {
      id: true,
      sourceRef: true,
      articleSourceRef: true,
      narratorName: true,
      recordingDate: true,
      videoDurationSec: true,
      articleReadingMin: true,
      articleReadingSec: true,
      approvalStatus: true,
      tags: true,
      seriesId: true,
      series: { select: { playoutCode: true, consumptionMode: true } },
      kmPageLink: true,
      videoLink: true,
      articleSourceLink: true,
      transcriptionLink: true,
      startTimecode: true,
      endTimecode: true,
    },
  },
  lessonPart: {
    select: {
      id: true,
      partNumber: true,
      startTimecode: true,
      endTimecode: true,
      broadcastDate: true,
      notes: true,
      partType: true,
    },
  },
  component: {
    select: {
      id: true,
      name: true,
      category: true,
      defaultLineupLink: true,
      defaultSlidesLink: true,
    },
  },
  studyMaterialSource: {
    select: {
      bookVolume: true,
      bookPage: true,
      link: true,
    },
  },
} as const;
