import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const series = await prisma.series.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(series);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const record = await prisma.series.create({ data: body });
  return NextResponse.json(record, { status: 201 });
}
