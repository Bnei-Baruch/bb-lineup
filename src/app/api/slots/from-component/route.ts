import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude, withLessonTimecodes } from "@/lib/slot-includes";

export async function POST(req: NextRequest) {
  const { componentId, dayId } = await req.json();

  if (!componentId || !dayId) {
    return NextResponse.json({ error: "componentId and dayId required" }, { status: 400 });
  }

  const component = await prisma.lineupComponent.findUnique({ where: { id: componentId } });
  if (!component) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  // Fetch defaultLineupLink via raw SQL (not in Prisma client on all envs)
  const linkRow = await prisma.$queryRaw<{ defaultLineupLink: string | null }[]>`
    SELECT defaultLineupLink FROM "LineupComponent" WHERE id = ${componentId}
  `.catch(() => [] as { defaultLineupLink: string | null }[]);
  const defaultLineupLink = (component as Record<string, unknown>).defaultLineupLink as string | null ?? linkRow[0]?.defaultLineupLink ?? null;

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
      lineupLink: defaultLineupLink,
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

  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched, { status: 201 });
}
