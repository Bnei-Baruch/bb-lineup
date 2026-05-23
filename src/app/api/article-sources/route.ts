import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    // Single-record lookup by ID
    if (id) {
      const row = await prisma.articleSource.findUnique({
        where: { id },
        select: { id: true, ref: true, link: true, bookSeries: true, bookVolume: true, bookPage: true },
      });
      if (!row) return NextResponse.json({ source: null });
      return NextResponse.json({
        source: {
          id: row.id,
          title: row.ref,
          url: row.link ?? `https://kabbalahmedia.info/sources/${row.id}`,
          bookSeries: row.bookSeries,
          bookVolume: row.bookVolume,
          bookPage: row.bookPage,
        },
      });
    }

    if (!q) return NextResponse.json({ sources: [] });

    const rows = await prisma.articleSource.findMany({
      where: { ref: { contains: q } },
      select: { id: true, ref: true, link: true, bookSeries: true, bookVolume: true, bookPage: true },
      take: 20,
    });

    return NextResponse.json({
      sources: rows.map((r) => ({
        id: r.id,
        title: r.ref,
        url: r.link ?? `https://kabbalahmedia.info/sources/${r.id}`,
        bookSeries: r.bookSeries,
        bookVolume: r.bookVolume,
        bookPage: r.bookPage,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
