import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";
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

  type DayExtra = { id: string; broadcastEndTime: string | null; sessionIndex: number; sessionLabel: string | null; contentCutoffIndex: number | null };
  let extras: DayExtra[] = [];
  try {
    extras = await prisma.$queryRaw<DayExtra[]>`
      SELECT id, broadcastEndTime, sessionIndex, sessionLabel, contentCutoffIndex FROM "LineupDay" WHERE "lineupId" = ${lineup.id}
    `;
  } catch {
    try {
      const fallback = await prisma.$queryRaw<{ id: string; broadcastEndTime: string | null }[]>`
        SELECT id, broadcastEndTime FROM "LineupDay" WHERE "lineupId" = ${lineup.id}
      `;
      extras = fallback.map((r) => ({ ...r, sessionIndex: 0, sessionLabel: null, contentCutoffIndex: null }));
    } catch { /* ignore */ }
  }
  const extrasMap = Object.fromEntries(extras.map((r) => [r.id, r]));

  const data: LineupWithDays = JSON.parse(JSON.stringify({
    ...lineup,
    weekStart: lineup.weekStart.toISOString().slice(0, 10),
    days: lineup.days.map((d) => ({
      ...d,
      broadcastEndTime: extrasMap[d.id]?.broadcastEndTime ?? null,
      sessionIndex: extrasMap[d.id]?.sessionIndex ?? 0,
      sessionLabel: extrasMap[d.id]?.sessionLabel ?? null,
      contentCutoffIndex: extrasMap[d.id]?.contentCutoffIndex ?? null,
      slots: d.slots.map((s) => ({
        ...s,
        lesson: s.lesson
          ? { ...s.lesson, recordingDate: s.lesson.recordingDate?.toISOString().slice(0, 10) ?? null }
          : null,
      })),
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

      <div className="overflow-x-auto pb-4">
        <WeekGrid lineup={data} templates={aiTemplates} />
      </div>
    </div>
  );
}
