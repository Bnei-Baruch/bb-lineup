import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { Prisma } from "@prisma/client";
import { WeekGrid } from "@/components/lineup/WeekGrid";
import { WeekPicker } from "@/components/lineup/WeekPicker";
import { WeekAIButton } from "@/components/ai/WeekAIButton";
import { ApplyTemplateDialog } from "@/components/lineup/ApplyTemplateDialog";
import { LineupWithDays } from "@/types";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

const weekInclude = {
  days: {
    orderBy: { dayOfWeek: "asc" as const },
    include: {
      slots: {
        orderBy: { sortOrder: "asc" as const },
        include: slotWithLessonInclude,
      },
    },
  },
};

export default async function WeekPage({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;

  const [ruleSets, weekTemplates] = await Promise.all([
    prisma.lineupRuleSet.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, isDefault: true },
    }),
    prisma.weekTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const aiTemplates = ruleSets.map((r) => ({ id: r.id, name: r.name }));

  let lineup = await prisma.lineup.findUnique({
    where: { weekStart: toWeekStart(parseWeekParam(weekStart)) },
    include: weekInclude,
  });

  if (!lineup) {
    lineup = await prisma.lineup.create({
      data: {
        weekStart: toWeekStart(parseWeekParam(weekStart)),
        days: { create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })) },
      },
      include: weekInclude,
    });
  }

  type DayExtra = { id: string; broadcastEndTime: string | null; sessionIndex: number; sessionLabel: string | null; contentStartIndex: number | null; contentCutoffIndex: number | null };
  let extras: DayExtra[] = [];
  try {
    extras = await prisma.$queryRaw<DayExtra[]>`
      SELECT id, broadcastEndTime, sessionIndex, sessionLabel, contentStartIndex, contentCutoffIndex FROM "LineupDay" WHERE "lineupId" = ${lineup.id}
    `;
  } catch {
    try {
      const fallback = await prisma.$queryRaw<{ id: string; broadcastEndTime: string | null }[]>`
        SELECT id, broadcastEndTime FROM "LineupDay" WHERE "lineupId" = ${lineup.id}
      `;
      extras = fallback.map((r) => ({ ...r, sessionIndex: 0, sessionLabel: null, contentStartIndex: null, contentCutoffIndex: null }));
    } catch { /* ignore */ }
  }
  const extrasMap = Object.fromEntries(extras.map((r) => [r.id, r]));

  // Enrich article_reading slots with ArticleSource data via URL
  const weekArticleSlotLinks = lineup.days.flatMap((d) =>
    d.slots
      .filter((s) => s.slotType === "article_reading" && s.studyMaterialLink)
      .map((s) => ({ id: s.id, srcId: s.studyMaterialLink!.match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1] ?? null }))
  );
  const weekUniqueSrcIds = Array.from(new Set(weekArticleSlotLinks.map((a) => a.srcId).filter(Boolean))) as string[];
  const weekArticleSources = weekUniqueSrcIds.length > 0
    ? await prisma.articleSource.findMany({
        where: { id: { in: weekUniqueSrcIds } },
        select: { id: true, bookVolume: true, bookPage: true, link: true },
      })
    : [];
  const weekArtSrcMap = Object.fromEntries(weekArticleSources.map((s) => [s.id, { bookVolume: s.bookVolume, bookPage: s.bookPage, link: s.link }]));
  const weekSlotSrcMap = Object.fromEntries(weekArticleSlotLinks.map((a) => [a.id, a.srcId]));

  // Supplement lesson timecodes (raw SQL — Prisma client may not include these columns yet)
  const allLessonIds = Array.from(new Set(lineup.days.flatMap((d) => d.slots.map((s) => s.lessonId).filter(Boolean) as string[])));
  let lessonTimecodeMap = new Map<string, { startTimecode: string | null; endTimecode: string | null }>();
  if (allLessonIds.length > 0) {
    try {
      const tcRows = await prisma.$queryRaw<{ id: string; startTimecode: string | null; endTimecode: string | null }[]>`
        SELECT id, startTimecode, endTimecode FROM "Lesson" WHERE id IN (${Prisma.join(allLessonIds)})
      `;
      lessonTimecodeMap = new Map(tcRows.map((r) => [r.id, r]));
    } catch { /* ignore — columns not yet present */ }
  }

  const data: LineupWithDays = JSON.parse(JSON.stringify({
    ...lineup,
    weekStart: lineup.weekStart.toISOString().slice(0, 10),
    days: lineup.days.map((d) => ({
      ...d,
      broadcastEndTime: extrasMap[d.id]?.broadcastEndTime ?? null,
      sessionIndex: extrasMap[d.id]?.sessionIndex ?? 0,
      sessionLabel: extrasMap[d.id]?.sessionLabel ?? null,
      contentStartIndex: extrasMap[d.id]?.contentStartIndex ?? null,
      contentCutoffIndex: extrasMap[d.id]?.contentCutoffIndex ?? null,
      slots: d.slots.map((s) => {
        const srcId = weekSlotSrcMap[s.id] ?? null;
        return {
          ...s,
          studyMaterialSource: srcId ? (weekArtSrcMap[srcId] ?? null) : s.studyMaterialSource,
          lesson: s.lesson
            ? { ...s.lesson, recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null, ...lessonTimecodeMap.get(s.lesson.id) }
            : null,
        };
      }),
    })),
  }));

  return (
    <div className="p-4 space-y-4 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lineup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            תוכניות
          </Link>
          <span className="text-muted-foreground">/</span>
          <WeekPicker weekStart={weekStart} />
        </div>
        <div className="flex items-center gap-2">
          <ApplyTemplateDialog weekStart={weekStart} templates={weekTemplates} />
          <WeekAIButton
            weekStart={weekStart}
            ruleSets={ruleSets}
            dayIds={Object.fromEntries(data.days.map((d) => [d.dayOfWeek, d.id]))}
          />
          <Link href="/library" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <BookOpen className="me-2 h-4 w-4" />
            ספרייה
          </Link>
        </div>
      </div>

      <div className="pb-4">
        <WeekGrid lineup={data} templates={aiTemplates} />
      </div>
    </div>
  );
}
