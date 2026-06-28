import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude, withLessonTimecodes } from "@/lib/slot-includes";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  delete body.id;
  delete body.dayId;
  delete body.createdAt;
  delete body.updatedAt;
  delete body.lesson;
  delete body.component;
  delete body.studyMaterialSource;
  delete body.studyMaterialSourceId;

  const slot = await prisma.lineupSlot.update({
    where: { id },
    data: body,
    include: slotWithLessonInclude,
  });
  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dayId } = await req.json();
  if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
  const slot = await prisma.lineupSlot.update({
    where: { id },
    data: { dayId },
    include: slotWithLessonInclude,
  });
  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.lineupSlot.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
