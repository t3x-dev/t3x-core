import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ensureMainBranch, findProjectById, insertProject, insertRun } from '@t3x-dev/storage';
import { closeDB, getDB } from '../../lib/db';

const [projectId, foreignId] = process.argv.slice(2);
const dataDir = process.env.T3X_DATA_DIR;
const port = Number(process.env.T3X_PG_PORT);
if (
  process.env.T3X_E2E_FULL !== '1' ||
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
  process.env.T3X_E2E_MCP_PHASE !== 'repository-runs' ||
  process.env.DATABASE_URL ||
  !dataDir ||
  !basename(dataDir).startsWith('t3x-full-e2e-data-') ||
  !Number.isInteger(port) ||
  port < 1 ||
  !projectId ||
  !foreignId
) {
  throw new Error('The repository Runs fixture requires a fresh authenticated full E2E stack.');
}
const cluster = await readFile(join(dataDir, 'postmaster.pid'), 'utf8');
if (Number(cluster.split('\n')[3]) !== port) {
  throw new Error('The fixture port does not match the isolated PostgreSQL cluster.');
}
process.env.DATABASE_URL = `postgres://postgres:password@localhost:${port}/t3x`;
process.env.T3X_POSTGRES_STARTUP_MODE = 'runtime';

const db = await getDB();
try {
  const ownerProject = await findProjectById(db, projectId);
  if (!ownerProject?.namespaceId) throw new Error('Missing fixture namespace.');
  await insertProject(db, {
    projectId: 'configured_run_fixture',
    name: 'Configured-Run-Fixture',
    namespaceId: ownerProject.namespaceId,
  });
  await ensureMainBranch(db, 'configured_run_fixture');
  for (const status of ['queued', 'running', 'completed', 'failed'] as const) {
    await insertRun(db, {
      run_id: `run_fixture_${status}`,
      project_id: projectId,
      commit_ref: 'fixture-ref',
      status,
      inputs_json: '{"fixture_internal_input":true}',
      workflow_json: '{"type":"fixture"}',
      ...(status === 'completed' ? { result_json: '{"eval_summary":"Fixture passed."}' } : {}),
      ...(status === 'failed' ? { result_json: '{"run_report":{"error":"Fixture failed."}}' } : {}),
    });
  }
  await insertRun(db, {
    run_id: 'run_fixture_legacy',
    project_id: projectId,
    status: 'failed',
    result_json: 'legacy text instead of JSON',
  });
  await insertRun(db, {
    run_id: 'run_fixture_foreign',
    project_id: foreignId,
  });
} finally {
  await closeDB();
}
