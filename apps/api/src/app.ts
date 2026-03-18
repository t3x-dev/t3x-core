/**
 * T3X API Application Factory
 *
 * Assembles the Hono app with all routes and middleware.
 * Exported as a factory function so the cloud repo can extend it
 * (e.g., inject auth middleware, add SaaS-specific routes).
 *
 * Usage (open-source):
 *   const app = createApp();
 *
 * Usage (cloud):
 *   const app = createApp({
 *     middleware: [authMiddleware],
 *     routes: (api) => { api.route('/', authCallbackRoutes); },
 *   });
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware, pinoLogger } from './middleware/logger';
import { projectAccessMiddleware } from './middleware/project-access';
import { rateLimitL1, rateLimitL2 } from './middleware/rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import {
  agentDraftRoutes,
  branchRoutes,
  chatRoutes,
  commitRoutes,
  conversationRoutes,
  curateRoutes,
  deltaLogRoutes,
  deployAgentRoutes,
  diffRoutes,
  draftsRoutes,
  exportRoutes,
  extractionFeedbackRoutes,
  extractRoutes,
  frameExtractRoutes,
  gateRoutes,
  healthRoutes,
  leavesRoutes,
  pinsRoutes,
  relationsRoutes,
  runnerRoutes,
  runsRoutes,
  statusRoutes,
  turnRoutes,
} from './routes';
import { apiKeysRoutes } from './routes/api-keys.openapi';
import { authLocalRoutes } from './routes/auth-local.openapi';
import { authMeRoutes } from './routes/auth-me.openapi';
import { autopilotRoutes } from './routes/autopilot.openapi';
import { comparisonsRoutes } from './routes/comparisons.openapi';
import { importRoutes } from './routes/import.openapi';
import { ingestRoutes } from './routes/ingest.openapi';
import { knowledgeGraphRoutes } from './routes/knowledge-graph.openapi';
import { llmRoutes } from './routes/llm.openapi';
import { mergeRoutes } from './routes/merge.openapi';
import { notificationsRoutes } from './routes/notifications.openapi';
import { projectRoutes } from './routes/projects.openapi';
import { providersRoutes } from './routes/providers.openapi';
import { recipesRoutes } from './routes/recipes.openapi';
import { searchRoutes } from './routes/search.openapi';
import { shareRoutes } from './routes/share.openapi';
import { templatesRoutes } from './routes/templates.openapi';
import { usageRoutes } from './routes/usage.openapi';
import { webhooksRoutes } from './routes/webhooks.openapi';

export interface CreateAppOptions {
  /** Skip built-in local auth (username/password). Set true for SaaS with OAuth. */
  skipLocalAuth?: boolean;
  /** Skip built-in API Key auth middleware. Set true when cloud repo provides its own auth. */
  skipBuiltinAuth?: boolean;
  /** Additional middleware inserted between rateLimitL1 and rateLimitL2 (e.g., auth) */
  middleware?: MiddlewareHandler[];
  /** Additional routes mounted on the OpenAPI router (e.g., auth callback) */
  routes?: (api: OpenAPIHono) => void;
}

export function createApp(options?: CreateAppOptions): Hono {
  const app = new Hono();

  // Global middleware (order: RequestId → CORS → Logger → L1 Rate Limit → [extensions] → L2 Rate Limit)
  app.use('*', requestIdMiddleware);
  app.use('*', corsMiddleware);
  app.use('*', loggerMiddleware);
  app.use('*', rateLimitL1);

  // Auth middleware: validates Bearer API key (built-in, used by OSS self-hosted)
  // Cloud repo skips this and provides its own auth middleware via options.middleware
  if (!options?.skipBuiltinAuth) {
    app.use('*', authMiddleware);
  }

  // Extension point: additional middleware (e.g., extra SaaS middleware from cloud repo)
  if (options?.middleware) {
    for (const mw of options.middleware) {
      app.use('*', mw);
    }
  }

  app.use('*', rateLimitL2);

  // Health check at root (not under /api)
  app.route('/', healthRoutes);

  // Create OpenAPI-enabled API router for all v1 routes
  const api = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: result.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; '),
            },
          },
          400
        );
      }
    },
  });

  // Project-level access control: gate all /v1/projects/:projectId/* sub-routes
  api.use('/v1/projects/:projectId/*', projectAccessMiddleware);

  // Mount routes
  api.route('/', statusRoutes);
  api.route('/', projectRoutes);
  api.route('/', conversationRoutes);
  api.route('/', turnRoutes);
  api.route('/', commitRoutes);
  api.route('/', branchRoutes);
  api.route('/', agentDraftRoutes);
  api.route('/', chatRoutes);
  api.route('/', curateRoutes);
  api.route('/', diffRoutes);
  api.route('/', exportRoutes);
  api.route('/', mergeRoutes);
  api.route('/', runnerRoutes);
  api.route('/', deployAgentRoutes);
  api.route('/', draftsRoutes);
  api.route('/', extractRoutes);
  api.route('/', frameExtractRoutes); // /v1/extract/frames
  api.route('/', gateRoutes); // /v1/gate/check
  api.route('/', deltaLogRoutes); // /v1/conversations/:conversationId/deltas
  api.route('/', runsRoutes);
  api.route('/', leavesRoutes);
  api.route('/', pinsRoutes);
  api.route('/', apiKeysRoutes);
  api.route('/', shareRoutes);
  api.route('/', comparisonsRoutes);
  api.route('/', templatesRoutes);
  api.route('/', webhooksRoutes);
  api.route('/', recipesRoutes);
  api.route('/', importRoutes);
  api.route('/', ingestRoutes);
  api.route('/', notificationsRoutes);
  api.route('/', providersRoutes);
  api.route('/', searchRoutes);
  api.route('/', knowledgeGraphRoutes);
  api.route('/', llmRoutes);
  api.route('/', autopilotRoutes);
  api.route('/', relationsRoutes);
  api.route('/', extractionFeedbackRoutes);

  // Auth /me route (always available — works with any auth provider)
  api.route('/', authMeRoutes);

  // Token usage metering
  api.route('/', usageRoutes);

  // Local auth routes (username/password register + login)
  // Skipped when SaaS provides its own OAuth auth
  if (!options?.skipLocalAuth) {
    api.route('/', authLocalRoutes);
  }

  // Extension point: additional routes from cloud repo (e.g., OAuth auth callback)
  if (options?.routes) {
    options.routes(api);
  }

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
      { name: 'Delta Log', description: 'Semantic delta log (incremental frame changes)' },
      { name: 'Diff', description: 'Semantic diff operations' },
      { name: 'Extract', description: 'LLM-based semantic extraction from conversations' },
      { name: 'Gate', description: 'Quality gate checks (structure, semantic, business)' },
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

  // Mount API routes under /api prefix
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

  return app;
}

// ── Re-exports for cloud repo (`import { ... } from '@t3x-dev/api'`) ──

// Database
export { closeDB, getDB } from './lib/db';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';

// Background tasks
export { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
// Logger
export { pinoLogger } from './middleware/logger';

// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';
