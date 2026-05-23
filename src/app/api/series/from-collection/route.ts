import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCollectionUid, fetchCollection, fetchContentUnit, extractVideoLink, extractNarrator, extractSourceLink, lookupSourceById, findDocxFileId } from "@/lib/km-client";

const KM_BASE = "https://kabbalahmedia.info";

/** Get duration in seconds from the Hebrew video file of a content unit */
function hebrewVideoDuration(files: { language: string; type: string; duration?: number }[]): number | null {
  const heVideo = files.find((f) => f.language === "he" && f.type === "video");
  return heVideo?.duration ?? null;
}

export async function POST(req: NextRequest) {
  const { url, color, sortOrder } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const uid = parseCollectionUid(url);
  if (!uid) return NextResponse.json({ error: "Could not parse collection UID from URL" }, { status: 400 });

  const collection = await fetchCollection(uid);
  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  // Derive a slug from the collection id
  const slug = `col-${uid.toLowerCase()}`;

  // Create (or find) the series
  let series = await prisma.series.findUnique({ where: { slug } });
  if (!series) {
    const existing = await prisma.series.findMany({ orderBy: { sortOrder: "asc" } });
    series = await prisma.series.create({
      data: {
        name: collection.name,
        slug,
        color: color ?? null,
        sortOrder: sortOrder ?? existing.length,
      },
    });
  }

  const units = collection.content_units ?? [];

  // Filter out already-imported units in one batch query
  const existingUids = new Set(
    (await prisma.lesson.findMany({
      where: { kmUid: { in: units.map((u) => u.id) } },
      select: { kmUid: true },
    })).map((l) => l.kmUid)
  );
  const newUnits = units.filter((u) => !existingUids.has(u.id));

  // Fetch all new content units in parallel
  const results = await Promise.all(
    newUnits.map(async (unit) => {
      try {
        const full = await fetchContentUnit(unit.id);
        const files = full.files ?? [];
        const durationSec = hebrewVideoDuration(files);
        const source = extractSourceLink(full.sources);
        const sourceResult = source ? await lookupSourceById(source.id) : null;
        const hasDocx = findDocxFileId(files) !== null;
        return {
          unit,
          videoDurationSec: durationSec != null ? Math.round(durationSec) : null,
          videoLink: extractVideoLink(files),
          narratorName: extractNarrator(files),
          articleSourceId: source?.id ?? null,
          articleSourceLink: source?.url ?? null,
          articleSourceRef: sourceResult?.title ?? null,
          transcriptionLink: hasDocx ? `https://kabbalahmedia.info/he/lessons/cu/${unit.id}?activeTab=transcription` : null,
        };
      } catch {
        return {
          unit,
          videoDurationSec: unit.duration ? Math.round(unit.duration) : null,
          videoLink: null,
          narratorName: null,
          articleSourceId: null,
          articleSourceLink: null,
          articleSourceRef: null,
          transcriptionLink: null,
        };
      }
    })
  );

  await prisma.lesson.createMany({
    data: results.map(({ unit, videoDurationSec, videoLink, narratorName, articleSourceId, articleSourceRef, articleSourceLink, transcriptionLink }) => ({
      kmUid: unit.id,
      kmPageLink: `${KM_BASE}/he/lessons/cu/${unit.id}`,
      sourceRef: unit.name,
      recordingDate: unit.film_date ? new Date(unit.film_date) : null,
      videoDurationSec,
      videoLink,
      narratorName,
      articleSourceId,
      articleSourceRef,
      articleSourceLink,
      transcriptionLink,
      seriesId: series.id,
      approvalStatus: "pending",
    })),
  });

  return NextResponse.json({ series, imported: results.length, total: units.length }, { status: 201 });
}
