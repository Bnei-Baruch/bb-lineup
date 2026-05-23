import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { ids, seriesId } = await req.json();
  if (!ids?.length) return NextResponse.json({ error: "missing ids" }, { status: 400 });
  // seriesId may be null (to unassign from series)
  const { count } = await prisma.lesson.updateMany({
    where: { id: { in: ids } },
    data: { seriesId: seriesId ?? null },
  });
  return NextResponse.json({ updated: count });
}
