import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Returns actualBroadcastAt and actualDurationSec for a slot via raw SQL,
 *  bypassing the ORM client cache so new columns are always included. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await prisma.$queryRaw<{ actualBroadcastAt: string | null; actualDurationSec: number | null }[]>`
      SELECT actualBroadcastAt, actualDurationSec FROM "LineupSlot" WHERE id = ${id} LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json(null, { status: 404 });
    return NextResponse.json({
      actualBroadcastAt: rows[0].actualBroadcastAt,
      actualDurationSec: rows[0].actualDurationSec != null ? Number(rows[0].actualDurationSec) : null,
    });
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
