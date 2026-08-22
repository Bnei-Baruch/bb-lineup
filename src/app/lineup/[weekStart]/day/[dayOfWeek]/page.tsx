import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam, DAY_NAMES, formatDate, dayDate, timeOfDayLabel } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
import { DayView } from "@/components/lineup/DayView";
import { SessionTabs } from "@/components/lineup/SessionTabs";
import { AdminOnly } from "@/components/providers/AdminOnly";
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

  // All sessions on the same day (e.g. a second lesson) — render as tabs if more than one
  let daySessions: { sessionIndex: number; sessionLabel: string | null }[] = [];
  try {
    daySessions = await prisma.$queryRaw<{ sessionIndex: number; sessionLabel: string | null }[]>`
      SELECT ld.sessionIndex, ld.sessionLabel FROM "LineupDay" ld
      JOIN "Lineup" l ON ld.lineupId = l.id
      WHERE l.weekStart = ${ws} AND ld.dayOfWeek = ${dow}
      ORDER BY ld.sessionIndex ASC
    `;
  } catch { /* sessionIndex column not migrated */ }

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

  // Fetch actual broadcast data via raw SQL — bypasses ORM client cache so new columns
  // are always returned even if the running Prisma client was generated before they were added
  const slotIds = dayData.slots.map((s) => s.id);
  const actualBroadcastMap = new Map<string, { actualBroadcastAt: string | null; actualDurationSec: number | null }>();
  if (slotIds.length > 0) {
    try {
      const { Prisma } = await import("@prisma/client");
      const rows = await prisma.$queryRaw<{ id: string; actualBroadcastAt: string | null; actualDurationSec: number | null }[]>`
        SELECT id, actualBroadcastAt, actualDurationSec FROM "LineupSlot"
        WHERE id IN (${Prisma.join(slotIds)})
      `;
      for (const r of rows) actualBroadcastMap.set(r.id, { actualBroadcastAt: r.actualBroadcastAt, actualDurationSec: Number(r.actualDurationSec ?? null) || null });
    } catch { /* column may not exist on older DBs */ }
  }

  // Fetch series.playoutCode via raw SQL — same reason: bypasses stale ORM client cache
  // that may predate the playoutCode column being added to Series
  const playoutCodeMap = new Map<string, string | null>();
  if (slotIds.length > 0) {
    try {
      const { Prisma } = await import("@prisma/client");
      const rows = await prisma.$queryRaw<{ slotId: string; playoutCode: string | null }[]>`
        SELECT ls.id AS slotId, s.playoutCode
        FROM "LineupSlot" ls
        JOIN "Lesson" l ON ls.lessonId = l.id
        JOIN "Series" s ON l.seriesId = s.id
        WHERE ls.id IN (${Prisma.join(slotIds)})
      `;
      for (const r of rows) playoutCodeMap.set(r.slotId, r.playoutCode);
    } catch { /* Series table or playoutCode column not available */ }
  }

  const date = dayDate(ws, dow);
  const dayLabel = `ליינאפ שיעור ${timeOfDayLabel(dayData.broadcastStartTime).he} — ${DAY_NAMES[dow]}, ${formatDate(date)}`;

  const serialized: DayWithSlots = JSON.parse(JSON.stringify({
    ...dayData,
    sessionIndex: 0,
    sessionLabel: null,
    contentCutoffIndex,
    broadcastEndTime,
    slots: dayData.slots.map((s) => {
      const srcId = slotSourceIdMap[s.id] ?? null;
      const actualBroadcast = actualBroadcastMap.get(s.id);
      const playoutCode = playoutCodeMap.has(s.id) ? playoutCodeMap.get(s.id) : undefined;
      return {
        ...s,
        actualBroadcastAt: actualBroadcast?.actualBroadcastAt ?? (s as Record<string, unknown>).actualBroadcastAt ?? null,
        actualDurationSec: actualBroadcast?.actualDurationSec ?? (s as Record<string, unknown>).actualDurationSec ?? null,
        studyMaterialSource: srcId ? (articleSourceMap[srcId] ?? null) : null,
        lesson: s.lesson
          ? {
              ...s.lesson,
              recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null,
              // Override series.playoutCode with raw SQL result to bypass stale ORM client cache
              series: playoutCode !== undefined
                ? { ...(s.lesson.series ?? {}), playoutCode: playoutCode ?? null }
                : (s.lesson.series ?? null),
            }
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
        <div className="flex items-center gap-3">
          <SessionTabs weekStart={weekStart} dow={dow} sessions={daySessions} currentIndex={0} />
          <AdminOnly>
          <Link
            href={`/lineup/${weekStart}/day/${dow}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="me-2 h-4 w-4" />
            עריכה
          </Link>
          </AdminOnly>
        </div>
      </div>

      <DayView day={serialized} dayLabel={dayLabel} contentCutoffIndex={contentCutoffIndex} />
    </div>
  );
}
