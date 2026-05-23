import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.weekTemplate.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const template = await prisma.weekTemplate.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      isDefault: body.isDefault ?? false,
      days: typeof body.days === "string" ? body.days : JSON.stringify(body.days ?? {}),
    },
  });
  return NextResponse.json(template, { status: 201 });
}
