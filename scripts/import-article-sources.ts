/**
 * One-time script: fetches the full KabMedia source tree and upserts every
 * source node into the local ArticleSource table.
 *
 * Usage:
 *   npx tsx scripts/import-article-sources.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import path from "path";

const KM_BASE = "https://kabbalahmedia.info";
const DB_PATH = path.resolve(__dirname, "../prisma/lineup.db");
const DRY_RUN = process.argv.includes("--dry-run");

interface SourceNode {
  id: string;
  name: string;
  full_name?: string;
  children?: SourceNode[];
}

/** Recursively collect every node from the tree */
function collectAll(nodes: SourceNode[], results: Map<string, { ref: string; url: string }>) {
  for (const node of nodes) {
    if (!results.has(node.id)) {
      results.set(node.id, {
        ref: node.full_name || node.name,
        url: `${KM_BASE}/sources/${node.id}`,
      });
    }
    if (node.children?.length) {
      collectAll(node.children, results);
    }
  }
}

async function main() {
  console.log(`Fetching source tree from KabMedia...`);
  const res = await fetch(`${KM_BASE}/backend/sqdata?language=he`);
  if (!res.ok) throw new Error(`sqdata fetch failed: ${res.status}`);
  const data = await res.json();
  const roots: SourceNode[] = data.sources ?? [];

  const sources = new Map<string, { ref: string; url: string }>();
  collectAll(roots, sources);
  console.log(`Found ${sources.size} sources in KabMedia tree`);

  if (DRY_RUN) {
    console.log("Dry run — no changes written.");
    return;
  }

  const db = createClient({ url: `file:${DB_PATH}` });

  const entries = Array.from(sources.entries());
  const BATCH = 200;
  let total = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const stmts = batch.map(([id, { ref, url }]) => ({
      sql: `INSERT INTO ArticleSource (id, ref, link)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              ref  = CASE WHEN excluded.ref != '' THEN excluded.ref ELSE ArticleSource.ref END,
              link = COALESCE(ArticleSource.link, excluded.link)`,
      args: [id, ref, url],
    }));
    await db.batch(stmts, "write");
    total += batch.length;
    process.stdout.write(`\r${total}/${entries.length}`);
  }

  db.close();
  console.log(`\nDone. ${total} sources upserted.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
