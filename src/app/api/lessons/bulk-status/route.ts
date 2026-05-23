import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { ids, status } = await req.json();
  if (!ids?.length || !status) return NextResponse.json({ error: "missing ids or status" }, { status: 400 });
  const { count } = await prisma.lesson.updateMany({ where: { id: { in: ids } }, data: { approvalStatus: status } });
  return NextResponse.json({ updated: count });
}
