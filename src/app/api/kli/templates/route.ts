import { NextResponse } from "next/server";
import { fetchTemplates } from "@/lib/kli-client";

export async function GET() {
  const templates = await fetchTemplates();
  return NextResponse.json({ templates: templates.filter((t) => t.visible) });
}
