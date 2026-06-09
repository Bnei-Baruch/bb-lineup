import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam, DAY_NAMES, formatDate, dayDate } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { DayEditor } from "@/components/lineup/DayEditor";
import { SessionLabelInput } from "@/components/lineup/SessionLabelInput";
import { DayWithSlots } from "@/types";
import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { ChevronRight, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DayEditPage({
  params,
}: {
  params: Promise<{ weekStart: string; dayOfWeek: string; sessionIndex: string }>;
}) {
  const { weekStart, dayOfWeek: dowStr, sessionIndex: sessionIdxStr } = await params;
  const dow = parseInt(dowStr);
  const sessionIdx = parseInt(sessionIdxStr);
  const ws = toWeekStart(parseWeekParam(weekStart));

  // Find the specific session's LineupDay by (weekStart + dayOfWeek + sessionIndex)
  const dayRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ld.id FROM "LineupDay" ld
    JOIN "Lineup" l ON ld.lineupId = l.id
    WHERE l.weekStart = ${ws} AND ld.dayOfWeek = ${dow} AND ld.sessionIndex = ${sessionIdx}
    LIMIT 1
  `;
  const dayId = dayRows[0]?.id;

  if (!dayId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>לא נמצא שיעור זה</p>
        <Link href={`/lineup/${weekStart}`} className="text-sm text-blue-600 hover:underline mt-2 block">
          חזרה לשבוע
        </Link>
      </div>
    );
  }

  const [dayData, components, series, unseriedLessons] = await Promise.all([
    prisma.lineupDay.findUnique({
      where: { id: dayId },
      include: {
        slots: {
          orderBy: { sortOrder: "asc" },
          include: slotWithLessonInclude,
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

  let broadcastEndTime: string | null = null;
  let contentStartIndex: number | null = null;
  let contentCutoffIndex: number | null = null;
  let sessionLabel: string | null = null;
  try {
    const row = await prisma.$queryRaw<{
      broadcastEndTime: string | null;
      contentStartIndex: number | null;
      contentCutoffIndex: number | null;
      sessionLabel: string | null;
    }[]>`
      SELECT broadcastEndTime, contentStartIndex, contentCutoffIndex, sessionLabel FROM "LineupDay" WHERE id = ${dayId}
    `;
    broadcastEndTime = row[0]?.broadcastEndTime ?? null;
    contentStartIndex = row[0]?.contentStartIndex ?? null;
    contentCutoffIndex = row[0]?.contentCutoffIndex ?? null;
    sessionLabel = row[0]?.sessionLabel ?? null;
  } catch {
    try {
      const row = await prisma.$queryRaw<{ broadcastEndTime: string | null }[]>`
        SELECT broadcastEndTime FROM "LineupDay" WHERE id = ${dayId}
      `;
      broadcastEndTime = row[0]?.broadcastEndTime ?? null;
    } catch { /* ignore */ }
  }

  const date = dayDate(ws, dow);

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    sessionIndex: sessionIdx,
    sessionLabel,
    broadcastEndTime,
    contentStartIndex,
    contentCutoffIndex,
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
          <span className="text-muted-foreground">/</span>
          <SessionLabelInput dayId={dayId} sessionIndex={sessionIdx} initialLabel={sessionLabel} />
        </div>
        <Link
          href={`/lineup/${weekStart}/day/${dow}/${sessionIdx}`}
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
