/**
 * Sets LineupSlot.studyMaterialSourceId from studyMaterialLink ("…/sources/<id>")
 * for slots that have the link but no source ID, when the ArticleSource exists.
 *
 * Usage:
 *   npx tsx scripts/backfill-slot-source-ids.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import path from "path";

const DB_PATH = path.resolve(__dirname, "../prisma/lineup.db");
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = createClient({ url: `file:${DB_PATH}` });
  const slots = await db.execute(
    `SELECT id, studyMaterialLink FROM "LineupSlot"
     WHERE studyMaterialSourceId IS NULL AND studyMaterialLink LIKE '%/sources/%'`
  );
  const sources = new Set(
    (await db.execute(`SELECT id FROM "ArticleSource"`)).rows.map((r) => r.id as string)
  );

  const updates: { id: string; sourceId: string }[] = [];
  let unknown = 0;
  for (const r of slots.rows) {
    const sourceId = (r.studyMaterialLink as string).match(/\/sources\/([A-Za-z0-9_-]+)/)?.[1];
    if (sourceId && sources.has(sourceId)) updates.push({ id: r.id as string, sourceId });
    else unknown++;
  }
  console.log(`Candidates: ${slots.rows.length}, matched: ${updates.length}, no ArticleSource: ${unknown}`);
  if (DRY_RUN) return;

  for (const u of updates) {
    await db.execute({
      sql: `UPDATE "LineupSlot" SET studyMaterialSourceId = ? WHERE id = ?`,
      args: [u.sourceId, u.id],
    });
  }
  console.log(`Updated ${updates.length} slots`);
}

main().catch((e) => { console.error(e); process.exit(1); });
