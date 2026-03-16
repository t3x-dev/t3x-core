/**
 * Drafts V3 Routes (Workbench) — Aggregator
 *
 * Combines all draft sub-routers into a single exported router.
 * Sub-modules:
 * - drafts-crud.openapi.ts      — CRUD (create, list, get, update, delete)
 * - drafts-workflows.openapi.ts — Workflow ops (preview, commit, fork, extract, suggest)
 * - drafts-special.openapi.ts   — Special ops (auto-draft, promote, review-action)
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';
import { draftsCrudRoutes } from './drafts-crud.openapi';
import { draftsSpecialRoutes } from './drafts-special.openapi';
import { draftsWorkflowRoutes } from './drafts-workflows.openapi';

export const draftsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

draftsRoutes.route('/', draftsCrudRoutes);
draftsRoutes.route('/', draftsWorkflowRoutes);
draftsRoutes.route('/', draftsSpecialRoutes);

export default draftsRoutes;
