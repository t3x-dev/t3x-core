import { createPostgresRuntimeStorage, closePostgresStorage, createLeaf, updateLeafOutput } from '@t3x-dev/storage';

if (process.env.T3X_E2E_FULL !== '1' || process.env.DATABASE_URL || new URL(process.env.API_URL).hostname !== '127.0.0.1') {
  throw new Error('Historical Leaf fixtures require the isolated full-stack runner');
}
const port = Number(process.env.T3X_PG_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid fixture DB port');
const { commitHash, projectId, constraints, options } = JSON.parse(process.argv[2]);
const db = await createPostgresRuntimeStorage({ connectionString: `postgresql://postgres:password@127.0.0.1:${port}/t3x`, maxConnections: 1 });
try {
  const leaf = await createLeaf(db, { commit_hash: commitHash, project_id: projectId, type: 'deploy_agent', title: options?.title ?? 'Archived E2E Leaf', constraints: constraints ?? [], config: {} });
  if (options?.output) await updateLeafOutput(db, leaf.id, options.output);
  process.stdout.write(JSON.stringify({ id: leaf.id }));
} finally {
  await closePostgresStorage();
}
