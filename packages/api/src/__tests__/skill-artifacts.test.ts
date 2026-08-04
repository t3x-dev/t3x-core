/** biome-ignore-all lint/suspicious/noExplicitAny: route tests use compact response casts */

import { yamlToTree } from '@t3x-dev/core';
import type { AnyDB } from '@t3x-dev/storage';
import { deleteProject, ensureMainBranch, findProjects, insertProject } from '@t3x-dev/storage';
import { t3xSkillP0Fixtures } from '@t3x-dev/yschema';
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

import { skillArtifactRoutes } from '../routes/skill-artifacts.openapi';

describe('Skill artifact routes', () => {
  let cleanup: () => Promise<void>;
  const app = new Hono();
  app.route('/', skillArtifactRoutes);

  beforeAll(async () => {
    const setup = await setupTestDB();
    mockDB = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  beforeEach(async () => {
    for (const project of await findProjects(mockDB, {})) {
      await deleteProject(mockDB, project.projectId);
    }
  });

  it('compiles the same commit into the same portable bundle', async () => {
    const project = await insertProject(mockDB, testData.project({ name: 'Skill Bundle' }));
    const candidate = structuredClone(t3xSkillP0Fixtures.validCandidateTree) as Record<string, any>;
    candidate.resources = {};
    candidate.checks = { delivery_checklist: candidate.checks.delivery_checklist };
    const relations = t3xSkillP0Fixtures.validRelations
      .filter(
        (relation) =>
          relation.type !== 'workflow_uses_resource' &&
          relation.type !== 'instruction_uses_resource' &&
          relation.from !== 'checks/validate_review_output'
      )
      .concat([
        {
          type: 'verifies',
          from: 'checks/delivery_checklist',
          to: 'workflows/review_changes',
        },
      ]);
    await ensureMainBranch(mockDB, project.projectId);
    const commit = await commitRepositoryYOpsState({
      db: mockDB,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      actor: { kind: 'human', id: 'user:yx' },
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: Object.entries(candidate).map(([key, value]) => yamlToTree(key, value)),
        relations,
      }),
      intent: 'Skill bundle',
    });
    const path = `/v1/projects/${project.projectId}/commits/${commit.commitDigest}/artifacts/skill`;

    const first = (await (await app.request(path)).json()) as any;
    const second = (await (await app.request(path)).json()) as any;

    expect(first.success).toBe(true);
    expect(first.data).toEqual(second.data);
    expect(first.data.publishable).toBe(true);
    expect(first.data.generated_description).toContain('Use when:');
    expect(first.data.gate).toMatchObject({
      declaratively_ready: true,
      blocking_check_count: 1,
      requires_execution: true,
    });
    expect(first.data.checks).toEqual([
      expect.objectContaining({
        key: 'delivery_checklist',
        workflow_keys: ['pre_delivery_review', 'review_changes'],
      }),
    ]);
    expect(first.data.files).toHaveLength(1);
    expect(first.data.files[0]).toMatchObject({
      path: 'SKILL.md',
      media_type: 'text/markdown',
    });
    expect(first.data.files[0].content).toContain('name: review-code');
    expect(first.data.files[0].content).toContain('## Workflows');
  });
});
