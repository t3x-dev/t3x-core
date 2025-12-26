/**
 * T3X Standalone API Server
 *
 * Hono-based REST API for T3X semantic version control.
 * Runs independently of the Next.js WebUI.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware } from './middleware/logger';
import {
  healthRoutes,
  statusRoutes,
  conversationRoutes,
  turnRoutes,
  commitRoutes,
  branchRoutes,
  draftRoutes,
  agentDraftRoutes,
  chatRoutes,
  diffRoutes,
  exportRoutes,
  mergeRoutes,
  runnerRoutes,
  deployAgentRoutes,
  runsRoutes,
} from './routes';
import { projectRoutes } from './routes/projects.openapi';
import { getDB, closeDB } from './lib/db';

const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);

// Health check at root (not under /api)
app.route('/', healthRoutes);  // /health

// Create OpenAPI-enabled API router for all v1 routes
const api = new OpenAPIHono();

// Mount routes
api.route('/', statusRoutes);       // /v1/status
api.route('/', projectRoutes);      // /v1/projects (OpenAPI)
api.route('/', conversationRoutes); // /v1/conversations
api.route('/', turnRoutes);         // /v1/turns
api.route('/', commitRoutes);       // /v1/commits
api.route('/', branchRoutes);       // /v1/branches
api.route('/', draftRoutes);        // /v1/drafts
api.route('/', agentDraftRoutes);   // /v1/agent/drafts
api.route('/', chatRoutes);         // /v1/chat
api.route('/', diffRoutes);         // /v1/diff
api.route('/', exportRoutes);       // /v1/export
api.route('/', mergeRoutes);        // /v1/merge
api.route('/', runnerRoutes);       // /v1/runner/*
api.route('/', deployAgentRoutes);  // /v1/deploy-agents
api.route('/', runsRoutes);         // /v1/runs

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
  servers: [
    { url: 'http://localhost:8000/api', description: 'Local development' },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Projects', description: 'Project management' },
    { name: 'Conversations', description: 'Conversation management' },
    { name: 'Turns', description: 'Turn (message) management' },
    { name: 'Commits', description: 'Version control commits' },
    { name: 'Branches', description: 'Branch management' },
    { name: 'Drafts', description: 'Draft management' },
    { name: 'Diff', description: 'Semantic diff operations' },
    { name: 'Merge', description: 'Merge operations' },
    { name: 'Export', description: 'Export operations' },
    { name: 'Chat', description: 'LLM chat operations' },
    { name: 'Runner', description: 'Grey-box agent evaluation' },
  ],
});

// Scalar API Reference UI
api.get('/docs', apiReference({
  theme: 'kepler',
  url: '/api/openapi.json',
  pageTitle: 'T3X API Reference',
}));

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
  console.error('Unhandled error:', err);
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
    console.log('Initializing database...');
    await getDB();
    console.log('Database initialized');

    const server = serve({
      fetch: app.fetch,
      port,
    });

    console.log(`T3X API server running on http://localhost:${port}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      await closeDB();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app };
