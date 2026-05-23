import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? "";
  const where = category ? { category } : {};

  const components = await prisma.lineupComponent.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json(components);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const component = await prisma.lineupComponent.create({ data: body });
    return NextResponse.json(component, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: `קומפוננטה עם שם "${body.name}" כבר קיימת` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
