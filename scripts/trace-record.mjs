#!/usr/bin/env node
/**
 * T3X Record Tracer
 *
 * Traces a specific record through the database with full details.
 *
 * Usage:
 *   node scripts/trace-record.mjs project <project_id>
 *   node scripts/trace-record.mjs conversation <conversation_id>
 *   node scripts/trace-record.mjs turn <turn_hash>
 *   node scripts/trace-record.mjs commit <commit_hash>
 *   node scripts/trace-record.mjs all                          # Show everything
 */

import { PGlite } from '@electric-sql/pglite';

const dataDir = process.env.T3X_DB || './t3x-webui/.t3x/database';
const [,, command, id] = process.argv;

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  const client = new PGlite(dataDir);

  console.log(`${DIM}Database: ${dataDir}${RESET}\n`);

  switch (command) {
    case 'project':
      await traceProject(client, id);
      break;
    case 'conversation':
    case 'conv':
      await traceConversation(client, id);
      break;
    case 'turn':
      await traceTurn(client, id);
      break;
    case 'commit':
      await traceCommit(client, id);
      break;
    case 'all':
      await showAll(client);
      break;
    default:
      console.log('Usage:');
      console.log('  node scripts/trace-record.mjs project <project_id>');
      console.log('  node scripts/trace-record.mjs conversation <conversation_id>');
      console.log('  node scripts/trace-record.mjs turn <turn_hash>');
      console.log('  node scripts/trace-record.mjs commit <commit_hash>');
      console.log('  node scripts/trace-record.mjs all');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/trace-record.mjs project proj_abc123');
      console.log('  node scripts/trace-record.mjs turn sha256:abc...');
      console.log('  node scripts/trace-record.mjs all');
  }

  await client.close();
}

async function traceProject(client, projectId) {
  console.log(`${CYAN}=== Tracing Project: ${projectId} ===${RESET}\n`);

  // Get project
  const project = await client.query(
    'SELECT * FROM projects WHERE project_id = $1',
    [projectId]
  );

  if (project.rows.length === 0) {
    console.log('Project not found.');
    return;
  }

  const p = project.rows[0];
  console.log(`${GREEN}Project Record:${RESET}`);
  console.log(JSON.stringify(p, null, 2));

  // Get conversations
  const convs = await client.query(
    'SELECT conversation_id, title, created_at FROM conversations WHERE project_id = $1 ORDER BY created_at',
    [projectId]
  );
  console.log(`\n${GREEN}Conversations (${convs.rows.length}):${RESET}`);
  convs.rows.forEach(c => {
    console.log(`  - ${c.conversation_id}: ${c.title || '(untitled)'}`);
  });

  // Get branches
  const branches = await client.query(
    'SELECT name, is_current, head_commit_hash FROM branches WHERE project_id = $1',
    [projectId]
  );
  console.log(`\n${GREEN}Branches (${branches.rows.length}):${RESET}`);
  branches.rows.forEach(b => {
    const current = b.is_current ? ' *' : '';
    console.log(`  - ${b.name}${current} → ${b.head_commit_hash || '(no commits)'}`);
  });

  // Get turn count
  const turnCount = await client.query(
    'SELECT COUNT(*) as count FROM turns_v2 WHERE project_id = $1',
    [projectId]
  );
  console.log(`\n${GREEN}Total Turns:${RESET} ${turnCount.rows[0].count}`);

  // Get commit count
  const commitCount = await client.query(
    'SELECT COUNT(*) as count FROM commits_v2 WHERE project_id = $1',
    [projectId]
  );
  console.log(`${GREEN}Total Commits:${RESET} ${commitCount.rows[0].count}`);
}

async function traceConversation(client, convId) {
  console.log(`${CYAN}=== Tracing Conversation: ${convId} ===${RESET}\n`);

  // Get conversation
  const conv = await client.query(
    'SELECT * FROM conversations WHERE conversation_id = $1',
    [convId]
  );

  if (conv.rows.length === 0) {
    console.log('Conversation not found.');
    return;
  }

  const c = conv.rows[0];
  console.log(`${GREEN}Conversation Record:${RESET}`);
  console.log(JSON.stringify(c, null, 2));

  // Get parent project
  const project = await client.query(
    'SELECT project_id, name FROM projects WHERE project_id = $1',
    [c.project_id]
  );
  console.log(`\n${GREEN}Parent Project:${RESET} ${project.rows[0]?.name} (${c.project_id})`);

  // Get turns in this conversation
  const turns = await client.query(`
    SELECT turn_hash, parent_turn_hash, role, LEFT(content, 80) as content_preview, created_at
    FROM turns_v2
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [convId]);

  console.log(`\n${GREEN}Turns (${turns.rows.length}):${RESET}`);
  turns.rows.forEach((t, i) => {
    const parent = t.parent_turn_hash ? `← ${t.parent_turn_hash.substring(0, 15)}...` : '← (root)';
    console.log(`\n  ${YELLOW}[${i + 1}] ${t.role}${RESET} ${parent}`);
    console.log(`      hash: ${t.turn_hash}`);
    console.log(`      content: "${t.content_preview}..."`);
  });
}

async function traceTurn(client, turnHash) {
  console.log(`${CYAN}=== Tracing Turn: ${turnHash} ===${RESET}\n`);

  // Get turn
  const turn = await client.query(
    'SELECT * FROM turns_v2 WHERE turn_hash = $1',
    [turnHash]
  );

  if (turn.rows.length === 0) {
    console.log('Turn not found.');
    return;
  }

  const t = turn.rows[0];

  console.log(`${GREEN}Turn Record:${RESET}`);
  console.log(`  turn_hash: ${t.turn_hash}`);
  console.log(`  parent_turn_hash: ${t.parent_turn_hash || '(none - root turn)'}`);
  console.log(`  project_id: ${t.project_id}`);
  console.log(`  conversation_id: ${t.conversation_id}`);
  console.log(`  role: ${t.role}`);
  console.log(`  language: ${t.language || '(auto)'}`);
  console.log(`  created_at: ${t.created_at}`);
  console.log(`\n${GREEN}Content:${RESET}`);
  console.log(`  "${t.content}"`);

  // Parse and show rings if present
  if (t.rings_json) {
    console.log(`\n${GREEN}Extracted Rings:${RESET}`);
    try {
      const rings = JSON.parse(t.rings_json);
      console.log(JSON.stringify(rings, null, 2));
    } catch {
      console.log(`  ${t.rings_json}`);
    }
  }

  // Show parent chain
  console.log(`\n${GREEN}Turn Chain (walking back):${RESET}`);
  let current = t;
  let depth = 0;
  while (current && depth < 10) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}↳ [${current.role}] ${current.turn_hash.substring(0, 30)}...`);
    if (!current.parent_turn_hash) break;
    const parent = await client.query(
      'SELECT * FROM turns_v2 WHERE turn_hash = $1',
      [current.parent_turn_hash]
    );
    current = parent.rows[0];
    depth++;
  }

  // Check if this turn is in any commit's turn window
  const commits = await client.query(`
    SELECT commit_hash, branch, message, turn_window_json
    FROM commits_v2
    WHERE turn_window_json LIKE $1 OR turn_window_json LIKE $2
  `, [`%${turnHash}%`, `%${turnHash}%`]);

  if (commits.rows.length > 0) {
    console.log(`\n${GREEN}Referenced in Commits:${RESET}`);
    commits.rows.forEach(c => {
      console.log(`  - ${c.commit_hash.substring(0, 30)}... (${c.branch})`);
    });
  }
}

async function traceCommit(client, commitHash) {
  console.log(`${CYAN}=== Tracing Commit: ${commitHash} ===${RESET}\n`);

  // Get commit
  const commit = await client.query(
    'SELECT * FROM commits_v2 WHERE commit_hash = $1',
    [commitHash]
  );

  if (commit.rows.length === 0) {
    console.log('Commit not found.');
    return;
  }

  const c = commit.rows[0];

  console.log(`${GREEN}Commit Record:${RESET}`);
  console.log(`  commit_hash: ${c.commit_hash}`);
  console.log(`  project_id: ${c.project_id}`);
  console.log(`  branch: ${c.branch}`);
  console.log(`  message: ${c.message || '(no message)'}`);
  console.log(`  created_at: ${c.created_at}`);

  // Parents
  if (c.parents_json) {
    const parents = JSON.parse(c.parents_json);
    console.log(`\n${GREEN}Parent Commits:${RESET}`);
    if (parents.length === 0) {
      console.log('  (root commit)');
    } else {
      parents.forEach(p => console.log(`  - ${p}`));
    }
  }

  // Turn window
  if (c.turn_window_json) {
    const tw = JSON.parse(c.turn_window_json);
    console.log(`\n${GREEN}Turn Window:${RESET}`);
    console.log(`  start: ${tw.start_turn_hash}`);
    console.log(`  end: ${tw.end_turn_hash}`);

    // Count turns in window
    // This is simplified - real implementation would walk the chain
    const turns = await client.query(`
      SELECT COUNT(*) as count FROM turns_v2
      WHERE conversation_id = (
        SELECT conversation_id FROM turns_v2 WHERE turn_hash = $1
      )
    `, [tw.start_turn_hash]);
    console.log(`  (conversation has ${turns.rows[0].count} total turns)`);
  }

  // Facet snapshot
  if (c.facet_snapshot_json) {
    console.log(`\n${GREEN}Facet Snapshot:${RESET}`);
    try {
      const facets = JSON.parse(c.facet_snapshot_json);
      console.log(JSON.stringify(facets, null, 2));
    } catch {
      console.log(`  ${c.facet_snapshot_json}`);
    }
  }

  // Draft reference
  if (c.draft_id) {
    console.log(`\n${GREEN}Linked Draft:${RESET} ${c.draft_id}`);
  }
}

async function showAll(client) {
  console.log(`${CYAN}=== All Records ===${RESET}\n`);

  // Projects
  const projects = await client.query('SELECT * FROM projects ORDER BY created_at DESC');
  console.log(`${GREEN}Projects (${projects.rows.length}):${RESET}`);
  projects.rows.forEach(p => {
    console.log(`\n  ${YELLOW}${p.project_id}${RESET}`);
    console.log(`    name: ${p.name}`);
    console.log(`    created: ${p.created_at}`);
    if (p.metadata_json) console.log(`    metadata: ${p.metadata_json}`);
  });

  // Conversations
  const convs = await client.query('SELECT * FROM conversations ORDER BY created_at DESC');
  console.log(`\n${GREEN}Conversations (${convs.rows.length}):${RESET}`);
  convs.rows.forEach(c => {
    console.log(`\n  ${YELLOW}${c.conversation_id}${RESET}`);
    console.log(`    project: ${c.project_id}`);
    console.log(`    title: ${c.title || '(untitled)'}`);
    console.log(`    position: (${c.position_x}, ${c.position_y})`);
  });

  // Turns
  const turns = await client.query('SELECT * FROM turns_v2 ORDER BY created_at DESC LIMIT 10');
  console.log(`\n${GREEN}Recent Turns (showing 10):${RESET}`);
  turns.rows.forEach(t => {
    console.log(`\n  ${YELLOW}${t.turn_hash.substring(0, 40)}...${RESET}`);
    console.log(`    role: ${t.role}`);
    console.log(`    content: "${t.content.substring(0, 60)}..."`);
    console.log(`    parent: ${t.parent_turn_hash || '(root)'}`);
  });

  // Commits
  const commits = await client.query('SELECT * FROM commits_v2 ORDER BY created_at DESC');
  console.log(`\n${GREEN}Commits (${commits.rows.length}):${RESET}`);
  commits.rows.forEach(c => {
    console.log(`\n  ${YELLOW}${c.commit_hash.substring(0, 40)}...${RESET}`);
    console.log(`    branch: ${c.branch}`);
    console.log(`    message: ${c.message || '(no message)'}`);
    const parents = JSON.parse(c.parents_json || '[]');
    console.log(`    parents: ${parents.length === 0 ? '(root)' : parents.map(p => p.substring(0, 20) + '...').join(', ')}`);
  });

  // Summary
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM projects) as projects,
      (SELECT COUNT(*) FROM conversations) as conversations,
      (SELECT COUNT(*) FROM turns_v2) as turns,
      (SELECT COUNT(*) FROM commits_v2) as commits,
      (SELECT COUNT(*) FROM branches) as branches
  `);
  const s = counts.rows[0];
  console.log(`\n${GREEN}Summary:${RESET}`);
  console.log(`  Projects: ${s.projects} | Conversations: ${s.conversations} | Turns: ${s.turns} | Commits: ${s.commits} | Branches: ${s.branches}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
