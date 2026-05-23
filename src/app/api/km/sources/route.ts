import { NextRequest, NextResponse } from "next/server";
import { searchSources } from "@/lib/km-client";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ sources: [] });

  try {
    const sources = await searchSources(q);
    return NextResponse.json({ sources });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
