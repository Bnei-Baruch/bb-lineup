import { prisma } from "@/lib/prisma";
import { LibraryClient } from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [lessons, series, { currentSlotIds, pastSlotIds }] = await Promise.all([
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
        series: { select: { id: true, name: true, color: true } },
        articleSource: { select: { bookSeries: true, bookVolume: true, bookPage: true } },
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
  ]);

  return (
    <LibraryClient
      lessons={lessons as Parameters<typeof LibraryClient>[0]["lessons"]}
      series={JSON.parse(JSON.stringify(series))}
      currentSlotIds={currentSlotIds}
      pastSlotIds={pastSlotIds}
    />
  );
}
