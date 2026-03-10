/**
 * Cursor Pagination — P2 Queries
 *
 * Verifies cursor-based pagination for all 6 P2 list functions:
 * findProjects, findBranchesByProject, listRuns,
 * findDeployAgents, listTemplates, listComparisons.
 *
 * Pattern: create 3 items, paginate with limit=2, verify two pages.
 */

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { findBranchesByProject, insertBranch } from '../queries/branches';
import { createComparison, listComparisons } from '../queries/comparisons';
import { findDeployAgents, insertDeployAgent } from '../queries/deployAgents';
import { decodeCursor } from '../queries/pagination';
import { findProjects, insertProject } from '../queries/projects';
import { insertRun, listRuns } from '../queries/runs';
import { createTemplate, listTemplates } from '../queries/templates';
import { createTestDB, sleep } from './setup';

describe('Cursor Pagination — P2 queries', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    // Create a test project for queries that need projectId
    const proj = await insertProject(db, { name: 'Cursor P2 Test' });
    testProjectId = proj.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // findProjects
  // =========================================================================
  it('findProjects with cursor paginates correctly', async () => {
    // Create 3 projects with distinct timestamps
    await insertProject(db, { name: 'Proj A' });
    await sleep(10);
    await insertProject(db, { name: 'Proj B' });
    await sleep(10);
    await insertProject(db, { name: 'Proj C' });

    // Page 1: cursor="" (first page), limit=2
    const page1 = await findProjects(db, { cursor: '', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2: use next_cursor
    const page2 = await findProjects(db, { cursor: page1.next_cursor!, limit: 2 });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);
    // Combined pages should not have duplicates
    const allIds = [...page1.items.map((p) => p.projectId), ...page2.items.map((p) => p.projectId)];
    expect(new Set(allIds).size).toBe(allIds.length);

    // Cursor is decodable
    const decoded = decodeCursor(page1.next_cursor!);
    expect(decoded.t).toBeTruthy();
    expect(decoded.k).toBeTruthy();
  });

  it('findProjects without cursor returns plain array (legacy)', async () => {
    const result = await findProjects(db, { limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // findBranchesByProject
  // =========================================================================
  it('findBranchesByProject with cursor paginates correctly', async () => {
    // Create 3 branches
    await insertBranch(db, { projectId: testProjectId, name: 'branch-a' });
    await sleep(10);
    await insertBranch(db, { projectId: testProjectId, name: 'branch-b' });
    await sleep(10);
    await insertBranch(db, { projectId: testProjectId, name: 'branch-c' });

    // Page 1
    const page1 = await findBranchesByProject(db, {
      projectId: testProjectId,
      cursor: '',
      limit: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2
    const page2 = await findBranchesByProject(db, {
      projectId: testProjectId,
      cursor: page1.next_cursor!,
      limit: 2,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    // No duplicates
    const allIds = [...page1.items.map((b) => b.branchId), ...page2.items.map((b) => b.branchId)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('findBranchesByProject without cursor returns plain array (legacy)', async () => {
    const result = await findBranchesByProject(db, { projectId: testProjectId });
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // listRuns
  // =========================================================================
  it('listRuns with cursor paginates correctly', async () => {
    // Create 3 runs
    await insertRun(db, { run_id: 'run_cursor_a', project_id: testProjectId });
    await sleep(10);
    await insertRun(db, { run_id: 'run_cursor_b', project_id: testProjectId });
    await sleep(10);
    await insertRun(db, { run_id: 'run_cursor_c', project_id: testProjectId });

    // Page 1
    const page1 = await listRuns(db, {
      projectId: testProjectId,
      cursor: '',
      limit: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2
    const page2 = await listRuns(db, {
      projectId: testProjectId,
      cursor: page1.next_cursor!,
      limit: 2,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const allIds = [...page1.items.map((r) => r.runId), ...page2.items.map((r) => r.runId)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('listRuns without cursor returns plain array (legacy)', async () => {
    const result = await listRuns(db, { limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // findDeployAgents
  // =========================================================================
  it('findDeployAgents with cursor paginates correctly', async () => {
    // Create 3 deploy agents
    await insertDeployAgent(db, {
      id: 'agent_cursor_a',
      name: 'Agent A',
      endpoint: 'http://a',
      projectId: testProjectId,
    });
    await sleep(10);
    await insertDeployAgent(db, {
      id: 'agent_cursor_b',
      name: 'Agent B',
      endpoint: 'http://b',
      projectId: testProjectId,
    });
    await sleep(10);
    await insertDeployAgent(db, {
      id: 'agent_cursor_c',
      name: 'Agent C',
      endpoint: 'http://c',
      projectId: testProjectId,
    });

    // Page 1
    const page1 = await findDeployAgents(db, {
      projectId: testProjectId,
      cursor: '',
      limit: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2
    const page2 = await findDeployAgents(db, {
      projectId: testProjectId,
      cursor: page1.next_cursor!,
      limit: 2,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const allIds = [
      ...page1.items.map((a) => a.deployAgentId),
      ...page2.items.map((a) => a.deployAgentId),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('findDeployAgents without cursor returns plain array (legacy)', async () => {
    const result = await findDeployAgents(db);
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // listTemplates
  // =========================================================================
  it('listTemplates with cursor paginates correctly', async () => {
    // Create 3 templates
    await createTemplate(db, {
      template_id: 'tmpl_cursor_a',
      title: 'Template A',
      description: 'Desc A',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'sys',
      user_prompt: 'usr',
      variables: [],
    });
    await sleep(10);
    await createTemplate(db, {
      template_id: 'tmpl_cursor_b',
      title: 'Template B',
      description: 'Desc B',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'sys',
      user_prompt: 'usr',
      variables: [],
    });
    await sleep(10);
    await createTemplate(db, {
      template_id: 'tmpl_cursor_c',
      title: 'Template C',
      description: 'Desc C',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'sys',
      user_prompt: 'usr',
      variables: [],
    });

    // Page 1
    const page1 = await listTemplates(db, { cursor: '', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2
    const page2 = await listTemplates(db, { cursor: page1.next_cursor!, limit: 2 });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const allIds = [
      ...page1.items.map((t) => t.templateId),
      ...page2.items.map((t) => t.templateId),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('listTemplates without cursor returns plain array (legacy)', async () => {
    const result = await listTemplates(db);
    expect(Array.isArray(result)).toBe(true);
  });

  // =========================================================================
  // listComparisons
  // =========================================================================
  it('listComparisons with cursor paginates correctly', async () => {
    // Create 3 saved comparisons
    await createComparison(db, {
      comparison_id: 'comp_cursor_a',
      project_id: testProjectId,
      title: 'Comp A',
      control_config: { model: 'gpt-4', prompt_version: 'v1' },
      treatment_config: { model: 'gpt-4', prompt_version: 'v2' },
      control_run_ids: [],
      treatment_run_ids: [],
      result_snapshot: {},
    });
    await sleep(10);
    await createComparison(db, {
      comparison_id: 'comp_cursor_b',
      project_id: testProjectId,
      title: 'Comp B',
      control_config: { model: 'gpt-4', prompt_version: 'v1' },
      treatment_config: { model: 'gpt-4', prompt_version: 'v2' },
      control_run_ids: [],
      treatment_run_ids: [],
      result_snapshot: {},
    });
    await sleep(10);
    await createComparison(db, {
      comparison_id: 'comp_cursor_c',
      project_id: testProjectId,
      title: 'Comp C',
      control_config: { model: 'gpt-4', prompt_version: 'v1' },
      treatment_config: { model: 'gpt-4', prompt_version: 'v2' },
      control_run_ids: [],
      treatment_run_ids: [],
      result_snapshot: {},
    });

    // Page 1
    const page1 = await listComparisons(db, testProjectId, { cursor: '', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).toBeTruthy();

    // Page 2
    const page2 = await listComparisons(db, testProjectId, {
      cursor: page1.next_cursor!,
      limit: 2,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const allIds = [
      ...page1.items.map((c) => c.comparisonId),
      ...page2.items.map((c) => c.comparisonId),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('listComparisons without cursor returns plain array (legacy)', async () => {
    const result = await listComparisons(db, testProjectId);
    expect(Array.isArray(result)).toBe(true);
  });
});
