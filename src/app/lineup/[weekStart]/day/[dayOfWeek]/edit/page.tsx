import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam, DAY_NAMES, formatDate, dayDate } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { DayEditor } from "@/components/lineup/DayEditor";
import { DayWithSlots } from "@/types";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { ChevronRight, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DayEditPage({
  params,
}: {
  params: Promise<{ weekStart: string; dayOfWeek: string }>;
}) {
  const { weekStart, dayOfWeek: dowStr } = await params;
  const dow = parseInt(dowStr);
  const ws = toWeekStart(parseWeekParam(weekStart));

  const [lineup, components, series, unseriedLessons] = await Promise.all([
    prisma.lineup.findUnique({
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
    }),
    prisma.lineupComponent.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        slotType: true,
        defaultDurationSec: true,
      },
    }),
    prisma.series.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        lessons: {
          orderBy: { recordingDate: "asc" },
          select: {
            id: true,
            sourceRef: true,
            recordingDate: true,
            videoDurationSec: true,
            narratorName: true,
            approvalStatus: true,
          },
        },
      },
    }),
    prisma.lesson.findMany({
      where: { seriesId: null },
      orderBy: { recordingDate: "asc" },
      select: {
        id: true,
        sourceRef: true,
        recordingDate: true,
        videoDurationSec: true,
        narratorName: true,
        approvalStatus: true,
      },
    }),
  ]);

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

  const endTimeRow = await prisma.$queryRaw<{ broadcastEndTime: string | null }[]>`
    SELECT broadcastEndTime FROM "LineupDay" WHERE id = ${dayData.id}
  `;
  const broadcastEndTime = endTimeRow[0]?.broadcastEndTime ?? null;

  const date = dayDate(ws, dow);

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    broadcastEndTime,
    slots: dayData.slots.map((s) => ({
      ...s,
      lesson: s.lesson
        ? { ...s.lesson, recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null }
        : null,
    })),
  }));

  return (
    <div className="p-4 space-y-4 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/lineup/${weekStart}`} className="hover:text-foreground transition-colors">
            שבוע {formatDate(ws)}
          </Link>
          <ChevronRight className="h-4 w-4 rotate-180" />
          <span className="text-foreground font-medium">
            עריכה — {DAY_NAMES[dow]} {formatDate(date)}
          </span>
        </div>
        <Link
          href={`/lineup/${weekStart}/day/${dow}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Eye className="me-2 h-4 w-4" />
          תצוגת שידור
        </Link>
      </div>

      <DayEditor
        day={serialized}
        components={components}
        series={[
          ...JSON.parse(JSON.stringify(series)),
          ...(unseriedLessons.length > 0
            ? [{ id: "__none__", name: "ללא סדרה", color: null, lessons: JSON.parse(JSON.stringify(unseriedLessons)) }]
            : []),
        ]}
      />
    </div>
  );
}
