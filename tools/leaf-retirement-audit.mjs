#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readers = new Set([
  'GET /v1/leaves/{id}',
  'GET /v1/commits/{hash}/leaves',
  'GET /v1/projects/{projectId}/leaves',
  'GET /v1/leaves/{id}/history',
]);

/** Deliberately narrow: product Leaf endpoints, not JSON leaf nodes or packages. */
export async function inventoryRoutes(repoRoot = root) {
  const directory = path.join(repoRoot, 'packages/api/src/routes');
  const routes = [];
  for (const file of (await readdir(directory)).sort()) {
    if (!/^leaves-.*\.openapi\.ts$/.test(file)) continue;
    const source = await readFile(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/method:\s*'(\w+)',\s*path:\s*'([^']+)'/g)) {
      const endpoint = `${match[1].toUpperCase()} ${match[2]}`;
      routes.push({
        endpoint,
        disposition: readers.has(endpoint) ? 'retain-read' : 'retire-write',
        source: `packages/api/src/routes/${file}`,
      });
    }
  }
  return routes;
}

/** Operator-only queries. Always use a least-privilege role and explicit project. */
export const aggregateQueries = {
  leaves: `SELECT count(*)::int AS total,
    count(*) FILTER (WHERE output IS NOT NULL)::int AS with_output,
    count(*) FILTER (WHERE assertions IS NOT NULL)::int AS with_assertions,
    count(*) FILTER (WHERE runner_assertions IS NOT NULL)::int AS with_runner_assertions,
    count(DISTINCT commit_hash)::int AS referenced_commits
    FROM leaves WHERE project_id = $1`,
  history: `SELECT count(*)::int AS total FROM leaf_history h
    JOIN leaves l ON l.id = h.leaf_id WHERE l.project_id = $1`,
  edits: `SELECT count(*)::int AS total,
    count(*) FILTER (WHERE l.id IS NULL)::int AS orphaned,
    count(*) FILTER (WHERE l.id IS NOT NULL AND l.project_id <> e.project_id)::int AS project_mismatches
    FROM leaf_output_edits e LEFT JOIN leaves l ON l.id = e.leaf_id
    WHERE e.project_id = $1`,
  pins: `SELECT count(*)::int AS total,
    count(*) FILTER (WHERE l.id IS NULL OR l.project_id <> p.project_id)::int AS unresolved
    FROM pins p LEFT JOIN leaves l ON l.id = p.ref_id
    WHERE p.project_id = $1 AND p.type = 'leaf'`,
};

export async function scanProject(sql, projectId) {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project is required');
  return sql.begin('isolation level repeatable read read only', async (transaction) => {
    await transaction.unsafe("SET LOCAL statement_timeout = '15s'");
    const counts = {};
    for (const [key, query] of Object.entries(aggregateQueries)) {
      const result = await transaction.unsafe(query, [projectId]);
      counts[key] = result[0];
    }
    // Never infer zero users from absence of a live scan, or graph integrity from a count.
    return {
      status: 'scanned',
      counts,
      unresolved: [
        'Exact commit graph integrity requires the project archive verifier (#1418).',
        'Deployed CLI/MCP consumers and workspace target migration require owner review.',
        'Leaf rows have no artifact-version field; do not invent version distribution.',
      ],
      retirementAuthorized: false,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node tools/leaf-retirement-audit.mjs [--project ID --database-url-env ENV_NAME]');
    return;
  }
  let project;
  let envName;
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error('Missing argument');
    if (flag === '--project') project = value;
    else if (flag === '--database-url-env') envName = value;
    else throw new Error('Unknown argument');
  }
  if (Boolean(project) !== Boolean(envName)) throw new Error('Provide both project and env name');
  const report = {
    schemaVersion: 1,
    routes: await inventoryRoutes(),
    data: { status: 'not-scanned', retirementAuthorized: false },
  };
  if (envName) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(envName) || !process.env[envName]) {
      throw new Error('Database environment variable unavailable');
    }
    const require = createRequire(path.join(root, 'packages/storage/package.json'));
    const postgres = require('postgres');
    const sql = postgres(process.env[envName], { max: 1, connect_timeout: 10 });
    try {
      report.data = await scanProject(sql, project);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Driver errors can contain server names or connection strings. Never print them.
    console.error('Leaf audit failed. Check arguments, read permissions and database schema.');
    process.exitCode = 1;
  });
}
