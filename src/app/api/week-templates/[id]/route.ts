import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await prisma.weekTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const template = await prisma.weekTemplate.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description ?? null,
      isDefault: body.isDefault ?? false,
      days: typeof body.days === "string" ? body.days : JSON.stringify(body.days ?? {}),
    },
  });
  return NextResponse.json(template);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.weekTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
