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

import postgres from 'postgres';

const port = parseInt(process.env.T3X_PG_PORT || '', 10) || 5445;
const connectionString = `postgresql://postgres:password@localhost:${port}/t3x`;
const [, , command, id] = process.argv;

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function main() {
  const sql = postgres(connectionString);

  console.log(`${DIM}Database: localhost:${port}/t3x${RESET}\n`);

  try {
    switch (command) {
      case 'project':
        await traceProject(sql, id);
        break;
      case 'conversation':
      case 'conv':
        await traceConversation(sql, id);
        break;
      case 'turn':
        await traceTurn(sql, id);
        break;
      case 'commit':
        await traceCommit(sql, id);
        break;
      case 'all':
        await showAll(sql);
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
  } finally {
    await sql.end();
  }
}

async function traceProject(sql, projectId) {
  console.log(`${CYAN}=== Tracing Project: ${projectId} ===${RESET}\n`);

  // Get project
  const project = await sql`SELECT * FROM projects WHERE project_id = ${projectId}`;

  if (project.length === 0) {
    console.log('Project not found.');
    return;
  }

  const p = project[0];
  console.log(`${GREEN}Project Record:${RESET}`);
  console.log(JSON.stringify(p, null, 2));

  // Get conversations
  const convs = await sql`
    SELECT conversation_id, title, created_at FROM conversations
    WHERE project_id = ${projectId} ORDER BY created_at
  `;
  console.log(`\n${GREEN}Conversations (${convs.length}):${RESET}`);
  convs.forEach((c) => {
    console.log(`  - ${c.conversation_id}: ${c.title || '(untitled)'}`);
  });

  // Get branches
  const branches = await sql`
    SELECT name, is_current, head_commit_hash FROM branches WHERE project_id = ${projectId}
  `;
  console.log(`\n${GREEN}Branches (${branches.length}):${RESET}`);
  branches.forEach((b) => {
    const current = b.is_current ? ' *' : '';
    console.log(`  - ${b.name}${current} → ${b.head_commit_hash || '(no commits)'}`);
  });

  // Get turn count
  const turnCount =
    await sql`SELECT COUNT(*) as count FROM turns_v2 WHERE project_id = ${projectId}`;
  console.log(`\n${GREEN}Total Turns:${RESET} ${turnCount[0].count}`);

  // Get commit count
  const commitCount =
    await sql`SELECT COUNT(*) as count FROM commits_v2 WHERE project_id = ${projectId}`;
  console.log(`${GREEN}Total Commits:${RESET} ${commitCount[0].count}`);
}

async function traceConversation(sql, convId) {
  console.log(`${CYAN}=== Tracing Conversation: ${convId} ===${RESET}\n`);

  // Get conversation
  const conv = await sql`SELECT * FROM conversations WHERE conversation_id = ${convId}`;

  if (conv.length === 0) {
    console.log('Conversation not found.');
    return;
  }

  const c = conv[0];
  console.log(`${GREEN}Conversation Record:${RESET}`);
  console.log(JSON.stringify(c, null, 2));

  // Get parent project
  const project =
    await sql`SELECT project_id, name FROM projects WHERE project_id = ${c.project_id}`;
  console.log(`\n${GREEN}Parent Project:${RESET} ${project[0]?.name} (${c.project_id})`);

  // Get turns in this conversation
  const turns = await sql`
    SELECT turn_hash, parent_turn_hash, role, LEFT(content, 80) as content_preview, created_at
    FROM turns_v2
    WHERE conversation_id = ${convId}
    ORDER BY created_at ASC
  `;

  console.log(`\n${GREEN}Turns (${turns.length}):${RESET}`);
  turns.forEach((t, i) => {
    const parent = t.parent_turn_hash ? `← ${t.parent_turn_hash.substring(0, 15)}...` : '← (root)';
    console.log(`\n  ${YELLOW}[${i + 1}] ${t.role}${RESET} ${parent}`);
    console.log(`      hash: ${t.turn_hash}`);
    console.log(`      content: "${t.content_preview}..."`);
  });
}

async function traceTurn(sql, turnHash) {
  console.log(`${CYAN}=== Tracing Turn: ${turnHash} ===${RESET}\n`);

  // Get turn
  const turn = await sql`SELECT * FROM turns_v2 WHERE turn_hash = ${turnHash}`;

  if (turn.length === 0) {
    console.log('Turn not found.');
    return;
  }

  const t = turn[0];

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
    const parent = await sql`SELECT * FROM turns_v2 WHERE turn_hash = ${current.parent_turn_hash}`;
    current = parent[0];
    depth++;
  }

  // Check if this turn is in any commit's turn window
  const commits = await sql.unsafe(
    `
    SELECT commit_hash, branch, message, turn_window_json
    FROM commits_v2
    WHERE turn_window_json LIKE $1 OR turn_window_json LIKE $2
  `,
    [`%${turnHash}%`, `%${turnHash}%`]
  );

  if (commits.length > 0) {
    console.log(`\n${GREEN}Referenced in Commits:${RESET}`);
    commits.forEach((c) => {
      console.log(`  - ${c.commit_hash.substring(0, 30)}... (${c.branch})`);
    });
  }
}

async function traceCommit(sql, commitHash) {
  console.log(`${CYAN}=== Tracing Commit: ${commitHash} ===${RESET}\n`);

  // Get commit
  const commit = await sql`SELECT * FROM commits_v2 WHERE commit_hash = ${commitHash}`;

  if (commit.length === 0) {
    console.log('Commit not found.');
    return;
  }

  const c = commit[0];

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
      parents.forEach((p) => console.log(`  - ${p}`));
    }
  }

  // Turn window
  if (c.turn_window_json) {
    const tw = JSON.parse(c.turn_window_json);
    console.log(`\n${GREEN}Turn Window:${RESET}`);
    console.log(`  start: ${tw.start_turn_hash}`);
    console.log(`  end: ${tw.end_turn_hash}`);

    // Count turns in window
    const turns = await sql`
      SELECT COUNT(*) as count FROM turns_v2
      WHERE conversation_id = (
        SELECT conversation_id FROM turns_v2 WHERE turn_hash = ${tw.start_turn_hash}
      )
    `;
    console.log(`  (conversation has ${turns[0].count} total turns)`);
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

async function showAll(sql) {
  console.log(`${CYAN}=== All Records ===${RESET}\n`);

  // Projects
  const projects = await sql`SELECT * FROM projects ORDER BY created_at DESC`;
  console.log(`${GREEN}Projects (${projects.length}):${RESET}`);
  projects.forEach((p) => {
    console.log(`\n  ${YELLOW}${p.project_id}${RESET}`);
    console.log(`    name: ${p.name}`);
    console.log(`    created: ${p.created_at}`);
    if (p.metadata_json) console.log(`    metadata: ${p.metadata_json}`);
  });

  // Conversations
  const convs = await sql`SELECT * FROM conversations ORDER BY created_at DESC`;
  console.log(`\n${GREEN}Conversations (${convs.length}):${RESET}`);
  convs.forEach((c) => {
    console.log(`\n  ${YELLOW}${c.conversation_id}${RESET}`);
    console.log(`    project: ${c.project_id}`);
    console.log(`    title: ${c.title || '(untitled)'}`);
    console.log(`    position: (${c.position_x}, ${c.position_y})`);
  });

  // Turns
  const turns = await sql`SELECT * FROM turns_v2 ORDER BY created_at DESC LIMIT 10`;
  console.log(`\n${GREEN}Recent Turns (showing 10):${RESET}`);
  turns.forEach((t) => {
    console.log(`\n  ${YELLOW}${t.turn_hash.substring(0, 40)}...${RESET}`);
    console.log(`    role: ${t.role}`);
    console.log(`    content: "${t.content.substring(0, 60)}..."`);
    console.log(`    parent: ${t.parent_turn_hash || '(root)'}`);
  });

  // Commits
  const commits = await sql`SELECT * FROM commits_v2 ORDER BY created_at DESC`;
  console.log(`\n${GREEN}Commits (${commits.length}):${RESET}`);
  commits.forEach((c) => {
    console.log(`\n  ${YELLOW}${c.commit_hash.substring(0, 40)}...${RESET}`);
    console.log(`    branch: ${c.branch}`);
    console.log(`    message: ${c.message || '(no message)'}`);
    const parents = JSON.parse(c.parents_json || '[]');
    console.log(
      `    parents: ${parents.length === 0 ? '(root)' : parents.map((p) => p.substring(0, 20) + '...').join(', ')}`
    );
  });

  // Summary
  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM projects) as projects,
      (SELECT COUNT(*) FROM conversations) as conversations,
      (SELECT COUNT(*) FROM turns_v2) as turns,
      (SELECT COUNT(*) FROM commits_v2) as commits,
      (SELECT COUNT(*) FROM branches) as branches
  `;
  const s = counts[0];
  console.log(`\n${GREEN}Summary:${RESET}`);
  console.log(
    `  Projects: ${s.projects} | Conversations: ${s.conversations} | Turns: ${s.turns} | Commits: ${s.commits} | Branches: ${s.branches}`
  );
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
