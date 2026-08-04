/** biome-ignore-all lint/suspicious/noExplicitAny: route integration tests use compact response casts */

import { type SemanticContent, sha256, yamlToTree } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { deleteProject, ensureMainBranch, findProjects, insertProject } from '@t3x-dev/storage';
import { t3xPromptP0Fixtures, t3xSkillP0Fixtures } from '@t3x-dev/yschema';
import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
} from '../lib/repository-state-transition';
import { setupTestDB, testData } from './setup';

let mockDB: AnyDB;

vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
  closeDB: vi.fn(() => Promise.resolve()),
}));

import { yschemaValidationRoutes } from '../routes/yschema-validation.openapi';

type ApiResponse = any;

const ACTOR = { kind: 'human' as const, id: 'user:yschema-validation-test' };

async function createSemanticCommit(
  projectId: string,
  content: SemanticContent,
  evidenceUri?: string
) {
  await ensureMainBranch(mockDB, projectId);
  return commitRepositoryYOpsState({
    db: mockDB,
    projectId,
    refName: 'main',
    expectedHead: null,
    target: createRepositoryYOpsStateFromSemanticContent(content),
    actor: ACTOR,
    intent: 'Validate schema-backed structured state',
    evidence:
      evidenceUri === undefined
        ? []
        : [
            {
              resource: {
                uri: evidenceUri,
                mediaType: 'application/octet-stream',
                digest: `sha256:${sha256(evidenceUri)}`,
              },
              locator: {
                scheme: 't3x.resource/v1',
                value: { uri: evidenceUri },
              },
            },
          ],
  });
}

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
    const commit = await createSemanticCommit(
      project.projectId,
      {
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
      't3x://materials/mat_prd_complete'
    );

    const createRes = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commit_hash: commit.commitDigest }),
      }
    );

    expect(createRes.status).toBe(201);
    const created: ApiResponse = await createRes.json();
    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({
      project_id: project.projectId,
      commit_hash: commit.commitDigest,
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
        commit.commitDigest
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
    const commit = await createSemanticCommit(
      project.projectId,
      {
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
      't3x://materials/mat_prd_incomplete'
    );

    const res = await app.request(`/v1/projects/${project.projectId}/yschema-validation/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commit_hash: commit.commitDigest }),
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

  it('runs structural and policy validation for a Skill commit', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Skill Validation' }));
    const candidate = t3xSkillP0Fixtures.validCandidateTree;
    const commit = await createSemanticCommit(
      project.projectId,
      {
        trees: Object.entries(candidate).map(([key, value]) => yamlToTree(key, value)),
        relations: [...t3xSkillP0Fixtures.validRelations],
      },
      't3x://materials/mat_skill_complete'
    );

    const response = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_hash: commit.commitDigest,
          schema_name: 't3x/skill',
        }),
      }
    );

    expect(response.status).toBe(201);
    const body: ApiResponse = await response.json();
    expect(body.data).toMatchObject({
      schema_name: 't3x/skill',
      status: 'passed',
      valid: true,
      ready: true,
      error_count: 0,
      gap_count: 0,
    });
    expect(body.data.result.policy_validation).toEqual({
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
    });
    expect(body.data.result.provenance_by_path['manifest/name']).toContainEqual({
      origin: 'user_evidence',
      sourceId: 't3x://materials/mat_skill_complete',
    });

    const latestResponse = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/latest`
    );
    const latest: ApiResponse = await latestResponse.json();
    expect(latest.data.id).toBe(body.data.id);
    expect(latest.data.schema_name).toBe('t3x/skill');
  });

  it('runs structural and Prompt policy validation through the shared commit path', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Prompt Validation' }));
    const candidate = t3xPromptP0Fixtures.validCandidateTree;
    const commit = await createSemanticCommit(
      project.projectId,
      {
        trees: Object.entries(candidate).map(([key, value]) => yamlToTree(key, value)),
        relations: [...t3xPromptP0Fixtures.validRelations],
      },
      't3x://materials/mat_prompt_complete'
    );

    const response = await app.request(
      `/v1/projects/${project.projectId}/yschema-validation/runs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_hash: commit.commitDigest,
          schema_name: 't3x/prompt',
          schema_version: 'v1',
        }),
      }
    );

    expect(response.status).toBe(201);
    const body: ApiResponse = await response.json();
    expect(body.data).toMatchObject({
      schema_name: 't3x/prompt',
      schema_version: 'v1',
      status: 'passed',
      valid: true,
      ready: true,
      error_count: 0,
      gap_count: 0,
    });
    expect(body.data.result.policy_validation).toEqual({
      valid: true,
      ready: true,
      errors: [],
      gaps: [],
    });
  });
});
