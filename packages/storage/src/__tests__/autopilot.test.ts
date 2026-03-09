import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { getAutopilotConfig, updateAutopilotConfig } from '../queries/autopilot';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Autopilot Config Queries', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Autopilot Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns null for project without config', async () => {
    const config = await getAutopilotConfig(db, projectId);
    expect(config).toBeNull();
  });

  it('updates config and returns merged result', async () => {
    const result = await updateAutopilotConfig(db, projectId, {
      enabled: true,
      min_confidence: 0.9,
    });

    expect(result).toEqual({
      enabled: true,
      min_confidence: 0.9,
      min_sentences: 1,
      auto_create_leaf: false,
      target_branch: 'main',
    });
  });

  it('partial update preserves existing fields', async () => {
    // First set some values
    await updateAutopilotConfig(db, projectId, {
      enabled: true,
      min_confidence: 0.9,
      target_branch: 'dev',
    });

    // Now partial update — only change min_sentences
    const result = await updateAutopilotConfig(db, projectId, {
      min_sentences: 3,
    });

    expect(result.enabled).toBe(true);
    expect(result.min_confidence).toBe(0.9);
    expect(result.min_sentences).toBe(3);
    expect(result.target_branch).toBe('dev');
    expect(result.auto_create_leaf).toBe(false);
  });

  it('returns full config after update', async () => {
    await updateAutopilotConfig(db, projectId, {
      enabled: true,
      min_confidence: 0.75,
      min_sentences: 2,
      auto_create_leaf: true,
      target_branch: 'staging',
    });

    const config = await getAutopilotConfig(db, projectId);
    expect(config).toEqual({
      enabled: true,
      min_confidence: 0.75,
      min_sentences: 2,
      auto_create_leaf: true,
      target_branch: 'staging',
    });
  });
});
