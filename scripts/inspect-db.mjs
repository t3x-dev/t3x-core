#!/usr/bin/env node
/**
 * T3X Database Inspector
 *
 * Inspects PGLite database contents for debugging.
 *
 * Usage:
 *   node scripts/inspect-db.mjs                    # Default: ./t3x-webui/.t3x/database
 *   node scripts/inspect-db.mjs /path/to/database
 */

import { PGlite } from '@electric-sql/pglite';

const dataDir = process.argv[2] || './t3x-webui/.t3x/database';

console.log('========================================');
console.log(' T3X Database Inspector');
console.log('========================================');
console.log(`Database: ${dataDir}`);
console.log('');

try {
  const client = new PGlite(dataDir);

  // List all tables
  const tables = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  console.log('=== Tables ===');
  for (const { tablename } of tables.rows) {
    const count = await client.query(`SELECT COUNT(*) as count FROM "${tablename}"`);
    console.log(`  ${tablename}: ${count.rows[0].count} rows`);
  }

  // Projects
  console.log('\n=== Projects ===');
  const projects = await client.query('SELECT project_id, name, created_at FROM projects ORDER BY created_at DESC LIMIT 5');
  if (projects.rows.length === 0) {
    console.log('  (empty)');
  } else {
    projects.rows.forEach(p => {
      console.log(`  [${p.project_id}] ${p.name}`);
    });
  }

  // Conversations
  console.log('\n=== Conversations ===');
  const convs = await client.query(`
    SELECT c.conversation_id, c.title, p.name as project_name
    FROM conversations c
    JOIN projects p ON c.project_id = p.project_id
    ORDER BY c.created_at DESC LIMIT 5
  `);
  if (convs.rows.length === 0) {
    console.log('  (empty)');
  } else {
    convs.rows.forEach(c => {
      console.log(`  [${c.conversation_id}] ${c.title || '(untitled)'} (${c.project_name})`);
    });
  }

  // Recent turns
  console.log('\n=== Recent Turns ===');
  const turns = await client.query(`
    SELECT turn_hash, role, LEFT(content, 60) as content_preview, created_at
    FROM turns_v2
    ORDER BY created_at DESC LIMIT 5
  `);
  if (turns.rows.length === 0) {
    console.log('  (empty)');
  } else {
    turns.rows.forEach(t => {
      const preview = t.content_preview.replace(/\n/g, ' ');
      console.log(`  [${t.role}] ${preview}...`);
      console.log(`       hash: ${t.turn_hash.substring(0, 30)}...`);
    });
  }

  // Commits
  console.log('\n=== Commits ===');
  const commits = await client.query(`
    SELECT commit_hash, branch, message, created_at
    FROM commits_v2
    ORDER BY created_at DESC LIMIT 5
  `);
  if (commits.rows.length === 0) {
    console.log('  (empty)');
  } else {
    commits.rows.forEach(c => {
      console.log(`  [${c.branch}] ${c.message || '(no message)'}`);
      console.log(`       hash: ${c.commit_hash.substring(0, 30)}...`);
    });
  }

  // Branches
  console.log('\n=== Branches ===');
  const branches = await client.query(`
    SELECT b.name, b.is_current, b.head_commit_hash, p.name as project_name
    FROM branches b
    JOIN projects p ON b.project_id = p.project_id
    ORDER BY b.created_at DESC LIMIT 5
  `);
  if (branches.rows.length === 0) {
    console.log('  (empty)');
  } else {
    branches.rows.forEach(b => {
      const current = b.is_current ? ' *' : '';
      const head = b.head_commit_hash ? b.head_commit_hash.substring(0, 20) + '...' : '(no commits)';
      console.log(`  ${b.name}${current} → ${head} (${b.project_name})`);
    });
  }

  await client.close();
  console.log('\n========================================');
  console.log(' Done!');
  console.log('========================================');

} catch (err) {
  if (err.code === 'ENOENT' || err.message.includes('does not exist')) {
    console.log('Database not found. Start the webui first:');
    console.log('  cd t3x-webui && npm run dev');
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
}
