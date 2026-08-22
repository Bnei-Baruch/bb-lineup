import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeRemainingForPickableSec, distributeSlack } from "@/lib/day-budget";
import { getNextLessonForSeries, getBestFitCandidates, findLessonAssignedForDate, NextLessonResult, PickableCandidate } from "@/lib/series-consumption";
import { secondsToTimecode, timecodeToSeconds } from "@/lib/timecodes";
import { dayDate } from "@/lib/dates";
import { TemplateItemV2, DynamicLessonTemplateItem } from "@/types";

type LegacyTemplateSlot = {
  type: string; slotType?: string; componentId?: string; label?: string;
  durationSec?: number; startTimecode?: string; endTimecode?: string; partNumber?: number;
  narratorScript?: string; transitionType?: string; mediaCode?: string;
  language?: string; hasSubtitles?: boolean; hasWorkshopQuestions?: boolean; notes?: string;
};
type TemplateSlot = TemplateItemV2 | LegacyTemplateSlot;

function isV2(item: TemplateSlot): item is TemplateItemV2 {
  return "kind" in item;
}

// Pre-resolved data needed both to preview an item and, if confirmed, to commit it.
type ResolvedItem =
  | { index: number; kind: "fixed"; slotType: string; durationSec: number; partNumber: number | null }
  | { index: number; kind: "legacy"; slotType: string; durationSec: number; partNumber: number | null }
  | { index: number; kind: "live"; slotType: string; durationSec: number; label?: string }
  | { index: number; kind: "continuous"; seriesId: string; next: NextLessonResult | null }
  | { index: number; kind: "pickable"; seriesId: string; part?: "article" | "video"; candidates: PickableCandidate[]; assignedLessonId: string | null }
  | { index: number; kind: "pickable-linked"; seriesId: string; linkedIndex: number };

async function resolveAll(
  templateSlots: TemplateSlot[],
  broadcastStartTime: string,
  broadcastEndTime: string | null,
  contentStartIndex: number | null,
  contentCutoffIndex: number | null,
  targetDate: Date | null
): Promise<{ resolved: ResolvedItem[]; remainingForPickableSec: number | null; liveInWindow: { index: number; authoredSec: number }[] }> {
  const resolved: ResolvedItem[] = [];
  // Matches DayTimeSummary exactly: pre-content time reduces the window, content-window time is
  // compared against what's left, and anything at/after the cutoff is excluded from both sides.
  const from = contentStartIndex ?? 0;
  const to = contentCutoffIndex ?? templateSlots.length;
  let preContentSec = 0;
  let fixedItemsSec = 0;
  let continuousActualSec = 0;
  let liveAuthoredSec = 0;
  const pendingPickable: { index: number; item: DynamicLessonTemplateItem }[] = [];
  const articleIndexBySeriesId = new Map<string, number>();
  const liveInWindow: { index: number; authoredSec: number }[] = [];

  function addSec(index: number, sec: number, bucket: "fixed" | "continuous" = "fixed") {
    if (index < from) {
      preContentSec += sec;
    } else if (index < to) {
      if (bucket === "continuous") continuousActualSec += sec;
      else fixedItemsSec += sec;
    }
    // index >= to: excluded entirely, same as DayTimeSummary
  }

  for (let index = 0; index < templateSlots.length; index++) {
    const item = templateSlots[index];

    if (!isV2(item)) {
      // Legacy shape (type: "fixed"|"lesson"|"article") - preserved as-is, not resolved dynamically.
      let sec = 0;
      if (item.type === "fixed") {
        const component = item.componentId ? await prisma.lineupComponent.findUnique({ where: { id: item.componentId } }) : null;
        sec = component?.defaultDurationSec ?? item.durationSec ?? 0;
        addSec(index, sec);
      }
      resolved.push({ index, kind: "legacy", slotType: item.slotType ?? "custom", durationSec: sec, partNumber: item.partNumber ?? null });
      continue;
    }

    if (item.kind === "fixed") {
      const component = item.componentId ? await prisma.lineupComponent.findUnique({ where: { id: item.componentId } }) : null;
      const sec = component?.defaultDurationSec ?? item.durationSec ?? 0;
      addSec(index, sec);
      resolved.push({ index, kind: "fixed", slotType: component?.slotType ?? item.slotType, durationSec: sec, partNumber: item.partNumber ?? null });
      continue;
    }

    if (item.contentType === "live") {
      resolved.push({ index, kind: "live", slotType: item.slotType, durationSec: item.plannedDurationSec, label: item.label });
      if (index < from) {
        preContentSec += item.plannedDurationSec;
      } else if (index < to) {
        liveAuthoredSec += item.plannedDurationSec;
        liveInWindow.push({ index, authoredSec: item.plannedDurationSec });
      }
      continue;
    }

    // contentType === "lesson"
    if (item.part === "video" && articleIndexBySeriesId.has(item.seriesId)) {
      // The article half (earlier in this same template) already searched/will search for a
      // candidate whose combined video+article time fits the budget - this half just reuses
      // whatever gets chosen there, so it contributes nothing further to the budget itself.
      resolved.push({ index, kind: "pickable-linked", seriesId: item.seriesId, linkedIndex: articleIndexBySeriesId.get(item.seriesId)! });
      continue;
    }

    const series = await prisma.series.findUnique({ where: { id: item.seriesId } });
    if (!series) continue;

    if (series.consumptionMode === "continuous") {
      const next = await getNextLessonForSeries(prisma, item.seriesId, targetDate);
      resolved.push({ index, kind: "continuous", seriesId: item.seriesId, next });
      if (next) {
        const { startSec, endSec } = lessonEffectiveRange(next.lesson);
        addSec(index, Math.max(0, endSec - Math.max(next.resumeFromSec, startSec)), "continuous");
      }
      continue;
    }

    // pickable - defer ranking until the remaining budget is known (self-contained item, or the
    // "article" half of a split pair; either way this is where the real search happens). But an
    // explicit date assignment (checked regardless of series mode) still wins over ranking.
    const assignedLesson = targetDate ? await findLessonAssignedForDate(prisma, item.seriesId, targetDate) : null;
    pendingPickable.push({ index, item });
    resolved.push({ index, kind: "pickable", seriesId: item.seriesId, part: item.part, candidates: [], assignedLessonId: assignedLesson?.id ?? null });
    if (item.part === "article") articleIndexBySeriesId.set(item.seriesId, index);
  }

  const remainingForPickableSec = broadcastEndTime
    ? computeRemainingForPickableSec({ broadcastStartTime, broadcastEndTime, preContentSec, fixedItemsSec, continuousActualSec, liveAuthoredSec })
    : null;

  for (const { index, item } of pendingPickable) {
    const entry = resolved.find((r) => r.index === index);
    if (!entry || entry.kind !== "pickable") continue;
    const candidates = remainingForPickableSec != null
      ? await getBestFitCandidates(prisma, item.seriesId, remainingForPickableSec)
      : [];
    if (entry.assignedLessonId) {
      const alreadyIncluded = candidates.some((c) => c.lesson.id === entry.assignedLessonId);
      if (!alreadyIncluded) {
        const assignedLesson = await prisma.lesson.findUnique({ where: { id: entry.assignedLessonId } });
        if (assignedLesson) {
          const totalSec = (assignedLesson.videoDurationSec ?? 0) + (assignedLesson.articleReadingSec ?? 0);
          candidates.unshift({ lesson: assignedLesson, totalSec, diffSec: totalSec - (remainingForPickableSec ?? 0) });
        }
      } else {
        // Bubble the assigned one to the front even if the ranking already found it further down.
        candidates.sort((a, b) => (a.lesson.id === entry.assignedLessonId ? -1 : b.lesson.id === entry.assignedLessonId ? 1 : 0));
      }
    }
    entry.candidates = candidates;
  }

  return { resolved, remainingForPickableSec, liveInWindow };
}

function lessonEffectiveRange(lesson: { startTimecode: string | null; endTimecode: string | null; videoDurationSec: number | null }) {
  if (lesson.startTimecode && lesson.endTimecode) {
    return { startSec: timecodeToSeconds(lesson.startTimecode), endSec: timecodeToSeconds(lesson.endTimecode) };
  }
  return { startSec: 0, endSec: lesson.videoDurationSec ?? 0 };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dayId, clearExisting = false, dryRun = false, resolutions = {} } = await req.json();

  const rows = await prisma.$queryRaw<{ dayTemplate: string; broadcastStartTime: string; broadcastEndTime: string | null }[]>`
    SELECT dayTemplate, broadcastStartTime, broadcastEndTime FROM "LineupRuleSet" WHERE id = ${id}
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { dayTemplate, broadcastStartTime, broadcastEndTime } = rows[0];

  const day = await prisma.lineupDay.findUnique({ where: { id: dayId }, select: { dayOfWeek: true, lineup: { select: { weekStart: true } } } });
  const targetDate = day ? dayDate(day.lineup.weekStart, day.dayOfWeek) : null;

  let templateSlots: TemplateSlot[];
  let templateStartIndex: number | null = null;
  let templateCutoffIndex: number | null = null;
  try {
    const parsed = JSON.parse(dayTemplate);
    if (Array.isArray(parsed)) {
      templateSlots = parsed;
    } else {
      templateSlots = parsed?.slots ?? [];
      templateStartIndex = parsed?.contentStartIndex ?? null;
      templateCutoffIndex = parsed?.contentCutoffIndex ?? null;
    }
  } catch {
    return NextResponse.json({ error: "Invalid template" }, { status: 500 });
  }

  const { resolved, remainingForPickableSec, liveInWindow } = await resolveAll(
    templateSlots, broadcastStartTime, broadcastEndTime, templateStartIndex, templateCutoffIndex, targetDate
  );

  if (dryRun) {
    // Serialize just what the preview UI needs - avoid shipping full Lesson/Prisma rows.
    const preview = await Promise.all(resolved.map(async (r) => {
      if (r.kind === "fixed" || r.kind === "legacy") {
        return { index: r.index, kind: r.kind, slotType: r.slotType, durationSec: r.durationSec, partNumber: r.partNumber };
      }
      if (r.kind === "live") return { index: r.index, kind: r.kind, slotType: r.slotType, durationSec: r.durationSec, label: r.label };
      if (r.kind === "continuous") {
        if (!r.next) return { index: r.index, kind: r.kind, seriesId: r.seriesId, next: null };
        const { startSec, endSec } = lessonEffectiveRange(r.next.lesson);
        return {
          index: r.index, kind: r.kind, seriesId: r.seriesId,
          next: {
            lessonId: r.next.lesson.id, sourceRef: r.next.lesson.sourceRef,
            recordingDate: r.next.lesson.recordingDate?.toISOString().slice(0, 10) ?? null,
            resumeFromSec: r.next.resumeFromSec, alreadyReadArticle: r.next.alreadyReadArticle,
            startSec, endSec, partDurationSec: Math.max(0, endSec - Math.max(r.next.resumeFromSec, startSec)),
          },
        };
      }
      if (r.kind === "pickable-linked") {
        return { index: r.index, kind: r.kind, seriesId: r.seriesId, linkedIndex: r.linkedIndex };
      }
      // pickable
      return {
        index: r.index, kind: r.kind, seriesId: r.seriesId, part: r.part, assignedLessonId: r.assignedLessonId,
        candidates: r.candidates.map((c) => ({
          lessonId: c.lesson.id, sourceRef: c.lesson.sourceRef,
          videoDurationSec: c.lesson.videoDurationSec, articleReadingSec: c.lesson.articleReadingSec,
          recordingDate: c.lesson.recordingDate?.toISOString().slice(0, 10) ?? null,
          totalSec: c.totalSec, diffSec: c.diffSec,
        })),
      };
    }));
    return NextResponse.json({ preview, remainingForPickableSec, liveInWindow });
  }

  // ─── Commit ────────────────────────────────────────────────────────────────
  if (clearExisting) {
    await prisma.lineupSlot.deleteMany({ where: { dayId } });
  }
  await prisma.lineupDay.update({ where: { id: dayId }, data: { broadcastStartTime } });
  if (broadcastEndTime !== undefined) {
    await prisma.$executeRaw`UPDATE "LineupDay" SET "broadcastEndTime" = ${broadcastEndTime} WHERE id = ${dayId}`;
  }

  const maxSlot = await prisma.lineupSlot.findFirst({ where: { dayId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const insertOffset = (maxSlot?.sortOrder ?? -1) + 1;
  let sortOrder = insertOffset;
  let created = 0;

  // Once the human's pickable choice(s) are known, whatever's left over (the chosen lesson rarely
  // lands exactly on the target) gets absorbed into the day's live segment(s) instead of just
  // being left as unaccounted slack - a facilitated discussion can genuinely run a bit longer or
  // shorter, unlike a fixed pre-recorded lesson.
  let totalSlackSec = 0;
  if (remainingForPickableSec != null) {
    for (const r of resolved) {
      if (r.kind !== "pickable") continue;
      const chosenId = resolutions[r.index]?.lessonId;
      if (!chosenId) continue;
      const lesson = await prisma.lesson.findUnique({ where: { id: chosenId }, select: { videoDurationSec: true, articleReadingSec: true } });
      if (!lesson) continue;
      const totalSec = (lesson.videoDurationSec ?? 0) + (lesson.articleReadingSec ?? 0);
      totalSlackSec += remainingForPickableSec - totalSec;
    }
  }
  const liveAdjustments = distributeSlack(liveInWindow, totalSlackSec);

  for (const r of resolved) {
    const item = templateSlots[r.index];

    if (r.kind === "legacy" && !isV2(item)) {
      const isPlaceholder = item.type === "lesson" || item.type === "article";
      if (item.componentId) {
        const component = await prisma.lineupComponent.findUnique({ where: { id: item.componentId } });
        if (component) {
          await prisma.lineupSlot.create({
            data: {
              dayId, slotType: component.slotType, componentId: component.id,
              label: component.defaultLabel, durationSec: component.defaultDurationSec,
              narratorScript: component.defaultNarratorScript, lineupLink: component.defaultLineupLink,
              slidesLink: component.defaultSlidesLink, transitionType: component.defaultTransitionType,
              mediaCode: component.defaultMediaCode, language: component.defaultLanguage,
              hasSubtitles: component.defaultHasSubtitles, hasWorkshopQuestions: component.defaultHasWorkshopQuestions,
              notes: component.defaultNotes, partNumber: component.defaultPartNumber, sortOrder,
            },
          });
          sortOrder++; created++;
          continue;
        }
      }
      const slotType = item.type === "article" ? "article_reading" : item.type === "lesson" ? (item.slotType ?? "recorded_lesson") : (item.slotType ?? "narrator_announcement");
      await prisma.lineupSlot.create({
        data: {
          dayId, slotType, label: item.label ?? null,
          durationSec: isPlaceholder ? null : (item.durationSec ?? null),
          startTimecode: isPlaceholder ? null : (item.startTimecode ?? null),
          endTimecode: isPlaceholder ? null : (item.endTimecode ?? null),
          partNumber: item.partNumber ?? null, narratorScript: item.narratorScript ?? null,
          transitionType: item.transitionType ?? null, mediaCode: item.mediaCode ?? null,
          language: item.language ?? null, hasSubtitles: item.hasSubtitles ?? false,
          hasWorkshopQuestions: item.hasWorkshopQuestions ?? false, notes: item.notes ?? null, sortOrder,
        },
      });
      sortOrder++; created++;
      continue;
    }

    if (r.kind === "fixed" && isV2(item) && item.kind === "fixed") {
      if (item.componentId) {
        const component = await prisma.lineupComponent.findUnique({ where: { id: item.componentId } });
        if (component) {
          await prisma.lineupSlot.create({
            data: {
              dayId, slotType: component.slotType, componentId: component.id,
              label: component.defaultLabel, durationSec: component.defaultDurationSec,
              narratorScript: component.defaultNarratorScript, lineupLink: component.defaultLineupLink,
              slidesLink: component.defaultSlidesLink, transitionType: component.defaultTransitionType,
              mediaCode: component.defaultMediaCode, language: component.defaultLanguage,
              hasSubtitles: component.defaultHasSubtitles, hasWorkshopQuestions: component.defaultHasWorkshopQuestions,
              notes: component.defaultNotes, partNumber: component.defaultPartNumber, sortOrder,
            },
          });
          sortOrder++; created++;
          continue;
        }
      }
      await prisma.lineupSlot.create({
        data: {
          dayId, slotType: item.slotType, label: item.label ?? null, durationSec: item.durationSec ?? null,
          startTimecode: item.startTimecode ?? null, endTimecode: item.endTimecode ?? null,
          partNumber: item.partNumber ?? null, narratorScript: item.narratorScript ?? null,
          transitionType: item.transitionType ?? null, mediaCode: item.mediaCode ?? null,
          language: item.language ?? null, hasSubtitles: item.hasSubtitles ?? false,
          hasWorkshopQuestions: item.hasWorkshopQuestions ?? false, notes: item.notes ?? null, sortOrder,
        },
      });
      sortOrder++; created++;
      continue;
    }

    if (r.kind === "live") {
      const durationSec = liveAdjustments.get(r.index) ?? r.durationSec;
      await prisma.lineupSlot.create({
        data: { dayId, slotType: r.slotType, label: r.label ?? null, durationSec: Math.round(durationSec), sortOrder },
      });
      sortOrder++; created++;
      continue;
    }

    if (r.kind === "continuous") {
      const next = r.next;
      const chosenId = resolutions[r.index]?.lessonId ?? next?.lesson.id;
      if (!chosenId) continue; // series exhausted, no override given - nothing to schedule
      const lesson = next && next.lesson.id === chosenId ? next.lesson : await prisma.lesson.findUnique({ where: { id: chosenId } });
      if (!lesson) continue;
      const { startSec, endSec } = lessonEffectiveRange(lesson);
      const resumeFromSec = resolutions[r.index]?.lessonId ? startSec : (next?.resumeFromSec ?? startSec);
      const needsOverride = resumeFromSec > startSec;
      await prisma.lineupSlot.create({
        data: {
          dayId, slotType: "recorded_lesson", lessonId: lesson.id,
          startTimecode: needsOverride ? secondsToTimecode(resumeFromSec) : null,
          endTimecode: needsOverride ? secondsToTimecode(endSec) : null,
          sortOrder,
        },
      });
      sortOrder++; created++;
      continue;
    }

    if (r.kind === "pickable") {
      // Either self-contained (no `part`) or the "article" half of a split pair - the "video"
      // half is a separate `pickable-linked` item (below) that reuses this same choice.
      const chosenId = resolutions[r.index]?.lessonId;
      if (!chosenId) continue; // human hasn't confirmed a candidate yet
      const lesson = await prisma.lesson.findUnique({ where: { id: chosenId } });
      if (!lesson) continue;
      if (r.part !== "video" && lesson.articleReadingSec != null) {
        await prisma.lineupSlot.create({
          data: {
            dayId, slotType: "article_reading", lessonId: lesson.id,
            label: lesson.articleSourceRef ?? lesson.sourceRef,
            studyMaterialSourceId: lesson.articleSourceId, studyMaterialLink: lesson.articleSourceLink,
            durationSec: lesson.articleReadingSec, sortOrder,
          },
        });
        sortOrder++; created++;
      }
      if (r.part !== "article") {
        await prisma.lineupSlot.create({
          data: { dayId, slotType: "recorded_lesson", lessonId: lesson.id, sortOrder },
        });
        sortOrder++; created++;
      }
      continue;
    }

    if (r.kind === "pickable-linked") {
      const chosenId = resolutions[r.linkedIndex]?.lessonId;
      if (!chosenId) continue; // the article half hasn't been confirmed yet
      const lesson = await prisma.lesson.findUnique({ where: { id: chosenId } });
      if (!lesson) continue;
      await prisma.lineupSlot.create({
        data: { dayId, slotType: "recorded_lesson", lessonId: lesson.id, sortOrder },
      });
      sortOrder++; created++;
      continue;
    }
  }

  const contentStartIndex = templateStartIndex != null ? insertOffset + templateStartIndex : null;
  const contentCutoffIndex = templateCutoffIndex != null ? insertOffset + templateCutoffIndex : null;
  if (contentStartIndex != null || contentCutoffIndex != null) {
    await prisma.$executeRaw`
      UPDATE "LineupDay"
      SET "contentStartIndex" = COALESCE(${contentStartIndex}, "contentStartIndex"),
          "contentCutoffIndex" = COALESCE(${contentCutoffIndex}, "contentCutoffIndex")
      WHERE id = ${dayId}
    `;
  }

  return NextResponse.json({ created, contentStartIndex, contentCutoffIndex });
}
