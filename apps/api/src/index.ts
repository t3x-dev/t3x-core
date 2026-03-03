/**
 * T3X Standalone API Server
 *
 * Hono-based REST API for T3X semantic version control.
 * Runs independently of the Next.js WebUI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { closeDB, getDB } from './lib/db';
import { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware, pinoLogger } from './middleware/logger';
import { rateLimitL1, rateLimitL2 } from './middleware/rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import {
  agentDraftRoutes,
  authCallbackRoutes,
  branchRoutes,
  chatRoutes,
  commitsV3Routes,
  commitsV4Routes,
  conversationRoutes,
  curateRoutes,
  deployAgentRoutes,
  diffRoutes,
  draftsRoutes,
  exportRoutes,
  extractRoutes,
  healthRoutes,
  leavesRoutes,
  pinsRoutes,
  runnerRoutes,
  runsRoutes,
  statusRoutes,
  turnRoutes,
} from './routes';
import { apiKeysRoutes } from './routes/api-keys.openapi';
import { comparisonsRoutes } from './routes/comparisons.openapi';
import { importRoutes } from './routes/import.openapi';
import { mergeRoutes } from './routes/merge.openapi';
import { projectRoutes } from './routes/projects.openapi';
import { providersRoutes } from './routes/providers.openapi';
import { recipesRoutes } from './routes/recipes.openapi';
import { shareRoutes } from './routes/share.openapi';
import { templatesRoutes } from './routes/templates.openapi';
import { webhooksRoutes } from './routes/webhooks.openapi';

function loadEnvLocal(): void {
  // Load env from monorepo root (unified config)
  // Supports running from root (pnpm dev:api) or from apps/api directory
  const cwd = process.cwd();
  const isInAppsApi = cwd.endsWith('apps/api') || cwd.endsWith('apps\\api');
  const rootDir = isInAppsApi ? path.resolve(cwd, '../..') : cwd;

  const candidates = [path.resolve(rootDir, '.env.local'), path.resolve(rootDir, '.env')];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined (first found wins)
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const app = new Hono();

// Global middleware (order: RequestId → CORS → Logger → L1 Rate Limit → Auth → L2 Rate Limit)
app.use('*', requestIdMiddleware);
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);
app.use('*', rateLimitL1);
app.use('*', authMiddleware);
app.use('*', rateLimitL2);

// Health check at root (not under /api)
app.route('/', healthRoutes); // /health

// Create OpenAPI-enabled API router for all v1 routes
const api = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        },
        400
      );
    }
  },
});

// Mount routes
api.route('/', statusRoutes); // /v1/status
api.route('/', projectRoutes); // /v1/projects (OpenAPI)
api.route('/', conversationRoutes); // /v1/conversations
api.route('/', turnRoutes); // /v1/turns
api.route('/', commitsV3Routes); // /v1/commits-v3
api.route('/', branchRoutes); // /v1/branches
api.route('/', agentDraftRoutes); // /v1/agent/drafts
api.route('/', chatRoutes); // /v1/chat
api.route('/', curateRoutes); // /v1/curate
api.route('/', diffRoutes); // /v1/diff
api.route('/', exportRoutes); // /v1/export
api.route('/', mergeRoutes); // /v1/merge
api.route('/', runnerRoutes); // /v1/runner/*
api.route('/', deployAgentRoutes); // /v1/deploy-agents
api.route('/', draftsRoutes); // /v1/drafts
api.route('/', extractRoutes); // /v1/extract
api.route('/', runsRoutes); // /v1/runs
api.route('/', leavesRoutes); // /v1/leaves
api.route('/', pinsRoutes); // /v1/pins, /v1/projects/:projectId/pins
api.route('/', commitsV4Routes); // /v1/commits-v4, /v1/projects/:projectId/commits-v4
api.route('/', apiKeysRoutes); // /v1/api-keys
api.route('/', shareRoutes); // /v1/share
api.route('/', comparisonsRoutes); // /v1/comparisons
api.route('/', templatesRoutes); // /v1/templates
api.route('/', webhooksRoutes); // /v1/webhooks
api.route('/', recipesRoutes); // /v1/projects/:projectId/recipes
api.route('/', importRoutes); // /v1/import
api.route('/', providersRoutes); // /v1/providers
api.route('/', authCallbackRoutes); // /v1/auth/callback

// OpenAPI spec endpoint
api.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'T3X API',
    version: '1.0.0',
    description: 'Semantic version control for AI conversations. Git for meaning.',
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [{ url: 'http://localhost:8000/api', description: 'Local development' }],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Projects', description: 'Project management' },
    { name: 'Conversations', description: 'Conversation management' },
    { name: 'Turns', description: 'Turn (message) management' },
    { name: 'Commits', description: 'Version control commits' },
    { name: 'Branches', description: 'Branch management' },
    { name: 'Drafts', description: 'Draft management' },
    { name: 'Diff', description: 'Semantic diff operations' },
    { name: 'Extract', description: 'LLM-based semantic extraction from conversations' },
    { name: 'Merge', description: 'Merge operations' },
    { name: 'Export', description: 'Export operations' },
    { name: 'Chat', description: 'LLM chat operations' },
    { name: 'Runner', description: 'Grey-box agent evaluation' },
    { name: 'Auth', description: 'Authentication callbacks (OAuth user creation)' },
    { name: 'API Keys', description: 'API key management (create, list, revoke)' },
    { name: 'Share', description: 'Share link management (create, resolve, revoke)' },
    { name: 'Comparisons', description: 'Saved A/B comparison snapshots' },
    { name: 'Templates', description: 'Reusable prompt templates for leaf generation' },
    { name: 'Leaves', description: 'Leaf node management (constraints, output, validation)' },
    { name: 'Pins', description: 'Pin management (source selection for commits and context)' },
    {
      name: 'Commits V4',
      description: 'Commits v4 (pure knowledge, sentences only, no constraints)',
    },
    { name: 'Webhooks', description: 'Webhook event subscriptions' },
    {
      name: 'Recipes',
      description: 'Workflow recipe automation (event-triggered action pipelines)',
    },
    { name: 'Import', description: 'Import project data from archives' },
  ],
});

// Scalar API Reference UI
api.get(
  '/docs',
  apiReference({
    theme: 'kepler',
    url: '/api/openapi.json',
    pageTitle: 'T3X API Reference',
  })
);

// Mount API routes under /api prefix (e.g., /api/v1/projects)
app.route('/api', api);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  pinoLogger.error({ err }, 'Unhandled error');
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Internal server error',
      },
    },
    500
  );
});

// Server startup
const port = parseInt(process.env.PORT || '8000', 10);

// Initialize database on startup
async function start() {
  try {
    pinoLogger.info('Initializing database...');
    await getDB();
    pinoLogger.info('Database initialized');

    // Start background tasks
    startTimeoutChecker();

    const server = serve({
      fetch: app.fetch,
      port,
    });

    pinoLogger.info({ port, url: `http://localhost:${port}` }, 'T3X API server running');
    pinoLogger.info(
      {
        anthropic_key: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not set',
        google_ai_key: process.env.GOOGLE_AI_STUDIO_KEY ? 'configured' : 'not set',
        database: process.env.DATABASE_URL ? 'PostgreSQL' : 'PGLite (local)',
        runner_url: process.env.RUNNER_BASE_URL || 'not set',
      },
      'Configuration'
    );

    // Graceful shutdown
    const shutdown = async () => {
      pinoLogger.info('Shutting down...');
      stopTimeoutChecker();
      await closeDB();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (error) {
    pinoLogger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export { app };
