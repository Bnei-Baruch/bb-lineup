import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      progress: {
        orderBy: { day: { lineup: { weekStart: "desc" } } },
        take: 20,
        include: {
          day: {
            select: { dayOfWeek: true, lineup: { select: { weekStart: true } } },
          },
        },
      },
      lessons: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          sourceRef: true,
          recordingDate: true,
          videoDurationSec: true,
          approvalStatus: true,
        },
      },
    },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(series);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  delete body.lessons;
  delete body.progress;
  const series = await prisma.series.update({ where: { id }, data: body });
  return NextResponse.json(series);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.series.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
