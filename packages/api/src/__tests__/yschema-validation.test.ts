/** biome-ignore-all lint/suspicious/noExplicitAny: route integration tests use compact response casts */

import type { AnyDB } from '@t3x-dev/storage';
import { createCommit, deleteProject, findProjects, insertProject } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { yschemaValidationRoutes } from '../routes/yschema-validation.openapi';

type ApiResponse = any;

describe('YSchema validation routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', yschemaValidationRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    const existingProjects = await findProjects(mockDB, {});
    for (const project of existingProjects) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  it('runs YSchema validation for a commit and persists the latest result', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Validation Project' }));
    const commit = await createCommit(mockDB, {
      author: { type: 'human', name: 'YX' },
      content: {
        trees: [
          {
            key: 'summary',
            slots: {
              problem: 'Teams need schema-backed PRD review before committing structured state.',
              audience: 'Product and engineering reviewers',
              outcome: 'Reviewers can rerun validation after editing YAML.',
            },
            children: [],
          },
          {
            key: 'requirements',
            slots: {},
            children: [
              {
                key: 'schema_contract',
                slots: {
                  title: 'Publish shared YSchema contracts',
                  priority: 'must',
                  acceptance: ['P0 types are exported from @t3x-dev/yschema.'],
                },
                children: [],
              },
            ],
          },
        ],
        relations: [],
      },
      message: 'Validated PRD candidate',
      project_id: project.projectId,
    });

    const createRes = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commit_hash: commit.hash }),
      }
    );

    expect(createRes.status).toBe(201);
    const created: ApiResponse = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({
      project_id: project.projectId,
      commit_hash: commit.hash,
      schema_name: 't3x/prd',
      status: 'passed',
      valid: true,
      ready: true,
      error_count: 0,
      gap_count: 0,
    });
    expect(created.data.id).toMatch(/^ysvr_/);
    expect(created.data.result.validation.ready).toBe(true);

    const latestRes = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/latest?commit_hash=${encodeURIComponent(
        commit.hash
      )}`
    );

    expect(latestRes.status).toBe(200);
    const latest: ApiResponse = await latestRes.json();
    expect(latest.success).toBe(true);
    expect(latest.data.id).toBe(created.data.id);
    expect(latest.data.status).toBe('passed');
  });

  it('reports readiness gaps as a failed validation run', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Validation Gaps' }));
    const commit = await createCommit(mockDB, {
      author: { type: 'human', name: 'YX' },
      content: {
        trees: [
          {
            key: 'summary',
            slots: {
              problem: 'Teams need schema-backed PRD review.',
              outcome: 'Reviewers can rerun validation.',
            },
            children: [],
          },
        ],
        relations: [],
      },
      message: 'Incomplete PRD candidate',
      project_id: project.projectId,
    });

    const res = await app.request(`/v1/projects/${project.projectId}/yschema-validation/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commit_hash: commit.hash }),
    });

    expect(res.status).toBe(201);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('failed');
    expect(body.data.valid).toBe(true);
    expect(body.data.ready).toBe(false);
    expect(body.data.gap_count).toBeGreaterThan(0);
    expect(body.data.result.validation.gaps).toContainEqual(
      expect.objectContaining({ code: 'REQUIRED_SLOT_MISSING', path: 'summary/audience' })
    );
  });
});
