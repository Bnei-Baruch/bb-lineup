import { PrismaClient } from "@prisma/client";
import { getNextLessonForSeries, getBestFitCandidates, NextLessonResult, PickableCandidate } from "@/lib/series-consumption";
import { DynamicLessonTemplateItem, DynamicLiveTemplateItem } from "@/types";

export type ResolvedDynamicItem =
  | { contentType: "live"; slotType: string; durationSec: number; label?: string }
  | { contentType: "lesson"; mode: "continuous"; seriesId: string; next: NextLessonResult | null }
  | { contentType: "lesson"; mode: "pickable"; seriesId: string; candidates: PickableCandidate[] };

/** Resolves one dynamic template item into a preview of what it *would* become — never writes
 *  anything. Live items resolve to their authored estimate; continuous-series items resolve to
 *  the actual next lesson; pickable-series items resolve to ranked candidates. All three are
 *  meant to be shown to a human for confirmation before any LineupSlot is created. */
export async function resolveDynamicItem(
  prisma: PrismaClient,
  item: DynamicLessonTemplateItem | DynamicLiveTemplateItem,
  remainingForPickableSec: number
): Promise<ResolvedDynamicItem> {
  if (item.contentType === "live") {
    return { contentType: "live", slotType: item.slotType, durationSec: item.plannedDurationSec, label: item.label };
  }

  const series = await prisma.series.findUnique({ where: { id: item.seriesId } });
  if (!series) throw new Error(`Series not found: ${item.seriesId}`);

  if (series.consumptionMode === "continuous") {
    const next = await getNextLessonForSeries(prisma, item.seriesId);
    return { contentType: "lesson", mode: "continuous", seriesId: item.seriesId, next };
  }

  const candidates = await getBestFitCandidates(prisma, item.seriesId, remainingForPickableSec);
  return { contentType: "lesson", mode: "pickable", seriesId: item.seriesId, candidates };
}
