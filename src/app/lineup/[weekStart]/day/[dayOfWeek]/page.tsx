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

  // Enrich slots with studyMaterialSource data (new column, not in generated Prisma client)
  // Also extract source ID from studyMaterialLink for pre-existing slots that predate this column
  const rawSlotSources = await prisma.$queryRaw<{ id: string; studyMaterialSourceId: string | null; studyMaterialLink: string | null }[]>`
    SELECT id, studyMaterialSourceId, studyMaterialLink FROM "LineupSlot" WHERE "dayId" = ${dayData.id}
  `;
  const slotSourceIdMap = Object.fromEntries(rawSlotSources.map((r) => {
    const srcId = r.studyMaterialSourceId
      ?? r.studyMaterialLink?.match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1]
      ?? null;
    return [r.id, srcId];
  }));
  const uniqueSourceIds = Array.from(new Set(Object.values(slotSourceIdMap).filter(Boolean))) as string[];
  const articleSources = uniqueSourceIds.length > 0
    ? await prisma.articleSource.findMany({
        where: { id: { in: uniqueSourceIds } },
        select: { id: true, bookVolume: true, bookPage: true },
      })
    : [];
  const articleSourceMap = Object.fromEntries(articleSources.map((s) => [s.id, { bookVolume: s.bookVolume, bookPage: s.bookPage }]));

  const date = dayDate(ws, dow);
  const dayLabel = `ליינאפ שיעור בוקר — ${DAY_NAMES[dow]}, ${formatDate(date)}`;

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    slots: dayData.slots.map((s) => {
      const srcId = slotSourceIdMap[s.id] ?? null;
      return {
        ...s,
        studyMaterialSourceId: srcId,
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

      <DayView day={serialized} dayLabel={dayLabel} />
    </div>
  );
}
