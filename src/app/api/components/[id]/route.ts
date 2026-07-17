import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const component = await prisma.lineupComponent.findUnique({ where: { id } });
  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linkRow = await prisma.$queryRaw<{ defaultLineupLink: string | null; defaultSlidesLink: string | null }[]>`
    SELECT defaultLineupLink, defaultSlidesLink FROM "LineupComponent" WHERE id = ${id}
  `.catch(() => [] as { defaultLineupLink: string | null; defaultSlidesLink: string | null }[]);

  return NextResponse.json({
    ...component,
    defaultLineupLink: linkRow[0]?.defaultLineupLink ?? null,
    defaultSlidesLink: linkRow[0]?.defaultSlidesLink ?? null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;
  const defaultLineupLink = body.defaultLineupLink ?? null;
  const defaultSlidesLink = body.defaultSlidesLink ?? null;
  delete body.defaultLineupLink;
  delete body.defaultSlidesLink;
  const component = await prisma.lineupComponent.update({ where: { id }, data: body });
  await prisma.$executeRaw`UPDATE "LineupComponent" SET "defaultLineupLink" = ${defaultLineupLink}, "defaultSlidesLink" = ${defaultSlidesLink} WHERE "id" = ${id}`.catch(() => {});
  return NextResponse.json({ ...component, defaultLineupLink, defaultSlidesLink });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.lineupComponent.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
