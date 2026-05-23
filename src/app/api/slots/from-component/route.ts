import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude } from "@/lib/slot-includes";

export async function POST(req: NextRequest) {
  const { componentId, dayId } = await req.json();

  if (!componentId || !dayId) {
    return NextResponse.json({ error: "componentId and dayId required" }, { status: 400 });
  }

  const component = await prisma.lineupComponent.findUnique({ where: { id: componentId } });
  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  // Find the next sort order
  const last = await prisma.lineupSlot.findFirst({
    where: { dayId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  // Create slot with component defaults
  const slot = await prisma.lineupSlot.create({
    data: {
      dayId,
      slotType: component.slotType,
      sortOrder,
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
    },
    include: slotWithLessonInclude,
  });

  return NextResponse.json(slot, { status: 201 });
}
