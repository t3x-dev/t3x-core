/**
 * commit_rewrites table tests — append-only rewrite log.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  getSupersededHashes,
  insertRewrite,
  isCommitSuperseded,
  listRewrites,
} from '../queries/commit-rewrites';
import { collectYOpsForCommitRange, createCommit, listCommits } from '../queries/commits';
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

describe('collectYOpsForCommitRange', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'YOps Range Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('collects yops_log_ids from ordered commits', async () => {
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'b', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'range-c1',
      yops_log_ids: ['yl_r1', 'yl_r2'],
    });
    const c2 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'b', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      parents: [c1.hash],
      message: 'range-c2',
      yops_log_ids: ['yl_r3'],
    });

    const ids = await collectYOpsForCommitRange(db, [c1.hash, c2.hash]);
    expect(ids).toEqual(['yl_r1', 'yl_r2', 'yl_r3']);
  });

  it('throws if any commit has empty yops_log_ids', async () => {
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'c', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'no-yops',
    });

    await expect(collectYOpsForCommitRange(db, [c1.hash])).rejects.toThrow('empty yops_log_ids');
  });

  it('throws if commit not found', async () => {
    await expect(collectYOpsForCommitRange(db, ['sha256:nonexistent'])).rejects.toThrow(
      'not found'
    );
  });
});

describe('listCommits with superseded filtering', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'ListCommits Filter Test' }));
    testProjectId = project.projectId;

    // Create commits and a rewrite so some are superseded
    const c1 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'd', slots: { v: '1' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'lc-c1',
      yops_log_ids: ['yl_lc1'],
    });
    const c2 = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'd', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      parents: [c1.hash],
      message: 'lc-c2',
      yops_log_ids: ['yl_lc2'],
    });
    const cSquash = await createCommit(db, {
      author: { type: 'human', name: 'test' },
      content: { trees: [{ key: 'd', slots: { v: '2' }, children: [] }], relations: [] },
      project_id: testProjectId,
      message: 'lc-squashed',
      provenance: { method: 'squash', source_commits: [c1.hash, c2.hash] },
      yops_log_ids: ['yl_lc1', 'yl_lc2'],
    });

    await insertRewrite(db, {
      projectId: testProjectId,
      branch: 'main',
      operation: 'squash',
      sourceHashes: [c1.hash, c2.hash],
      resultHash: cSquash.hash,
      baseHash: null,
      opsReplayed: 2,
      yopsLogIds: ['yl_lc1', 'yl_lc2'],
      author: { type: 'human', name: 'test' },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('excludes superseded commits by default', async () => {
    const allCommits = await listCommits(db, { projectId: testProjectId, includeSuperseded: true });
    const activeCommits = await listCommits(db, { projectId: testProjectId });
    expect(activeCommits.length).toBeLessThan(allCommits.length);
  });

  it('includes superseded commits when flag is set', async () => {
    const allCommits = await listCommits(db, { projectId: testProjectId, includeSuperseded: true });
    expect(allCommits.length).toBeGreaterThan(0);
  });
});
