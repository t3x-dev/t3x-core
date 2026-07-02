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
import { setupWebSocket } from './lib/ws';
import { authMiddleware } from './middleware/auth';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware, pinoLogger } from './middleware/logger';
import { projectAccessMiddleware } from './middleware/project-access';
import { rateLimitL1, rateLimitL2 } from './middleware/rate-limit';
import { requestIdMiddleware } from './middleware/request-id';
import {
  agentDraftRoutes,
  apiKeysRoutes,
  authLocalRoutes,
  authMeRoutes,
  autopilotRoutes,
  branchRoutes,
  chatRoutes,
  checkRoutes,
  commitFromDraftRoutes,
  commitRoutes,
  comparisonsRoutes,
  contextRoutes,
  conversationRoutes,
  curateRoutes,
  deployAgentRoutes,
  diffRoutes,
  docsYopsRoutes,
  draftsRoutes,
  exportRoutes,
  extractIncrementalRoutes,
  extractionFeedbackRoutes,
  extractYopsRoutes,
  gateRoutes,
  healthRoutes,
  importRoutes,
  ingestRoutes,
  integrationExtractRoutes,
  knowledgeGraphRoutes,
  leavesRoutes,
  llmRoutes,
  localConfigRoutes,
  materialsRoutes,
  mergeRoutes,
  notificationsRoutes,
  pinsRoutes,
  projectRoutes,
  providersRoutes,
  recipesRoutes,
  relationsRoutes,
  runnerRoutes,
  runsRoutes,
  searchRoutes,
  shareRoutes,
  sourceTextRevisionRoutes,
  statusRoutes,
  templatesRoutes,
  topicsRoutes,
  treeAnswerRoutes,
  treeCompressRoutes,
  treeExtractRoutes,
  turnRoutes,
  usageRoutes,
  webhooksRoutes,
  yopsLogRoutes,
  yopsValidateRoutes,
  yschemaPrdSmokeRoutes,
  yschemaValidationRoutes,
} from './routes';
import { createWsRoute } from './routes/ws';

export interface CreateAppOptions {
  /** Skip built-in local auth (username/password). Set true for SaaS with OAuth. */
  skipLocalAuth?: boolean;
  /** Skip built-in API Key auth middleware. Set true when cloud repo provides its own auth. */
  skipBuiltinAuth?: boolean;
  /** Enable machine-local config routes that read/write ~/.t3x state for standalone local apps only. */
  enableLocalConfigRoutes?: boolean;
  /** Additional middleware inserted between rateLimitL1 and rateLimitL2 (e.g., auth) */
  middleware?: MiddlewareHandler[];
  /** Additional routes mounted on the OpenAPI router (e.g., auth callback) */
  routes?: (api: OpenAPIHono) => void;
}

export interface CreateAppResult {
  app: Hono;
  /** Call with the HTTP server returned by @hono/node-server serve() */
  injectWebSocket: ReturnType<typeof setupWebSocket>['injectWebSocket'];
}

export function createApp(options?: CreateAppOptions): CreateAppResult {
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
  api.route('/', treeExtractRoutes); // /v1/extract/trees + /v1/extract/trees/stream
  api.route('/', treeAnswerRoutes); // /v1/extract/trees/answer
  api.route('/', treeCompressRoutes); // /v1/conversations/:conversationId/compress
  api.route('/', gateRoutes); // /v1/gate/check
  api.route('/', yopsLogRoutes); // /v1/conversations/:conversationId/yops
  api.route('/', yopsValidateRoutes); // /v1/yops/validate
  api.route('/', yschemaValidationRoutes); // /v1/projects/:projectId/yschema-validation/*
  api.route('/', yschemaPrdSmokeRoutes); // /v1/dev/yschema/prd-smoke
  api.route('/', docsYopsRoutes); // /v1/docs/yops
  api.route('/', runsRoutes);
  api.route('/', leavesRoutes);
  api.route('/', pinsRoutes);
  api.route('/', apiKeysRoutes);
  api.route('/', shareRoutes);
  api.route('/', sourceTextRevisionRoutes);
  api.route('/', comparisonsRoutes);
  api.route('/', templatesRoutes);
  api.route('/', webhooksRoutes);
  api.route('/', recipesRoutes);
  api.route('/', importRoutes);
  api.route('/', materialsRoutes);
  api.route('/', ingestRoutes);
  api.route('/', notificationsRoutes);
  api.route('/', providersRoutes);
  api.route('/', searchRoutes);
  api.route('/', knowledgeGraphRoutes);
  api.route('/', llmRoutes);
  if (options?.enableLocalConfigRoutes) {
    api.route('/', localConfigRoutes);
  }
  api.route('/', autopilotRoutes);
  api.route('/', checkRoutes);
  api.route('/', contextRoutes);
  api.route('/', integrationExtractRoutes);
  api.route('/', commitFromDraftRoutes);
  api.route('/', relationsRoutes);
  api.route('/', extractYopsRoutes); // /v1/extract-yops
  api.route('/', extractIncrementalRoutes); // /v1/extract/incremental
  api.route('/', extractionFeedbackRoutes);
  api.route('/', topicsRoutes);

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
      description: 'Version control for schema-backed YAML state.',
      license: {
        name: 'Apache-2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0',
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
      { name: 'YOps', description: 'YOps validation and mutation operations' },
      { name: 'YOps Log', description: 'Structured-state change log (incremental tree changes)' },
      { name: 'Diff', description: 'Structured diff operations' },
      { name: 'Extract', description: 'LLM-based structured extraction from conversations' },
      { name: 'Extraction', description: 'Extraction workflows and generated YOps plans' },
      { name: 'Extraction Feedback', description: 'Feedback for extraction quality and review' },
      { name: 'Gate', description: 'Quality gate checks (structure, semantic, business)' },
      { name: 'Merge', description: 'Merge operations' },
      { name: 'Export', description: 'Export operations' },
      { name: 'Chat', description: 'LLM chat operations' },
      { name: 'Search', description: 'State and project search' },
      { name: 'State Index', description: 'State graph nodes, edges, and membership' },
      { name: 'Runner', description: 'Grey-box agent evaluation' },
      { name: 'Deploy Agents', description: 'Deploy agent management (register, run, evaluate)' },
      { name: 'Auth', description: 'Authentication callbacks (OAuth user creation)' },
      { name: 'API Keys', description: 'API key management (create, list, revoke)' },
      { name: 'Share', description: 'Share link management (create, resolve, revoke)' },
      { name: 'Comparisons', description: 'Saved A/B comparison snapshots' },
      { name: 'Templates', description: 'Reusable prompt templates for leaf generation' },
      { name: 'Leaves', description: 'Leaf node management (constraints, output, validation)' },
      { name: 'Pins', description: 'Pin management (source selection for commits and context)' },
      { name: 'Webhooks', description: 'Webhook event subscriptions' },
      {
        name: 'Recipes',
        description: 'Workflow recipe automation (event-triggered action pipelines)',
      },
      { name: 'Import', description: 'Import project data from archives' },
      { name: 'Materials', description: 'Imported materials and source documents' },
      { name: 'Ingest', description: 'External content ingestion' },
      { name: 'Notifications', description: 'User and system notifications' },
      { name: 'Providers', description: 'LLM provider configuration and status' },
      { name: 'Usage', description: 'Token and request usage metering' },
      { name: 'Topics', description: 'Topic extraction and project topic management' },
      { name: 'Relations', description: 'Semantic relation management' },
      { name: 'Source Text Revisions', description: 'Source text revision history' },
      { name: 'Reference', description: 'Reference documentation endpoints' },
      { name: 'Integration', description: 'Integration endpoints for external clients' },
      { name: 'Local Config', description: 'Machine-local standalone app configuration' },
      { name: 'Autopilot', description: 'Autopilot planning and execution helpers' },
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

  // WebSocket — real-time event push (mounted at root, not under /api)
  const { upgradeWebSocket, injectWebSocket } = setupWebSocket(app);
  app.route('/', createWsRoute(upgradeWebSocket));

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

  return { app, injectWebSocket };
}

// ── Re-exports for cloud repo (`import { ... } from '@t3x-dev/api'`) ──

// Database
export { closeDB, getDB } from './lib/db';
// Error utilities
export { createError, errorResponse, zodErrorHook } from './lib/errors';
// Real-time event bus
export { eventBus, type RealtimeEvent, type RealtimeEventType } from './lib/event-bus';
export { roomManager } from './lib/room-manager';

// Background tasks
export { startTimeoutChecker, stopTimeoutChecker } from './lib/timeout-checker';
// Logger
export { pinoLogger } from './middleware/logger';

// Common OpenAPI schemas
export { ErrorResponseSchema, SuccessResponseSchema } from './schemas/common';
// Type definitions
export type { AppEnv } from './types';
