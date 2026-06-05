/**
 * One-time script: fetches the KabMedia source tree, builds full hierarchical
 * paths (e.g. "בעל הסולם | תלמוד עשר הספירות | חלק א"), then updates every
 * ArticleSource row whose ref differs from the computed fullPath.
 *
 * Usage: node scripts/update-article-source-refs.js [--dry-run]
 */

const { createClient } = require('@libsql/client');
const path = require('path');

const KM_BASE = 'https://kabbalahmedia.info';
const DB_PATH = path.resolve(__dirname, '../prisma/lineup.db');
const DRY_RUN = process.argv.includes('--dry-run');
const LANGS = ['he', 'ru', 'en', 'es'];

/** Recursively build id -> fullPath map from a source tree */
function collectPaths(nodes, parentPath, pathMap) {
  for (const node of nodes) {
    const label = node.full_name || node.name;
    const fullPath = parentPath ? `${parentPath} | ${label}` : label;
    // Only set if not already set (first language wins — Hebrew first)
    if (!pathMap.has(node.id)) {
      pathMap.set(node.id, fullPath);
    }
    if (node.children && node.children.length > 0) {
      collectPaths(node.children, fullPath, pathMap);
    }
  }
}

async function fetchSourceTree(lang) {
  const url = `${KM_BASE}/backend/sqdata?language=${lang}`;
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  Warning: fetch failed for lang=${lang}: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.sources ?? [];
}

async function main() {
  // 1. Fetch all language trees and build the path map (Hebrew first)
  const pathMap = new Map(); // id -> fullPath

  for (const lang of LANGS) {
    const roots = await fetchSourceTree(lang);
    collectPaths(roots, '', pathMap);
    console.log(`  After lang=${lang}: ${pathMap.size} paths known`);
  }

  console.log(`\nTotal unique source IDs in KabMedia tree: ${pathMap.size}`);

  // 2. Load all ArticleSource rows from the DB
  const db = createClient({ url: `file:${DB_PATH}` });

  const result = await db.execute('SELECT id, ref FROM ArticleSource');
  const rows = result.rows;
  console.log(`ArticleSource rows in DB: ${rows.length}`);

  // 3. Compute which rows need updating
  const updates = [];
  const noPathFound = [];

  for (const row of rows) {
    const fullPath = pathMap.get(row.id);
    if (fullPath === undefined) {
      noPathFound.push(row.id);
      continue; // Not in KabMedia tree — skip
    }
    if (row.ref !== fullPath) {
      updates.push({ id: row.id, oldRef: row.ref, newRef: fullPath });
    }
  }

  console.log(`\nRows needing update: ${updates.length}`);
  console.log(`Rows with no KabMedia path found: ${noPathFound.length}`);

  // 4. Show 3 before/after examples
  console.log('\n--- 3 before/after examples ---');
  updates.slice(0, 3).forEach(({ id, oldRef, newRef }) => {
    console.log(`  id: ${id}`);
    console.log(`    before: ${oldRef}`);
    console.log(`    after:  ${newRef}`);
    console.log();
  });

  if (DRY_RUN) {
    console.log('Dry run — no changes written.');
    db.close();
    return;
  }

  if (updates.length === 0) {
    console.log('Nothing to update.');
    db.close();
    return;
  }

  // 5. Batch updates in groups of 100
  const BATCH = 100;
  let updated = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await db.batch(
      batch.map(({ id, newRef }) => ({
        sql: 'UPDATE ArticleSource SET ref = ? WHERE id = ?',
        args: [newRef, id],
      })),
      'write'
    );
    updated += batch.length;
    process.stdout.write(`\rUpdated ${updated}/${updates.length}...`);
  }

  db.close();
  console.log(`\n\nDone. ${updated} rows updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
