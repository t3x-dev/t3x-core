#!/usr/bin/env node
/**
 * Database Inspector
 *
 * Standalone script to inspect the PGLite database.
 * Works independently of Next.js bundler.
 *
 * Usage:
 *   node scripts/db-inspector.mjs                     # Interactive mode
 *   node scripts/db-inspector.mjs "SELECT * FROM projects"  # Run single query
 */

import { createInterface } from 'readline';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Find the database directory
const dbPaths = [
  './t3x-webui/.t3x/database',
  './.t3x/database',
  process.env.T3X_DATA_DIR,
].filter(Boolean);

let dbPath = dbPaths.find(p => existsSync(resolve(p)));

if (!dbPath) {
  console.log('No existing database found. Will create new one at: .t3x/database');
  dbPath = '.t3x/database';
}

console.log(`\n  Database Inspector`);
console.log(`  Database: ${resolve(dbPath)}`);
console.log(`  ─────────────────────────────────────`);

// Dynamic import PGLite
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite(dbPath);

// Helper to format table output
function formatTable(rows, fields) {
  if (!rows || rows.length === 0) {
    return '  (no rows)';
  }

  const headers = fields?.map(f => f.name) || Object.keys(rows[0]);
  const colWidths = headers.map(h => h.length);

  // Calculate column widths
  rows.forEach(row => {
    headers.forEach((h, i) => {
      const val = String(row[h] ?? '');
      const truncated = val.length > 50 ? val.slice(0, 47) + '...' : val;
      colWidths[i] = Math.max(colWidths[i], truncated.length);
    });
  });

  // Build table
  const lines = [];
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');

  lines.push('  ' + headerLine);
  lines.push('  ' + separator);

  rows.forEach(row => {
    const rowLine = headers.map((h, i) => {
      let val = String(row[h] ?? '');
      if (val.length > 50) val = val.slice(0, 47) + '...';
      return val.padEnd(colWidths[i]);
    }).join(' | ');
    lines.push('  ' + rowLine);
  });

  return lines.join('\n');
}

// Run a query and print results
async function runQuery(sql) {
  try {
    const start = Date.now();
    const result = await db.query(sql);
    const elapsed = Date.now() - start;

    console.log();
    console.log(formatTable(result.rows, result.fields));
    console.log(`\n  ${result.rows.length} row(s) in ${elapsed}ms`);
  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
  }
}

// Show table info
async function showTables() {
  const result = await db.query(`
    SELECT tablename as name
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  console.log('\n  Tables:');
  for (const row of result.rows) {
    const countResult = await db.query(`SELECT COUNT(*) as count FROM "${row.name}"`);
    console.log(`    ${row.name}: ${countResult.rows[0].count} rows`);
  }
}

// Check for single query mode
const queryArg = process.argv[2];
if (queryArg) {
  await runQuery(queryArg);
  await db.close();
  process.exit(0);
}

// Interactive mode
console.log('\n  Commands:');
console.log('    .tables     Show all tables with row counts');
console.log('    .quit       Exit');
console.log('    <SQL>       Run SQL query');
console.log();

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '  sql> '
});

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input === '.quit' || input === '.exit') {
    console.log('\n  Goodbye!\n');
    await db.close();
    rl.close();
    return;
  }

  if (input === '.tables') {
    await showTables();
  } else {
    await runQuery(input);
  }

  console.log();
  rl.prompt();
});

rl.on('close', () => {
  process.exit(0);
});
