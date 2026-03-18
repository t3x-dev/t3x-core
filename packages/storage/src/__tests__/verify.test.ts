/**
 * Hash Chain Verification Tests
 *
 * Tests L2/L3 chain verification and L1 incremental verification
 * using frame-based commits.
 */

import type { Author } from '@t3x-dev/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { verifyCommitHash, verifyHashChain } from '../backup/verify';
import { createCommit } from '../queries/commits';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

const testAuthor: Author = { type: 'human', name: 'Test User' };

function makeFrames(texts: string[]) {
  return texts.map((text, i) => ({
    id: `f_${i}`,
    type: 'legacy_sentence' as const,
    slots: { text },
  }));
}

describe('Hash Chain Verification', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Verify Test Project' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('verifyHashChain (L2/L3)', () => {
    it('passes for empty project', async () => {
      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(true);
      expect(result.total).toBe(0);
      expect(result.verified_depth).toBe(0);
      expect(result.entry_points).toBe(0);
      expect(result.verified_at).toBeTruthy();
    });

    it('passes for valid single commit', async () => {
      await createCommit(db, {
        project_id: projectId,
        author: testAuthor,
        content: { frames: makeFrames(['Budget is $3000']), relations: [] },
        branch: 'verify-single',
      });

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.errors.hash_mismatch).toHaveLength(0);
      expect(result.errors.parent_not_found).toHaveLength(0);
    });

    it('passes for valid chain (root -> child)', async () => {
      const root = await createCommit(db, {
        project_id: projectId,
        author: testAuthor,
        content: { frames: makeFrames(['Root sentence']), relations: [] },
        branch: 'verify-chain',
      });

      await createCommit(db, {
        project_id: projectId,
        author: testAuthor,
        parents: [root.hash],
        content: { frames: makeFrames(['Child sentence']), relations: [] },
        branch: 'verify-chain',
      });

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(true);
      expect(result.verified_depth).toBeGreaterThanOrEqual(1);
      expect(result.entry_points).toBeGreaterThanOrEqual(1);
    });

    it('detects missing parent reference', async () => {
      const fakeParentHash =
        'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      await createCommit(db, {
        project_id: projectId,
        author: testAuthor,
        parents: [fakeParentHash],
        content: { frames: makeFrames(['Orphan sentence']), relations: [] },
        branch: 'verify-orphan',
      });

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(false);
      expect(result.errors.parent_not_found.length).toBeGreaterThan(0);
    });

    it('reports entry_points (leaf commits)', async () => {
      const result = await verifyHashChain(db, projectId);

      // We have multiple branches, so multiple leaf commits
      expect(result.entry_points).toBeGreaterThan(0);
    });

    it('reports verified_depth for chains', async () => {
      const result = await verifyHashChain(db, projectId);

      // We created at least a root -> child chain
      expect(result.verified_depth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verifyCommitHash (single commit)', () => {
    it('passes for valid commit', async () => {
      const commit = await createCommit(db, {
        project_id: projectId,
        author: testAuthor,
        content: { frames: makeFrames(['Valid commit']), relations: [] },
        branch: 'verify-single-check',
      });

      const result = verifyCommitHash(commit);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails for tampered commit', () => {
      const commit = {
        hash: 'sha256:fake',
        schema: 't3x/commit/5' as const,
        parents: [] as string[],
        author: testAuthor,
        committed_at: new Date().toISOString(),
        content: { frames: makeFrames(['Hello']), relations: [] },
        project_id: projectId,
        message: null,
        branch: 'main',
        sources: null,
        provenance: null,
      };

      const result = verifyCommitHash(commit);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Hash mismatch');
    });
  });
});
