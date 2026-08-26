import { prisma } from "@/lib/prisma";
import { LibraryClient } from "./LibraryClient";
import { RequireAdmin } from "@/components/providers/RequireAdmin";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [lessons, series, { currentSlotIds, pastSlotIds }, timecodeRows] = await Promise.all([
    prisma.lesson.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        approvalStatus: true,
        recordingDate: true,
        broadcastDate: true,
        sourceRef: true,
        narratorName: true,
        videoDurationSec: true,
        articleReadingSec: true,
        tags: true,
        kmPageLink: true,
        articleSourceLink: true,
        transcriptionLink: true,
        transcriptionLinkEn: true,
        transcriptionLinkRu: true,
        transcriptionLinkEs: true,
        series: { select: { id: true, name: true, color: true } },
        articleSource: { select: { bookSeries: true, bookVolume: true, bookPage: true } },
        parts: {
          select: { id: true, partNumber: true, startTimecode: true, endTimecode: true, broadcastDate: true, notes: true },
          orderBy: { partNumber: "asc" },
        },
      },
    }),
    prisma.series.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { lessons: true } } },
    }),
    prisma.lineupSlot
      .findMany({
        where: { lessonId: { not: null } },
        select: {
          lessonId: true,
          day: { select: { dayOfWeek: true, lineup: { select: { weekStart: true } } } },
        },
      })
      .then((slots) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const current = new Set<string>();
        const past = new Set<string>();
        for (const s of slots) {
          if (!s.day?.lineup) continue;
          const slotDate = new Date(s.day.lineup.weekStart);
          slotDate.setDate(slotDate.getDate() + s.day.dayOfWeek);
          if (slotDate >= today) current.add(s.lessonId as string);
          else past.add(s.lessonId as string);
        }
        return { currentSlotIds: Array.from(current), pastSlotIds: Array.from(past) };
      }),
    prisma.$queryRaw<{ id: string; startTimecode: string | null; endTimecode: string | null }[]>`
      SELECT id, startTimecode, endTimecode FROM "Lesson"
    `,
  ]);

  const timecodeMap = new Map(timecodeRows.map((r) => [r.id, { startTimecode: r.startTimecode, endTimecode: r.endTimecode }]));
  const lessonsWithTimecodes = lessons.map((l) => ({ ...l, ...timecodeMap.get(l.id) }));

  return (
    <RequireAdmin>
      <LibraryClient
        lessons={lessonsWithTimecodes as Parameters<typeof LibraryClient>[0]["lessons"]}
        series={JSON.parse(JSON.stringify(series))}
        currentSlotIds={currentSlotIds}
        pastSlotIds={pastSlotIds}
      />
    </RequireAdmin>
  );
}
