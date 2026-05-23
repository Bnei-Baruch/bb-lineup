import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { seriesId, dayId, ...data } = body;

  const progress = await prisma.seriesProgress.upsert({
    where: { seriesId_dayId: { seriesId, dayId } },
    update: data,
    create: { seriesId, dayId, ...data },
  });

  return NextResponse.json(progress, { status: 201 });
}
