import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude, withLessonTimecodes } from "@/lib/slot-includes";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { count } = await prisma.lineupSlot.deleteMany({ where: { dayId: id } });
  return NextResponse.json({ deleted: count });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slots = await prisma.lineupSlot.findMany({
    where: { dayId: id },
    orderBy: { sortOrder: "asc" },
    include: slotWithLessonInclude,
  });
  return NextResponse.json(await withLessonTimecodes(prisma, slots));
}
