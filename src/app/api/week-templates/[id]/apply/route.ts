import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart, parseWeekParam } from "@/lib/dates";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { weekStart: weekStartStr, clearExisting = false, dayOfWeek: onlyDay } = body as {
    weekStart: string;
    clearExisting?: boolean;
    dayOfWeek?: number;
  };

  const template = await prisma.weekTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const weekStartDate = toWeekStart(parseWeekParam(weekStartStr));

  // Find or create lineup with 7 days
  const weekInclude = {
    days: {
      orderBy: { dayOfWeek: "asc" as const },
    },
  };

  let lineup = await prisma.lineup.findUnique({
    where: { weekStart: weekStartDate },
    include: weekInclude,
  });

  if (!lineup) {
    lineup = await prisma.lineup.create({
      data: {
        weekStart: weekStartDate,
        days: { create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })) },
      },
      include: weekInclude,
    });
  }

  type TemplateSlot = { slotType: string; componentId?: string; label?: string; durationSec?: number };
  type DayEntry = TemplateSlot[] | { slots: TemplateSlot[]; contentStartIndex?: number; contentCutoffIndex?: number | null };

  // Parse template days JSON — supports both old (array) and new (object with slots + indices) format
  let templateDays: Record<string, DayEntry>;
  try {
    templateDays = JSON.parse(template.days);
  } catch {
    return NextResponse.json({ error: "Invalid template days JSON" }, { status: 500 });
  }

  let totalCreated = 0;
  let daysAffected = 0;

  for (const [dayOfWeekStr, dayEntry] of Object.entries(templateDays)) {
    const slots: TemplateSlot[] = Array.isArray(dayEntry) ? dayEntry : (dayEntry.slots ?? []);
    const contentStartIndex: number = Array.isArray(dayEntry) ? 0 : (dayEntry.contentStartIndex ?? 0);
    const contentCutoffIndex: number | null = Array.isArray(dayEntry) ? null : (dayEntry.contentCutoffIndex ?? null);

    if (!slots || slots.length === 0) continue;

    const dayOfWeek = parseInt(dayOfWeekStr, 10);
    if (onlyDay !== undefined && dayOfWeek !== onlyDay) continue;
    const lineupDay = lineup.days.find((d) => d.dayOfWeek === dayOfWeek);
    if (!lineupDay) continue;

    if (clearExisting) {
      await prisma.lineupSlot.deleteMany({ where: { dayId: lineupDay.id } });
    }

    // Get current max sortOrder
    const maxSlot = await prisma.lineupSlot.findFirst({
      where: { dayId: lineupDay.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let sortOrder = (maxSlot?.sortOrder ?? -1) + 1;

    for (const slot of slots) {
      await prisma.lineupSlot.create({
        data: {
          dayId: lineupDay.id,
          slotType: slot.slotType,
          label: slot.label ?? null,
          durationSec: slot.durationSec ?? null,
          componentId: slot.componentId ?? null,
          sortOrder,
        },
      });
      sortOrder++;
      totalCreated++;
    }

    // Write contentStartIndex / contentCutoffIndex to the day
    await prisma.$executeRaw`
      UPDATE "LineupDay"
      SET "contentStartIndex" = ${contentStartIndex},
          "contentCutoffIndex" = ${contentCutoffIndex}
      WHERE id = ${lineupDay.id}
    `;

    daysAffected++;
  }

  return NextResponse.json({ created: totalCreated, days: daysAffected });
}
