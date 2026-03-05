import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  deleteRelationsByCommit,
  findRelationsByCommit,
  upsertRelations,
} from '../queries/relations';
import { createTestDB } from './setup';

describe('Sentence Relations Queries', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeEach(async () => {
    const testSetup = await createTestDB();
    db = testSetup.db;
    cleanup = testSetup.cleanup;

    const project = await insertProject(db, { name: 'Test', metadata: {} });
    projectId = project.projectId;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('upserts relations for a commit', async () => {
    const relations = [
      {
        id: 'rel_aaa',
        project_id: projectId,
        commit_hash: 'sha256:test1',
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.85,
        reasoning: 'S_bbb supports S_aaa',
      },
      {
        id: 'rel_bbb',
        project_id: projectId,
        commit_hash: 'sha256:test1',
        source_id: 's_bbb',
        target_id: 's_ccc',
        type: 'causes',
        confidence: 0.9,
        reasoning: 'S_bbb causes S_ccc',
      },
    ];
    const inserted = await upsertRelations(db, relations);
    expect(inserted).toBe(2);
  });

  it('finds relations by commit hash', async () => {
    await upsertRelations(db, [
      {
        id: 'rel_aaa',
        project_id: projectId,
        commit_hash: 'sha256:test1',
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.85,
        reasoning: 'reason',
      },
    ]);
    const found = await findRelationsByCommit(db, 'sha256:test1');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('rel_aaa');
    expect(found[0].source_id).toBe('s_aaa');
    expect(found[0].type).toBe('supports');
  });

  it('returns empty array for non-existent commit', async () => {
    const found = await findRelationsByCommit(db, 'sha256:nonexistent');
    expect(found).toHaveLength(0);
  });

  it('deletes relations by commit hash', async () => {
    await upsertRelations(db, [
      {
        id: 'rel_aaa',
        project_id: projectId,
        commit_hash: 'sha256:test1',
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.85,
        reasoning: 'reason',
      },
    ]);
    const deleted = await deleteRelationsByCommit(db, 'sha256:test1');
    expect(deleted).toBe(1);
    const found = await findRelationsByCommit(db, 'sha256:test1');
    expect(found).toHaveLength(0);
  });

  it('handles upsert conflict (same source/target/type/commit)', async () => {
    const base = {
      project_id: projectId,
      commit_hash: 'sha256:test1',
      source_id: 's_aaa',
      target_id: 's_bbb',
      type: 'supports' as const,
    };
    await upsertRelations(db, [{ ...base, id: 'rel_aaa', confidence: 0.7, reasoning: 'first' }]);
    await upsertRelations(db, [{ ...base, id: 'rel_bbb', confidence: 0.9, reasoning: 'updated' }]);
    const found = await findRelationsByCommit(db, 'sha256:test1');
    expect(found).toHaveLength(1);
    expect(found[0].confidence).toBe(0.9);
    expect(found[0].reasoning).toBe('updated');
  });

  it('returns 0 for upsert with empty array', async () => {
    const inserted = await upsertRelations(db, []);
    expect(inserted).toBe(0);
  });
});
