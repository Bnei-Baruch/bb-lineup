import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam, DAY_NAMES, formatDate, dayDate } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { DayView } from "@/components/lineup/DayView";
import { DayWithSlots } from "@/types";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { ChevronRight, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DayViewPage({
  params,
}: {
  params: Promise<{ weekStart: string; dayOfWeek: string }>;
}) {
  const { weekStart, dayOfWeek: dowStr } = await params;
  const dow = parseInt(dowStr);
  const ws = toWeekStart(parseWeekParam(weekStart));

  const lineup = await prisma.lineup.findUnique({
    where: { weekStart: ws },
    include: {
      days: {
        where: { dayOfWeek: dow },
        include: {
          slots: {
            orderBy: { sortOrder: "asc" },
            include: slotWithLessonInclude,
          },
        },
      },
    },
  });

  const dayData = lineup?.days[0];
  if (!dayData) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>לא נמצא יום זה</p>
        <Link href={`/lineup/${weekStart}`} className="text-sm text-blue-600 hover:underline mt-2 block">
          חזרה לשבוע
        </Link>
      </div>
    );
  }

  // Enrich slots with article source volume/page — derive source ID from URL (works for both
  // studyMaterialLink on article_reading slots and articleSourceLink on lesson slots)
  const rawSlotLinks = await prisma.$queryRaw<{ id: string; studyMaterialLink: string | null; lessonId: string | null }[]>`
    SELECT id, studyMaterialLink, lessonId FROM "LineupSlot" WHERE "dayId" = ${dayData.id}
  `;
  const lessonIds = rawSlotLinks.map((r) => r.lessonId).filter(Boolean) as string[];
  const lessonSourceLinks = lessonIds.length > 0
    ? await prisma.lesson.findMany({
        where: { id: { in: lessonIds } },
        select: { id: true, articleSourceLink: true },
      })
    : [];
  const lessonSourceLinkMap = Object.fromEntries(lessonSourceLinks.map((r) => [r.id, r.articleSourceLink]));

  const slotSourceIdMap = Object.fromEntries(rawSlotLinks.map((r) => {
    const fromStudy = r.studyMaterialLink?.match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
    const lessonLink = r.lessonId ? lessonSourceLinkMap[r.lessonId] : null;
    const fromLesson = lessonLink?.match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
    return [r.id, fromStudy ?? fromLesson ?? null];
  }));
  const uniqueSourceIds = Array.from(new Set(Object.values(slotSourceIdMap).filter(Boolean))) as string[];
  const articleSources = uniqueSourceIds.length > 0
    ? await prisma.articleSource.findMany({
        where: { id: { in: uniqueSourceIds } },
        select: { id: true, bookVolume: true, bookPage: true },
      })
    : [];
  const articleSourceMap = Object.fromEntries(articleSources.map((s) => [s.id, { bookVolume: s.bookVolume, bookPage: s.bookPage }]));

  let contentCutoffIndex: number | null = null;
  let broadcastEndTime: string | null = null;
  try {
    const row = await prisma.$queryRaw<{ contentCutoffIndex: number | null; broadcastEndTime: string | null }[]>`
      SELECT contentCutoffIndex, broadcastEndTime FROM "LineupDay" WHERE id = ${dayData.id}
    `;
    contentCutoffIndex = row[0]?.contentCutoffIndex ?? null;
    broadcastEndTime = row[0]?.broadcastEndTime ?? null;
  } catch {
    try {
      const row = await prisma.$queryRaw<{ broadcastEndTime: string | null }[]>`
        SELECT broadcastEndTime FROM "LineupDay" WHERE id = ${dayData.id}
      `;
      broadcastEndTime = row[0]?.broadcastEndTime ?? null;
    } catch { /* broadcastEndTime also not migrated */ }
  }

  const date = dayDate(ws, dow);
  const dayLabel = `ליינאפ שיעור בוקר — ${DAY_NAMES[dow]}, ${formatDate(date)}`;

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    contentCutoffIndex,
    broadcastEndTime,
    slots: dayData.slots.map((s) => {
      const srcId = slotSourceIdMap[s.id] ?? null;
      return {
        ...s,
        studyMaterialSource: srcId ? (articleSourceMap[srcId] ?? null) : null,
        lesson: s.lesson
          ? { ...s.lesson, recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null }
          : null,
      };
    }),
  }));

  return (
    <div className="p-4 space-y-4 min-h-screen">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/lineup/${weekStart}`} className="hover:text-foreground transition-colors">
            שבוע {formatDate(ws)}
          </Link>
          <ChevronRight className="h-4 w-4 rotate-180" />
          <span className="text-foreground font-medium">{DAY_NAMES[dow]}</span>
        </div>
        <Link
          href={`/lineup/${weekStart}/day/${dow}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Pencil className="me-2 h-4 w-4" />
          עריכה
        </Link>
      </div>

      <DayView day={serialized} dayLabel={dayLabel} contentCutoffIndex={contentCutoffIndex} />
    </div>
  );
}
