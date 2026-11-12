import { prisma } from "@/lib/prisma";

const SOURCE_ID_RE = /\/sources\/([A-Za-z0-9_-]+)/;

type SlotLike = {
  studyMaterialLink: string | null;
  studyMaterialSourceId: string | null;
  studyMaterialSource: unknown;
  likutimLink?: string | null;
};

/**
 * Slots often carry only a studyMaterialLink (".../sources/<id>") without a
 * studyMaterialSourceId, so the included studyMaterialSource comes back null and
 * consumers lose the book volume/page. Resolve the ArticleSource from the link instead.
 * Also trims likutimLink, which has been saved with stray whitespace.
 */
export async function withSourceFallback<
  S extends SlotLike,
  D extends { slots: S[] },
>(days: D[]): Promise<D[]> {
  const ids = new Set<string>();
  for (const d of days) {
    for (const s of d.slots) {
      if (s.studyMaterialSource) continue;
      const id = s.studyMaterialLink?.match(SOURCE_ID_RE)?.[1];
      if (id) ids.add(id);
    }
  }
  const sources = ids.size
    ? await prisma.articleSource.findMany({
        where: { id: { in: Array.from(ids) } },
        select: { id: true, ref: true, link: true, bookSeries: true, bookVolume: true, bookPage: true },
      })
    : [];
  const byId = new Map(sources.map((s) => [s.id, s]));

  return days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => {
      const id = s.studyMaterialSource ? null : s.studyMaterialLink?.match(SOURCE_ID_RE)?.[1];
      const src = id ? byId.get(id) : undefined;
      return {
        ...s,
        ...(src ? { studyMaterialSource: src } : {}),
        ...(typeof s.likutimLink === "string" ? { likutimLink: s.likutimLink.trim() || null } : {}),
      };
    }),
  }));
}
