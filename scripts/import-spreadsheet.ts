/**
 * Import lessons from a Google Sheets broadcast schedule into the library.
 *
 * From the spreadsheet we take ONLY:
 *   - Lesson link (col 6)  → identifies the lesson via kmUid
 *   - Broadcast date (col 1) → stored as broadcastDate
 *   - Status (col 2)       → stored as approvalStatus
 *
 * All other lesson data (title, duration, narrator, article link, etc.)
 * is fetched from KabMedia API.
 *
 * Behaviour:
 *   - Existing lesson (matched by kmUid): update approvalStatus + broadcastDate only
 *   - New lesson: fetch from KabMedia, create full record
 *
 * Usage:
 *   npx ts-node scripts/import-spreadsheet.ts [options]
 *
 * Options:
 *   --url=<google-sheets-url>   Full Google Sheets URL (uses default sheet if omitted)
 *   --file=<path>               Local CSV file instead of fetching from Google
 *   --gid=<sheet-gid>           Sheet tab GID (default: 1066072488)
 *   --year=<YYYY>               Year for broadcast dates (default: current year)
 *   --series-id=<id>            Prisma Series ID to assign to new lessons
 *   --base-url=<url>            App base URL for article word-count API (default: http://localhost:3001)
 *   --skip-rows=<n>             Number of header rows to skip (default: 7)
 *   --dry-run                   Print actions without writing to DB
 */

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as path from "path";
import * as fs from "fs";

function createPrisma() {
  const dbPath = path.resolve(process.cwd(), "prisma/lineup.db");
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

// ── Column indices (0-based) ──────────────────────────────────────────────────
const COL_BROADCAST_DATE = 1;
const COL_STATUS = 2;
const COL_LESSON_LINK = 6;
const COL_TRANSCRIPTION_LINK = 7;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKmUid(url: string): string | null {
  // Match the ID that comes after /cu/ in any kabbalahmedia URL
  const cuMatch = url.match(/\/cu\/([A-Za-z0-9_-]+)/);
  if (cuMatch) return cuMatch[1];
  // Fallback: last path segment before query string (for bare /lessons/UID format)
  const fallback = url.match(
    /kabbalahmedia\.info\/(?:[a-z]{2}\/)?(?:lessons|programs|events|plays|video)\/([A-Za-z0-9_-]+)(?:[?#]|$)/
  );
  return fallback ? fallback[1] : null;
}

/** Extract a date from strings like "ראשון, 29.3" or "שני, 5.4\nהערה" */
function parseBroadcastDate(raw: string, year: number): Date | null {
  const match = raw.match(/(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function mapStatus(hebrew: string): string {
  const h = hebrew.trim();
  if (h === "מאושר") return "approved";
  if (h === "מצונזר") return "censored";
  return "pending";
}

/** Minimal CSV parser that handles quoted fields containing commas and newlines */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") { field += c; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchKmUnit(uid: string): Promise<any> {
  const url = `https://kabbalahmedia.info/backend/content_units/${uid}?with_files=true&with_sources=true&ui_language=he&content_languages=he`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KabMedia ${res.status} for uid ${uid}`);
  return res.json();
}

/** Fetch the full KabMedia source tree (cached) and resolve a source's full path */
let _sourceTree: Array<{ id: string; name: string; full_name?: string; children?: unknown[] }> | null = null;
async function resolveSourceRef(sourceId: string): Promise<string | null> {
  if (!_sourceTree) {
    try {
      const res = await fetch("https://kabbalahmedia.info/backend/sqdata?language=he");
      if (!res.ok) return null;
      const data = await res.json();
      _sourceTree = data.sources ?? [];
    } catch { return null; }
  }

  function findPath(
    nodes: Array<{ id: string; name: string; full_name?: string; children?: unknown[] }>,
    id: string,
    path: string
  ): string | null {
    for (const node of nodes) {
      const label = node.full_name || node.name;
      const currentPath = path ? `${path} | ${label}` : label;
      if (node.id === id) return currentPath;
      if (node.children?.length) {
        const found = findPath(
          node.children as typeof nodes,
          id,
          currentPath
        );
        if (found) return found;
      }
    }
    return null;
  }

  return findPath(_sourceTree!, sourceId, "");
}

/** Look up word count from local ArticleSource table first; fallback to app API */
async function fetchWordCount(
  sourceId: string,
  baseUrl: string
): Promise<{ wordCount: number; durationSec: number } | null> {
  // Try local DB first (populated by populate-reading-times.ts)
  try {
    const row = await prisma.articleSource.findUnique({
      where: { id: sourceId },
      select: { wordCount: true, readingSec: true },
    });
    if (row?.wordCount && row?.readingSec) {
      return { wordCount: row.wordCount, durationSec: row.readingSec };
    }
  } catch {
    // fall through to API
  }

  // Fallback: app API (requires running dev server)
  try {
    const res = await fetch(`${baseUrl}/api/km/source-wordcount?source_id=${sourceId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.wordCount ? data : null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=").slice(1).join("=");

  const urlArg     = get("url");
  const fileArg    = get("file");
  const gidArg     = get("gid")       ?? "1066072488";
  const yearArg    = get("year");
  const seriesId   = get("series-id");
  const baseUrl    = get("base-url")  ?? "http://localhost:3001";
  const skipRows   = parseInt(get("skip-rows") ?? "7");
  const dryRun     = args.includes("--dry-run");

  const year = yearArg ? parseInt(yearArg) : new Date().getFullYear();

  if (dryRun) console.log("🔍 DRY RUN — no changes will be written\n");

  // ── Load CSV ────────────────────────────────────────────────────────────────
  let csvContent: string;
  if (fileArg) {
    csvContent = fs.readFileSync(fileArg, "utf-8");
  } else {
    const sheetId =
      urlArg?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
      "16zwyyw0jrTXDwMiYkMHFqTagGFqutrnacVZB0LhdR-g";
    const gid = urlArg?.match(/gid=(\d+)/)?.[1] ?? gidArg;
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    console.log(`Fetching spreadsheet: ${exportUrl}`);
    const res = await fetch(exportUrl);
    if (!res.ok) throw new Error(`Failed to fetch spreadsheet: ${res.status}`);
    csvContent = await res.text();
  }

  const allRows = parseCSV(csvContent);
  const dataRows = allRows.slice(skipRows).filter((r) => r.some((c) => c.trim()));
  console.log(`Rows to process: ${dataRows.length} (skipped ${skipRows} header rows)\n`);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const row of dataRows) {
    const rawLink             = row[COL_LESSON_LINK]?.trim() ?? "";
    const rawBroadcastDate    = row[COL_BROADCAST_DATE]?.trim() ?? "";
    const rawStatus           = row[COL_STATUS]?.trim() ?? "";
    const sheetTranscription  = row[COL_TRANSCRIPTION_LINK]?.trim() || null;

    // Skip rows with no valid KabMedia lesson link
    if (!rawLink.includes("kabbalahmedia.info")) {
      skipped++;
      continue;
    }

    const kmUid = parseKmUid(rawLink);
    if (!kmUid) {
      console.warn(`  SKIP: Cannot parse kmUid from: ${rawLink}`);
      skipped++;
      continue;
    }

    const broadcastDate  = parseBroadcastDate(rawBroadcastDate, year);
    const isPast = broadcastDate ? broadcastDate < new Date() : false;
    const approvalStatus = isPast ? "used" : mapStatus(rawStatus);

    try {
      const existing = await prisma.lesson.findUnique({
        where: { kmUid },
        select: { id: true },
      });

      if (existing) {
        // ── Update existing: only status + broadcastDate ─────────────────────
        const updateData: Record<string, unknown> = { approvalStatus };
        if (broadcastDate) updateData.broadcastDate = broadcastDate;
        if (sheetTranscription) updateData.transcriptionLink = sheetTranscription;

        if (!dryRun) {
          await prisma.lesson.update({ where: { id: existing.id }, data: updateData });
        }
        console.log(
          `  UPDATE ${kmUid}: status=${approvalStatus}` +
          (broadcastDate ? `, broadcastDate=${broadcastDate.toISOString().slice(0, 10)}` : "")
        );
        updated++;
      } else {
        // ── Create new: fetch all data from KabMedia ─────────────────────────
        process.stdout.write(`  CREATE ${kmUid}: fetching from KabMedia... `);
        let unit: Record<string, unknown>;
        try {
          unit = await fetchKmUnit(kmUid);
        } catch (e) {
          console.error(`FAILED — ${e}`);
          errors++;
          continue;
        }

        const sourceId         = (unit.sources as string[])?.[0] ?? null;
        const articleSourceLink = sourceId
          ? `https://kabbalahmedia.info/sources/${sourceId}`
          : null;
        const kmPageLink       = `https://kabbalahmedia.info/he/lessons/cu/${kmUid}`;

        // Article word count (non-blocking)
        let articleWordCount: number | null  = null;
        let articleReadingSec: number | null = null;
        let articleReadingMin: number | null = null;
        if (sourceId) {
          const wc = await fetchWordCount(sourceId, baseUrl);
          if (wc) {
            articleWordCount  = wc.wordCount;
            articleReadingSec = wc.durationSec;
            articleReadingMin = Math.round(wc.durationSec / 60);
          }
        }

        // Resolve article source ref + upsert ArticleSource
        let articleSourceRef: string | null = null;
        if (sourceId) {
          articleSourceRef = await resolveSourceRef(sourceId);
          if (!dryRun) {
            await prisma.articleSource.upsert({
              where: { id: sourceId },
              create: {
                id: sourceId,
                ref: articleSourceRef?.split(" | ").at(-1) ?? "",
                link: articleSourceLink,
                ...(articleWordCount  != null ? { wordCount:  articleWordCount  } : {}),
                ...(articleReadingSec != null ? { readingSec: articleReadingSec } : {}),
              },
              update: {
                ...(articleSourceRef ? { ref: articleSourceRef.split(" | ").at(-1) ?? "" } : {}),
                link: articleSourceLink,
                ...(articleWordCount  != null ? { wordCount:  articleWordCount  } : {}),
                ...(articleReadingSec != null ? { readingSec: articleReadingSec } : {}),
              },
            });
          }
        }

        // Narrator from Hebrew video filename
        type KmFile = { language: string; type: string; name?: string; mimetype?: string; duration?: number };
        const files = (unit.files as KmFile[] | undefined) ?? [];
        const heVideo = files.find((f) => f.language === "he" && f.type === "video");
        const narratorName = heVideo?.name?.split("_")[2] ?? null;

        // Transcription link: present when a DOCX file exists
        const hasDocx = files.some(
          (f) => f.name?.endsWith(".docx") || f.mimetype?.includes("wordprocessingml") || f.mimetype?.includes("msword")
        );
        const transcriptionLink = sheetTranscription
          ?? (hasDocx ? `https://kabbalahmedia.info/he/lessons/cu/${kmUid}?activeTab=transcription` : null);

        const videoDurationSec = heVideo?.duration != null ? Math.round(heVideo.duration) : (unit.duration ? Math.round(unit.duration as number) : null);

        const data: Record<string, unknown> = {
          kmUid,
          kmPageLink,
          sourceRef:         (unit.name as string) ?? null,
          recordingDate:     unit.film_date ? new Date(unit.film_date as string) : null,
          videoDurationSec,
          narratorName,
          transcriptionLink,
          articleSourceId:   sourceId,
          articleSourceRef,
          articleSourceLink,
          articleWordCount,
          articleReadingSec,
          articleReadingMin,
          approvalStatus,
          ...(broadcastDate ? { broadcastDate } : {}),
          ...(seriesId      ? { seriesId }       : {}),
        };

        if (!dryRun) {
          await prisma.lesson.create({ data });
        }
        console.log(`OK — "${unit.name ?? kmUid}"`);
        created++;
      }
    } catch (e) {
      console.error(`  ERROR for ${kmUid}: ${e}`);
      errors++;
    }
  }

  console.log(`\n── Summary ──────────────────────────`);
  console.log(`  Created : ${created}`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (no valid lesson link)`);
  console.log(`  Errors  : ${errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
