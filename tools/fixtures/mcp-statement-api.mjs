import { createRequire } from 'node:module';
import { closeDB, createApp, getDB } from '../../packages/api/dist/index.js';

if (
  process.env.T3X_E2E_MCP_ISOLATED !== '1' ||
  process.env.T3X_E2E_MCP_PHASE !== 'transition-statement' ||
  process.env.AUTH_DISABLED !== 'false' ||
  process.env.DATABASE_URL ||
  !process.env.T3X_DATA_DIR
) {
  throw new Error('The Statement fixture requires the isolated, authenticated MCP test stack.');
}

const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { serve } = requireApi('@hono/node-server');
await getDB();
const { app, websocket } = createApp({
  transitionControlPlane: { allowedExternalPredicateTypes: ['example.test/mcp-qualified/v1'] },
});
const server = serve({
  fetch: app.fetch,
  websocket,
  hostname: '127.0.0.1',
  port: Number(process.env.PORT),
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close();
    void closeDB().then(() => process.exit(0));
  });
}
