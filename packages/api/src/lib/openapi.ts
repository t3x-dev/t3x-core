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
      { name: 'Health', description: 'Liveness and readiness probes.' },
      {
        name: 'Integration',
        description:
          'High-level composite endpoints for the core T3X workflow. ' +
          '`POST /v1/extract` is the main entry point — it takes raw text, creates a conversation + turn, ' +
          'runs the extraction pipeline, and stores the result as a draft. ' +
          'Typical agent workflow: **extract → show_draft → edit_draft (YOps) → commit**.',
      },
      {
        name: 'Projects',
        description:
          'Project CRUD. A project is the top-level container for conversations, commits, branches, and drafts.',
      },
      {
        name: 'Conversations',
        description:
          'Conversation CRUD. A conversation is an ordered sequence of turns (messages) within a project. ' +
          'Conversations are the source material for extraction.',
      },
      {
        name: 'Turns',
        description:
          'Turn (message) management. Each turn has a role (user/assistant/system/tool), content, and a hash-chain link to its parent.',
      },
      {
        name: 'Drafts',
        description:
          'Drafts hold extracted semantic trees before they are committed. ' +
          'A draft is created by extraction, then edited with YOps, then committed. ' +
          'Flow: `POST /v1/extract` → `GET /v1/drafts/{id}` → `POST /v1/drafts/{id}/apply-yops` → `POST /v1/drafts/{id}/commit`. ' +
          'Drafts support optimistic locking via `if_revision`.',
      },
      {
        name: 'YOps',
        description:
          'YOps (YAML Operations) — 18 declarative operations for mutating semantic trees. ' +
          'Categories: DDL (define, drop, rename), DML (set, unset, populate, append), ' +
          'DTL (move, clone, nest, split, fold, merge, sort, unique, pick, omit), DCL (assert). ' +
          'Paths use `/` separator (e.g., `trip/budget`). Keys are snake_case. ' +
          'Use `GET /v1/docs/yops` for the full operation reference with examples.',
      },
      {
        name: 'Commits',
        description:
          'Immutable, hash-chained snapshots of semantic trees. Commits form a DAG (like Git). ' +
          'Each commit records: content (trees), author, parent hashes, and the YOps that produced it.',
      },
      {
        name: 'Branches',
        description:
          'Branch management. Branches are named pointers to commit chains, like Git branches.',
      },
      {
        name: 'Diff',
        description:
          'Semantic diff between commits. Two-way diff compares a draft vs parent commit (self-check). ' +
          'Three-way diff is used for merge preview with conflict detection. ' +
          'Diff granularity: storage=sentence, diff=word, merge=three-way.',
      },
      {
        name: 'Merge',
        description:
          'Two-phase merge: `POST /v1/merge/prepare` analyzes source/target commits and returns conflicts. ' +
          '`POST /v1/merge/execute` applies user decisions and creates a merge commit. ' +
          'Resolution types: source, target, both (keep both), edit (custom text).',
      },
      { name: 'Export', description: 'Export project data as cfpack or JSONL ledger.' },
      { name: 'Chat', description: "LLM chat with context from the project's semantic trees." },
      {
        name: 'Reference',
        description: 'API reference and documentation endpoints for AI agents and developers.',
      },
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
