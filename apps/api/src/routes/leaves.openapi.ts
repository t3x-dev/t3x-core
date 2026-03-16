/**
 * Leaves Routes — Aggregator
 *
 * Combines all leaves sub-routers into a single export.
 *
 * Sub-routers:
 * - leaves-crud.openapi.ts       — CRUD: create, get, list, update, delete
 * - leaves-generation.openapi.ts — Generate output, validate, batch generate
 * - leaves-history.openapi.ts    — History: list, restore, delete
 * - leaves-ml.openapi.ts         — ML: suggest constraints, extract, learn, compare
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';
import { leavesCrudRoutes } from './leaves-crud.openapi';
import { leavesGenerationRoutes } from './leaves-generation.openapi';
import { leavesHistoryRoutes } from './leaves-history.openapi';
import { leavesMLRoutes } from './leaves-ml.openapi';

export const leavesRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

leavesRoutes.route('/', leavesCrudRoutes);
leavesRoutes.route('/', leavesGenerationRoutes);
leavesRoutes.route('/', leavesHistoryRoutes);
leavesRoutes.route('/', leavesMLRoutes);

export default leavesRoutes;
