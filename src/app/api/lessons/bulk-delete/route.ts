import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  // Find which lessons are currently in use
  const usedSlots = await prisma.lineupSlot.findMany({
    where: { lessonId: { in: ids } },
    select: { lessonId: true },
  });
  const usedIds = new Set(usedSlots.map((s) => s.lessonId));
  const deletableIds = ids.filter((id) => !usedIds.has(id));

  await prisma.lesson.deleteMany({ where: { id: { in: deletableIds } } });

  return NextResponse.json({
    deleted: deletableIds.length,
    skipped: usedIds.size,
  });
}
