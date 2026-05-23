/**
 * Parses the רב"ש article-tracking CSV (the garbled-encoding version stored in the
 * session JSONL) and updates ArticleSource records with bookVolume + bookPage.
 *
 * The file is garbled (UTF-8 Hebrew decoded as Latin-1) but ASCII URLs + page numbers
 * are intact, so we extract:
 *   – source ID  from the KabMedia URL
 *   – page number from the first numeric field on each row
 *   – volume     from the first CSV column suffix (×\x90=א→1, ×\x91=ב→2, ×\x92=ג→3)
 *                or falls back to page-range heuristic
 *
 * Usage:
 *   npx tsx scripts/import-ravash-csv.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const DB_PATH  = path.resolve(__dirname, "../prisma/lineup.db");
const CSV_PATH = path.resolve(__dirname, "../pdf/ravash_tracking.csv");
const DRY_RUN  = process.argv.includes("--dry-run");

// Garbled volume-suffix constants (UTF-8 Hebrew decoded as Latin-1 in the JSONL)
// א→U+0090, ב→U+0091, ג→U+0092 (each preceded by × = U+00D7)
const VOL1_SUFFIX = "\u00d7\u0090'";  // ×\x90' = א
const VOL2_SUFFIX = "\u00d7\u0091'";  // ×\x91' = ב
const VOL3_SUFFIX = "\u00d7\u0092'";  // ×\x92' = ג

interface Row {
  sourceId: string;
  page: number;
  volume: number | null;
}

function parseCSV(content: string): Row[] {
  const rows: Row[] = [];

  for (const line of content.split("\n")) {
    if (!line.includes("kabbalahmedia.info/he/sources/")) continue;

    // Extract source ID
    const idMatch = line.match(/kabbalahmedia\.info\/he\/sources\/([A-Za-z0-9]+)/);
    if (!idMatch) continue;
    const sourceId = idMatch[1];

    // Extract first standalone number before the URL (the page number)
    const prefix = line.slice(0, line.indexOf("https://"));
    const numMatches = prefix.match(/(?:^|,)\s*(\d+)\s*(?:,|$)/g);
    if (!numMatches) continue;
    const page = parseInt(numMatches[0].replace(/[^0-9]/g, ""));
    if (!page) continue;

    // Determine volume from first column suffix
    const parts = line.split(",");
    const col0 = parts[0] ?? "";
    let volume: number | null;
    if (col0.endsWith(VOL1_SUFFIX)) {
      volume = 1;
    } else if (col0.endsWith(VOL2_SUFFIX)) {
      volume = 2;
    } else if (col0.endsWith(VOL3_SUFFIX)) {
      volume = 3;
    } else {
      // Fallback: page-range heuristic
      volume = page >= 1601 ? 3 : page >= 1423 ? 2 : null;
    }

    rows.push({ sourceId, page, volume });
  }

  return rows;
}

async function main() {
  let content: string;
  try {
    content = readFileSync(CSV_PATH, "utf-8");
  } catch {
    console.error(`CSV not found at ${CSV_PATH}`);
    console.error("Please copy the רב\"ש tracking CSV to that path (UTF-8).");
    process.exit(1);
  }

  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const volDist: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r.volume ?? "null");
    volDist[k] = (volDist[k] ?? 0) + 1;
  }
  console.log("Volume distribution:", volDist);

  if (DRY_RUN) {
    console.log("\nDry run — no changes written.");
    console.log("First 5 rows:", rows.slice(0, 5));
    return;
  }

  const db = createClient({ url: `file:${DB_PATH}` });

  // Check how many source IDs exist in DB
  const existing = await db.execute(
    `SELECT id FROM ArticleSource WHERE id IN (${rows.map(() => "?").join(",")})`,
    rows.map((r) => r.sourceId)
  );
  console.log(`\nSource IDs found in DB: ${existing.rows.length} / ${rows.length}`);

  // Batch update
  const BATCH = 200;
  let done = 0;
  let skipped = 0;
  const existingIds = new Set(existing.rows.map((r) => r.id as string));

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).filter((r) => existingIds.has(r.sourceId));
    skipped += rows.slice(i, i + BATCH).length - batch.length;

    if (batch.length === 0) continue;

    await db.batch(
      batch.map(({ sourceId, page, volume }) => ({
        sql: "UPDATE ArticleSource SET bookVolume = ?, bookPage = ? WHERE id = ?",
        args: [volume, page, sourceId],
      })),
      "write"
    );
    done += batch.length;
    process.stdout.write(`\r${done + skipped}/${rows.length} processed`);
  }

  db.close();
  console.log(`\nDone. ${done} records updated, ${skipped} source IDs not in DB.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
