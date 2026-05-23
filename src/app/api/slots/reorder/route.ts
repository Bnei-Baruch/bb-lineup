import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { dayId, orderedIds } = await req.json() as { dayId: string; orderedIds: string[] };

  if (!dayId || !Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "dayId and orderedIds required" }, { status: 400 });
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.lineupSlot.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
