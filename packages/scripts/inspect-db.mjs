#!/usr/bin/env node
/**
 * T3X Database Inspector
 *
 * Inspects PostgreSQL database contents for debugging.
 *
 * Usage:
 *   node scripts/inspect-db.mjs                    # Default: connect to embedded PostgreSQL
 *   T3X_PG_PORT=5445 node scripts/inspect-db.mjs   # Custom port
 */

import postgres from 'postgres';

const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
const connectionString = `postgresql://postgres:password@localhost:${port}/t3x`;

console.log('========================================');
console.log(' T3X Database Inspector');
console.log('========================================');
console.log(`Port: ${port}`);
console.log('');

const sql = postgres(connectionString);

try {
  // List all tables
  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  console.log('=== Tables ===');
  for (const { tablename } of tables) {
    const count = await sql.unsafe(`SELECT COUNT(*) as count FROM "${tablename}"`);
    console.log(`  ${tablename}: ${count[0].count} rows`);
  }

  // Projects
  console.log('\n=== Projects ===');
  const projects = await sql`
    SELECT project_id, name, created_at FROM projects ORDER BY created_at DESC LIMIT 5
  `;
  if (projects.length === 0) {
    console.log('  (empty)');
  } else {
    projects.forEach((p) => {
      console.log(`  [${p.project_id}] ${p.name}`);
    });
  }

  // Conversations
  console.log('\n=== Conversations ===');
  const convs = await sql`
    SELECT c.conversation_id, c.title, p.name as project_name
    FROM conversations c
    JOIN projects p ON c.project_id = p.project_id
    ORDER BY c.created_at DESC LIMIT 5
  `;
  if (convs.length === 0) {
    console.log('  (empty)');
  } else {
    convs.forEach((c) => {
      console.log(`  [${c.conversation_id}] ${c.title || '(untitled)'} (${c.project_name})`);
    });
  }

  // Recent turns
  console.log('\n=== Recent Turns ===');
  const turns = await sql`
    SELECT turn_hash, role, LEFT(content, 60) as content_preview, created_at
    FROM turns_v2
    ORDER BY created_at DESC LIMIT 5
  `;
  if (turns.length === 0) {
    console.log('  (empty)');
  } else {
    turns.forEach((t) => {
      const preview = t.content_preview.replace(/\n/g, ' ');
      console.log(`  [${t.role}] ${preview}...`);
      console.log(`       hash: ${t.turn_hash.substring(0, 30)}...`);
    });
  }

  // Commits
  console.log('\n=== Commits ===');
  const commits = await sql`
    SELECT commit_hash, branch, message, created_at
    FROM commits_v2
    ORDER BY created_at DESC LIMIT 5
  `;
  if (commits.length === 0) {
    console.log('  (empty)');
  } else {
    commits.forEach((c) => {
      console.log(`  [${c.branch}] ${c.message || '(no message)'}`);
      console.log(`       hash: ${c.commit_hash.substring(0, 30)}...`);
    });
  }

  // Branches
  console.log('\n=== Branches ===');
  const branches = await sql`
    SELECT b.name, b.is_current, b.head_commit_hash, p.name as project_name
    FROM branches b
    JOIN projects p ON b.project_id = p.project_id
    ORDER BY b.created_at DESC LIMIT 5
  `;
  if (branches.length === 0) {
    console.log('  (empty)');
  } else {
    branches.forEach((b) => {
      const current = b.is_current ? ' *' : '';
      const head = b.head_commit_hash
        ? b.head_commit_hash.substring(0, 20) + '...'
        : '(no commits)';
      console.log(`  ${b.name}${current} → ${head} (${b.project_name})`);
    });
  }

  console.log('\n========================================');
  console.log(' Done!');
  console.log('========================================');
} catch (err) {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
    console.log(`Database not reachable on port ${port}. Start the API server first:`);
    console.log('  pnpm dev:api');
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
} finally {
  await sql.end();
}
