/**
 * Hash Chain Verification Tests (Upgrade #6)
 *
 * Tests L2/L3 chain verification and L1 incremental verification.
 */

import type { PGlite } from '@electric-sql/pglite';
import type { CommitAuthorV4, SentenceV4 } from '@t3x-dev/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { verifyCommitHash, verifyHashChain } from '../backup/verify';
import {
  computeCommitV4Hash,
  createCommitV4,
  ParentHashIntegrityError,
} from '../queries/commits-v4';
import { insertProject } from '../queries/projects';
import { commitsV4 } from '../schema-v4';
import { createTestDB, testData } from './setup';

const testAuthor: CommitAuthorV4 = { type: 'human', name: 'Test User' };

function makeSentences(texts: string[]): SentenceV4[] {
  return texts.map((text, i) => ({ id: `s_${i}`, text }));
}

describe('Hash Chain Verification', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
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
      const commit = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['Budget is $3000']),
        branch: 'verify-single',
      });

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.errors.hash_mismatch).toHaveLength(0);
      expect(result.errors.parent_not_found).toHaveLength(0);
    });

    it('passes for valid chain (root → child)', async () => {
      const root = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['Root sentence']),
        branch: 'verify-chain',
      });

      await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        parents: [root.hash],
        sentences: makeSentences(['Child sentence']),
        branch: 'verify-chain',
      });

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(true);
      expect(result.verified_depth).toBeGreaterThanOrEqual(1);
      expect(result.entry_points).toBeGreaterThanOrEqual(1);
    });

    it('detects tampered commit hash', async () => {
      // Create a valid commit, then tamper with its content
      const commit = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['Original content']),
        branch: 'verify-tamper',
      });

      // Directly update the content in DB (simulates tampering)
      await db
        .update(commitsV4)
        .set({ content: { sentences: [{ id: 's_0', text: 'Tampered content' }] } })
        .where(eq(commitsV4.hash, commit.hash));

      const result = await verifyHashChain(db, projectId);

      expect(result.valid).toBe(false);
      expect(result.errors.hash_mismatch.length).toBeGreaterThan(0);
      expect(result.errors.hash_mismatch.some((e) => e.includes(commit.hash.slice(0, 16)))).toBe(
        true
      );

      // Restore to avoid polluting other tests
      await db
        .update(commitsV4)
        .set({ content: commit.content })
        .where(eq(commitsV4.hash, commit.hash));
    });

    it('detects missing parent reference', async () => {
      // Create a commit with a non-existent parent (bypass strict mode)
      const fakeParentHash =
        'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      await createCommitV4(
        db,
        {
          project_id: projectId,
          author: testAuthor,
          parents: [fakeParentHash],
          sentences: makeSentences(['Orphan sentence']),
          branch: 'verify-orphan',
        },
        { strictParents: false }
      );

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

      // We created at least a root → child chain
      expect(result.verified_depth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verifyCommitHash (single commit)', () => {
    it('passes for valid commit', async () => {
      const commit = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['Valid commit']),
        branch: 'verify-single-check',
      });

      const result = verifyCommitHash(commit);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails for tampered commit', () => {
      const commit = {
        hash: 'sha256:fake',
        schema: 't3x/commit/v4' as const,
        parents: [],
        author: testAuthor,
        committed_at: new Date().toISOString(),
        content: { sentences: [{ id: 's_0', text: 'Hello' }] },
      };

      const result = verifyCommitHash(commit);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Hash mismatch');
    });
  });

  describe('L1 incremental verification (verifyParentHashes)', () => {
    it('passes when parent hash is valid', async () => {
      const parent = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['L1 parent']),
        branch: 'verify-l1',
      });

      const child = await createCommitV4(
        db,
        {
          project_id: projectId,
          author: testAuthor,
          parents: [parent.hash],
          sentences: makeSentences(['L1 child']),
          branch: 'verify-l1',
        },
        { verifyParentHashes: true }
      );

      expect(child.hash).toBeTruthy();
      expect(child.parents).toEqual([parent.hash]);
    });

    it('throws ParentHashIntegrityError when parent is tampered', async () => {
      const parent = await createCommitV4(db, {
        project_id: projectId,
        author: testAuthor,
        sentences: makeSentences(['L1 tampered parent']),
        branch: 'verify-l1-tamper',
      });

      // Tamper with parent content
      await db
        .update(commitsV4)
        .set({ content: { sentences: [{ id: 's_0', text: 'Tampered!' }] } })
        .where(eq(commitsV4.hash, parent.hash));

      await expect(
        createCommitV4(
          db,
          {
            project_id: projectId,
            author: testAuthor,
            parents: [parent.hash],
            sentences: makeSentences(['L1 child of tampered']),
            branch: 'verify-l1-tamper',
          },
          { verifyParentHashes: true }
        )
      ).rejects.toThrow(ParentHashIntegrityError);
    });
  });
});
