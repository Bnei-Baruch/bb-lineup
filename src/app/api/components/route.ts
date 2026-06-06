import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? "";
  const where = category ? { category } : {};

  const components = await prisma.lineupComponent.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  // Merge defaultLineupLink via raw SQL (not in Prisma client on all envs)
  const links = await prisma.$queryRaw<{ id: string; defaultLineupLink: string | null }[]>`
    SELECT id, defaultLineupLink FROM "LineupComponent"
  `.catch(() => [] as { id: string; defaultLineupLink: string | null }[]);
  const linkMap = Object.fromEntries(links.map((r) => [r.id, r.defaultLineupLink]));

  return NextResponse.json(components.map((c) => ({ ...c, defaultLineupLink: linkMap[c.id] ?? null })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const defaultLineupLink = body.defaultLineupLink ?? null;
  delete body.defaultLineupLink;
  try {
    const component = await prisma.lineupComponent.create({ data: body });
    if (defaultLineupLink !== null) {
      await prisma.$executeRaw`UPDATE "LineupComponent" SET "defaultLineupLink" = ${defaultLineupLink} WHERE "id" = ${component.id}`.catch(() => {});
    }
    return NextResponse.json({ ...component, defaultLineupLink }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: `קומפוננטה עם שם "${body.name}" כבר קיימת` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
