import { NextRequest, NextResponse } from "next/server";
import { fetchContentUnit } from "@/lib/km-client";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
  try {
    const unit = await fetchContentUnit(uid);
    return NextResponse.json({ name: unit.name });
  } catch {
    return NextResponse.json({ error: "Failed to fetch content unit" }, { status: 502 });
  }
}
