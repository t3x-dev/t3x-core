#!/usr/bin/env node

/**
 * Database Inspector
 *
 * Connects to embedded PostgreSQL and provides an interactive SQL prompt.
 * Requires the API server to be running first (pnpm dev:api).
 *
 * Usage:
 *   node scripts/db-inspector.mjs                     # Interactive mode
 *   node scripts/db-inspector.mjs "SELECT * FROM projects"  # Run single query
 */

import postgres from 'postgres';
import { createInterface } from 'readline';

const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
const connectionString = `postgresql://postgres:password@localhost:${port}/t3x`;

console.log(`\n  Database Inspector`);
console.log(`  Database: localhost:${port}/t3x`);
console.log(`  ─────────────────────────────────────`);

const db = postgres(connectionString);

// Helper to format table output
function formatTable(rows) {
  if (!rows || rows.length === 0) {
    return '  (no rows)';
  }

  const headers = Object.keys(rows[0]);
  const colWidths = headers.map((h) => h.length);

  // Calculate column widths
  rows.forEach((row) => {
    headers.forEach((h, i) => {
      const val = String(row[h] ?? '');
      const truncated = val.length > 50 ? val.slice(0, 47) + '...' : val;
      colWidths[i] = Math.max(colWidths[i], truncated.length);
    });
  });

  // Build table
  const lines = [];
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const separator = colWidths.map((w) => '─'.repeat(w)).join('─┼─');

  lines.push('  ' + headerLine);
  lines.push('  ' + separator);

  rows.forEach((row) => {
    const rowLine = headers
      .map((h, i) => {
        let val = String(row[h] ?? '');
        if (val.length > 50) val = val.slice(0, 47) + '...';
        return val.padEnd(colWidths[i]);
      })
      .join(' | ');
    lines.push('  ' + rowLine);
  });

  return lines.join('\n');
}

// Run a query and print results
async function runQuery(sqlStr) {
  try {
    const start = Date.now();
    const result = await db.unsafe(sqlStr);
    const elapsed = Date.now() - start;

    console.log();
    console.log(formatTable(result));
    console.log(`\n  ${result.length} row(s) in ${elapsed}ms`);
  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
  }
}

// Show table info
async function showTables() {
  const result = await db`
    SELECT tablename as name
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  console.log('\n  Tables:');
  for (const row of result) {
    const countResult = await db.unsafe(`SELECT COUNT(*) as count FROM "${row.name}"`);
    console.log(`    ${row.name}: ${countResult[0].count} rows`);
  }
}

// Check for single query mode
const queryArg = process.argv[2];
if (queryArg) {
  try {
    await runQuery(queryArg);
  } finally {
    await db.end();
  }
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
  prompt: '  sql> ',
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
    await db.end();
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
