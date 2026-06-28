import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam, DAY_NAMES, formatDate, dayDate } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { Prisma } from "@prisma/client";
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

  // Find the specific session's LineupDay (sessionIndex column may not exist on older DBs)
  let dayId: string | undefined;
  try {
    const dayRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT ld.id FROM "LineupDay" ld
      JOIN "Lineup" l ON ld.lineupId = l.id
      WHERE l.weekStart = ${ws} AND ld.dayOfWeek = ${dow} AND ld.sessionIndex = ${sessionIdx}
      LIMIT 1
    `;
    dayId = dayRows[0]?.id;
  } catch {
    const dayRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT ld.id FROM "LineupDay" ld
      JOIN "Lineup" l ON ld.lineupId = l.id
      WHERE l.weekStart = ${ws} AND ld.dayOfWeek = ${dow}
      LIMIT 1
    `;
    dayId = dayRows[0]?.id;
  }

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

  // Enrich article_reading slots with ArticleSource (bookVolume/bookPage) via URL
  const articleSlotLinks = dayData.slots
    .filter((s) => s.slotType === "article_reading" && s.studyMaterialLink)
    .map((s) => ({ id: s.id, srcId: s.studyMaterialLink!.match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1] ?? null }));
  const uniqueEditSrcIds = Array.from(new Set(articleSlotLinks.map((a) => a.srcId).filter(Boolean))) as string[];
  const editArticleSources = uniqueEditSrcIds.length > 0
    ? await prisma.articleSource.findMany({
        where: { id: { in: uniqueEditSrcIds } },
        select: { id: true, bookVolume: true, bookPage: true, link: true },
      })
    : [];
  const editArtSrcMap = Object.fromEntries(editArticleSources.map((s) => [s.id, { bookVolume: s.bookVolume, bookPage: s.bookPage, link: s.link }]));
  const editSlotSrcMap = Object.fromEntries(articleSlotLinks.map((a) => [a.id, a.srcId]));

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

  // Supplement lesson timecodes (raw SQL — Prisma client may not include these columns yet)
  const sessionLessonIds = Array.from(new Set(dayData.slots.map((s) => s.lessonId).filter(Boolean) as string[]));
  let sessionLessonTcMap = new Map<string, { startTimecode: string | null; endTimecode: string | null }>();
  if (sessionLessonIds.length > 0) {
    try {
      const tcRows = await prisma.$queryRaw<{ id: string; startTimecode: string | null; endTimecode: string | null }[]>`
        SELECT id, startTimecode, endTimecode FROM "Lesson" WHERE id IN (${Prisma.join(sessionLessonIds)})
      `;
      sessionLessonTcMap = new Map(tcRows.map((r) => [r.id, r]));
    } catch { /* ignore */ }
  }

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    sessionIndex: sessionIdx,
    sessionLabel,
    broadcastEndTime,
    contentStartIndex,
    contentCutoffIndex,
    slots: dayData.slots.map((s) => {
      const srcId = editSlotSrcMap[s.id] ?? null;
      return {
        ...s,
        studyMaterialSource: srcId ? (editArtSrcMap[srcId] ?? null) : s.studyMaterialSource,
        lesson: s.lesson
          ? { ...s.lesson, recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null, ...sessionLessonTcMap.get(s.lesson.id) }
          : null,
      };
    }),
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
