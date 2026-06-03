import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dayId, clearExisting = false } = await req.json();

  const rows = await prisma.$queryRaw<{ dayTemplate: string; broadcastStartTime: string; broadcastEndTime: string | null }[]>`
    SELECT dayTemplate, broadcastStartTime, broadcastEndTime FROM "LineupRuleSet" WHERE id = ${id}
  `;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { dayTemplate, broadcastStartTime, broadcastEndTime } = rows[0];

  let templateSlots: {
    type: string; slotType?: string; componentId?: string; label?: string;
    durationSec?: number; startTimecode?: string; endTimecode?: string; partNumber?: number;
    narratorScript?: string; transitionType?: string; mediaCode?: string;
    language?: string; hasSubtitles?: boolean; hasWorkshopQuestions?: boolean; notes?: string;
  }[];
  try {
    templateSlots = JSON.parse(dayTemplate);
  } catch {
    return NextResponse.json({ error: "Invalid template" }, { status: 500 });
  }

  if (clearExisting) {
    await prisma.lineupSlot.deleteMany({ where: { dayId } });
  }

  await prisma.lineupDay.update({ where: { id: dayId }, data: { broadcastStartTime } });
  if (broadcastEndTime !== undefined) {
    await prisma.$executeRaw`UPDATE "LineupDay" SET "broadcastEndTime" = ${broadcastEndTime} WHERE id = ${dayId}`;
  }

  const maxSlot = await prisma.lineupSlot.findFirst({
    where: { dayId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sortOrder = (maxSlot?.sortOrder ?? -1) + 1;

  for (const slot of templateSlots) {
    if (slot.componentId) {
      // Pull defaults from the component
      const component = await prisma.lineupComponent.findUnique({ where: { id: slot.componentId } });
      if (component) {
        await prisma.lineupSlot.create({
          data: {
            dayId,
            slotType: component.slotType,
            componentId: component.id,
            label: component.defaultLabel,
            durationSec: component.defaultDurationSec,
            narratorScript: component.defaultNarratorScript,
            transitionType: component.defaultTransitionType,
            mediaCode: component.defaultMediaCode,
            language: component.defaultLanguage,
            hasSubtitles: component.defaultHasSubtitles,
            hasWorkshopQuestions: component.defaultHasWorkshopQuestions,
            notes: component.defaultNotes,
            partNumber: component.defaultPartNumber,
            sortOrder,
          },
        });
        sortOrder++;
        continue;
      }
    }

    // Custom slot — use saved details
    const isPlaceholder = slot.type === "lesson" || slot.type === "article";
    const slotType =
      slot.type === "article" ? "article_reading" :
      slot.type === "lesson" ? (slot.slotType ?? "recorded_lesson") :
      (slot.slotType ?? "narrator_announcement");

    await prisma.lineupSlot.create({
      data: {
        dayId,
        slotType,
        label: slot.label ?? null,
        // Reset duration for lesson/article placeholders — will be set when content is assigned
        durationSec: isPlaceholder ? null : (slot.durationSec ?? null),
        startTimecode: isPlaceholder ? null : (slot.startTimecode ?? null),
        endTimecode: isPlaceholder ? null : (slot.endTimecode ?? null),
        partNumber: slot.partNumber ?? null,
        narratorScript: slot.narratorScript ?? null,
        transitionType: slot.transitionType ?? null,
        mediaCode: slot.mediaCode ?? null,
        language: slot.language ?? null,
        hasSubtitles: slot.hasSubtitles ?? false,
        hasWorkshopQuestions: slot.hasWorkshopQuestions ?? false,
        notes: slot.notes ?? null,
        sortOrder,
      },
    });
    sortOrder++;
  }

  return NextResponse.json({ created: templateSlots.length });
}
