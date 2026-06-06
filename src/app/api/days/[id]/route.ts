import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.broadcastStartTime !== undefined) {
    await prisma.lineupDay.update({
      where: { id },
      data: { broadcastStartTime: body.broadcastStartTime ?? null },
    });
  }

  if (body.broadcastEndTime !== undefined) {
    await prisma.$executeRaw`UPDATE "LineupDay" SET "broadcastEndTime" = ${body.broadcastEndTime ?? null} WHERE "id" = ${id}`;
  }

  if (body.contentCutoffIndex !== undefined) {
    try {
      await prisma.$executeRaw`UPDATE "LineupDay" SET "contentCutoffIndex" = ${body.contentCutoffIndex ?? null} WHERE "id" = ${id}`;
    } catch { /* column not yet migrated on this env */ }
  }

  const day = await prisma.$queryRaw<{ id: string; broadcastStartTime: string | null; broadcastEndTime: string | null }[]>`
    SELECT id, broadcastStartTime, broadcastEndTime FROM "LineupDay" WHERE id = ${id}
  `;
  return NextResponse.json(day[0] ?? {});
}
