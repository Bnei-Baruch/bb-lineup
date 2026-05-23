import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude } from "@/lib/slot-includes";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dayId, slotType, ...rest } = body;

  // Remove relation fields that Prisma doesn't accept as data
  delete rest.lesson;
  delete rest.component;

  // Validate foreign keys before creating to give a clear error
  const day = await prisma.lineupDay.findUnique({ where: { id: dayId }, select: { id: true } });
  if (!day) return NextResponse.json({ error: `dayId not found: ${dayId}` }, { status: 422 });

  if (rest.lessonId) {
    const lesson = await prisma.lesson.findUnique({ where: { id: rest.lessonId }, select: { id: true } });
    if (!lesson) {
      delete rest.lessonId; // drop invalid reference instead of failing
    }
  }

  if (rest.componentId) {
    const component = await prisma.lineupComponent.findUnique({ where: { id: rest.componentId }, select: { id: true } });
    if (!component) {
      delete rest.componentId; // drop invalid reference instead of failing
    }
  }

  const last = await prisma.lineupSlot.findFirst({
    where: { dayId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const slot = await prisma.lineupSlot.create({
    data: { dayId, slotType, sortOrder, ...rest },
    include: slotWithLessonInclude,
  });

  return NextResponse.json(slot, { status: 201 });
}
