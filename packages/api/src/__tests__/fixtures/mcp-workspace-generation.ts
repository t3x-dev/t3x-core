import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { closeDB, getDB } from '../../lib/db';
import { createInferenceRuntime } from '../../lib/inference';
import { generateTransitionProposal } from '../../lib/proposal-generation';

const [projectId, workspaceId, materialId, userId, revision] = process.argv.slice(2);
const port = Number(process.env.T3X_PG_PORT);
const dataDir = process.env.T3X_DATA_DIR;
if (
  process.env.T3X_E2E_FULL !== '1' ||
  process.env.T3X_E2E_AUTH_ENABLED !== '1' ||
  process.env.T3X_E2E_MCP_PHASE !== 'workspace-candidate' ||
  process.env.DATABASE_URL ||
  !dataDir ||
  !basename(dataDir).startsWith('t3x-full-e2e-data-') ||
  !Number.isInteger(port) ||
  port < 1 ||
  !projectId ||
  !workspaceId ||
  !materialId ||
  !userId ||
  !Number.isSafeInteger(Number(revision)) ||
  Number(revision) < 1
) {
  throw new Error('The candidate fixture requires a fresh authenticated full E2E stack.');
}
const cluster = await readFile(join(dataDir, 'postmaster.pid'), 'utf8');
if (Number(cluster.split('\n')[3]) !== port) {
  throw new Error('The fixture port does not match the isolated PostgreSQL cluster.');
}

// Connect to the running embedded test database without restarting its server.
process.env.DATABASE_URL = `postgres://postgres:password@localhost:${port}/t3x`;
process.env.T3X_POSTGRES_STARTUP_MODE = 'runtime';
const actor = { kind: 'human' as const, id: `user:${userId}` };
const instruction = 'Remove the retired fixture requirement.';
const db = await getDB();
const runtime = createInferenceRuntime();

try {
  const candidates = [];
  for (const id of ['current', 'later-stale']) {
    const result = await generateTransitionProposal({
      db,
      projectId,
      requestId: `fixture-${id}-${randomUUID()}`,
      requester: actor,
      request: {
        workspaceId,
        expectedRevision: Number(revision),
        posture: 'guided',
        instruction,
        sourceMaterialIds: [materialId],
      },
      resolveModel: async () => ({
        provider: 'test',
        model: 'mcp-candidate-fixture',
        generate: async () => ({
          draft: {
            schema: 't3x.dev/proposal-generation-draft/v1',
            version: 1,
            posture: 'guided',
            intent: { mode: 'authored', value: instruction, evidencePointers: [] },
            rationale: { mode: 'unspecified' },
            changes: [
              {
                id: 'remove-retired',
                operations: [{ unset: { path: 'prd/requirements/retired' } }],
                claimedOrigin: 'inferred',
                evidencePointers: [],
                basisPointers: [{ kind: 'source', index: 0 }],
                assumptions: [],
                reason: instruction,
                challenges: [],
              },
            ],
            warnings: [],
          },
          usage: { inputTokens: 0, outputTokens: 0 },
        }),
      }),
      inference: {
        runtime,
        runId: `mcp-fixture-${randomUUID()}`,
        scope: {
          actor: { kind: 'user', id: actor.id },
          projectId,
          projectVisibility: 'private',
        },
      },
    });
    candidates.push(result.view.transitionId);
  }
  console.log(candidates.join(','));
} finally {
  await closeDB();
}
