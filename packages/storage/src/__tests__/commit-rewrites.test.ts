/**
 * commit_rewrites table tests — append-only rewrite log.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import {
  getSupersededHashes,
  insertRewrite,
  isCommitSuperseded,
  listRewrites,
} from '../queries/commit-rewrites';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('commit_rewrites', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'Rewrite Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('inserts a rewrite record and retrieves it', async () => {
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'a', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'c1',
    });
    const c2 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'a', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      parents: [c1.hash],
      message: 'c2',
    });
    const cSquash = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'a', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'squashed',
      provenance: { method: 'squash', source_commits: [c1.hash, c2.hash] },
    });

    const rw = await insertRewrite(db, {
      projectId: testProjectId,
      branch: 'main',
      operation: 'squash',
      sourceHashes: [c1.hash, c2.hash],
      resultHash: cSquash.hash,
      baseHash: null,
      opsReplayed: 2,
      yopsLogIds: ['yl_001', 'yl_002'],
      author: { type: 'human', name: 'test' },
    });

    expect(rw.id).toMatch(/^rw_/);
    expect(rw.operation).toBe('squash');
    expect(rw.sourceHashes).toEqual([c1.hash, c2.hash]);
    expect(rw.resultHash).toBe(cSquash.hash);
  });

  it('isCommitSuperseded returns true for source hashes', async () => {
    const rewrites = await listRewrites(db, testProjectId);
    expect(rewrites.length).toBeGreaterThan(0);
    const rw = rewrites[0];

    const superseded = await isCommitSuperseded(db, testProjectId, rw.sourceHashes[0]);
    expect(superseded).toBe(true);

    const notSuperseded = await isCommitSuperseded(db, testProjectId, rw.resultHash);
    expect(notSuperseded).toBe(false);
  });

  it('getSupersededHashes returns all superseded hashes', async () => {
    const hashes = await getSupersededHashes(db, testProjectId);
    expect(hashes.size).toBeGreaterThanOrEqual(2);
  });

  it('listRewrites returns all rewrites for a project', async () => {
    const rewrites = await listRewrites(db, testProjectId);
    expect(rewrites.length).toBeGreaterThanOrEqual(1);
    expect(rewrites[0].operation).toBe('squash');
  });

  it('isCommitSuperseded returns false for unknown hash', async () => {
    const result = await isCommitSuperseded(db, testProjectId, 'sha256:unknown');
    expect(result).toBe(false);
  });
});
