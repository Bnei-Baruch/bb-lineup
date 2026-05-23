import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const day = await prisma.lineupDay.update({
    where: { id },
    data: { broadcastStartTime: body.broadcastStartTime ?? null },
  });
  return NextResponse.json(day);
}
