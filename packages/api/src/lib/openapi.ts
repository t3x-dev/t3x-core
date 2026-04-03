/**
 * OpenAPI configuration for T3X API
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';

// Create OpenAPI-enabled Hono app
export function createOpenAPIApp() {
  const app = new OpenAPIHono();

  // OpenAPI JSON spec endpoint
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'T3X API',
      version: '1.0.0',
      description: 'Semantic version control for AI conversations',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Local development',
      },
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
    ],
  });

  return app;
}

// Scalar API reference middleware
export function createApiReference() {
  return apiReference({
    theme: 'kepler',
    spec: {
      url: '/api/openapi.json',
      // biome-ignore lint/suspicious/noExplicitAny: generic error handler
    } as any,
    pageTitle: 'T3X API Reference',
    // biome-ignore lint/suspicious/noExplicitAny: generic error handler
  } as any);
}
