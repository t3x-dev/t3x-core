/**
 * Share Token Storage Tests
 *
 * Tests all share token CRUD operations and verifies database effects.
 * Share tokens grant read-only access to entities via public URLs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createCommit } from '../queries/commits';
import { createLeaf } from '../queries/leaves';
import { insertProject } from '../queries/projects';
import {
  createShareToken,
  findShareTokenById,
  findShareTokenByToken,
  findShareTokensByEntity,
  revokeShareToken,
} from '../queries/share-tokens';
import { createTestDB, testData } from './setup';

describe('Share Tokens Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;
  let testLeafId: string;
  let testCommitHash: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    // Create a test project
    const project = await insertProject(
      db,
      testData.project({ name: 'Share Tokens Test Project' })
    );
    testProjectId = project.projectId;

    // Create a test commit
    const commit = await createCommit(db, {
      parents: [],
      author: { type: 'human', name: 'Test Author' },
      content: {
        frames: [{ id: 's_1', text: 'Test sentence for share tokens' }].map((s) => ({
          id: s.id,
          type: 'legacy_sentence' as const,
          slots: { text: s.text },
          confidence: s.confidence,
        })),
        relations: [],
      },
      project_id: testProjectId,
    });
    testCommitHash = commit.hash;

    // Create a test leaf
    const leaf = await createLeaf(db, {
      commit_hash: testCommitHash,
      type: 'tweet',
      title: 'Shareable Tweet',
      project_id: testProjectId,
    });
    testLeafId = leaf.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('createShareToken', () => {
    it('creates a share token with required fields', async () => {
      const result = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^share_/);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.entity_type).toBe('leaf');
      expect(result.entity_id).toBe(testLeafId);
      expect(result.project_id).toBe(testProjectId);
      expect(result.created_by).toBeNull();
      expect(result.created_at).toBeDefined();
      expect(result.expires_at).toBeNull();
      expect(result.revoked_at).toBeNull();
    });

    it('creates a share token with created_by', async () => {
      const result = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
        created_by: 'user_abc',
      });

      expect(result.created_by).toBe('user_abc');
    });

    it('creates a share token with expires_at', async () => {
      const expiresAt = new Date(Date.now() + 86400000); // 24 hours from now
      const result = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
        expires_at: expiresAt,
      });

      expect(result.expires_at).toBeDefined();
      expect(result.expires_at).not.toBeNull();
    });

    it('generates unique tokens for each share link', async () => {
      const result1 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const result2 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      expect(result1.id).not.toBe(result2.id);
      expect(result1.token).not.toBe(result2.token);
    });

    it('uses snake_case for all output fields', async () => {
      const result = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      expect(result).toHaveProperty('entity_type');
      expect(result).toHaveProperty('entity_id');
      expect(result).toHaveProperty('project_id');
      expect(result).toHaveProperty('created_by');
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('expires_at');
      expect(result).toHaveProperty('revoked_at');

      // Verify camelCase keys don't exist
      expect(result).not.toHaveProperty('entityType');
      expect(result).not.toHaveProperty('entityId');
      expect(result).not.toHaveProperty('projectId');
      expect(result).not.toHaveProperty('createdBy');
      expect(result).not.toHaveProperty('createdAt');
      expect(result).not.toHaveProperty('expiresAt');
      expect(result).not.toHaveProperty('revokedAt');
    });
  });

  describe('findShareTokenByToken', () => {
    it('returns the share token when it exists and is active', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const found = await findShareTokenByToken(db, created.token);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.token).toBe(created.token);
      expect(found!.entity_type).toBe('leaf');
      expect(found!.entity_id).toBe(testLeafId);
    });

    it('returns null when token does not exist', async () => {
      const found = await findShareTokenByToken(db, 'nonexistent_token_value');

      expect(found).toBeNull();
    });

    it('returns null for a revoked token', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      // Revoke the token
      await revokeShareToken(db, created.id);

      // Try to find by token - should return null
      const found = await findShareTokenByToken(db, created.token);

      expect(found).toBeNull();
    });

    it('returns null for an expired token', async () => {
      const pastDate = new Date(Date.now() - 86400000); // 24 hours ago
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
        expires_at: pastDate,
      });

      const found = await findShareTokenByToken(db, created.token);

      expect(found).toBeNull();
    });
  });

  describe('findShareTokenById', () => {
    it('returns the share token when it exists', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const found = await findShareTokenById(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.entity_type).toBe('leaf');
    });

    it('returns null when ID does not exist', async () => {
      const found = await findShareTokenById(db, 'share_nonexistent');

      expect(found).toBeNull();
    });

    it('returns the token even if revoked (findById does not filter)', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      await revokeShareToken(db, created.id);

      const found = await findShareTokenById(db, created.id);

      // findById does NOT filter by revoked_at - it returns the raw record
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.revoked_at).not.toBeNull();
    });
  });

  describe('findShareTokensByEntity', () => {
    it('returns active tokens for an entity', async () => {
      // Create a fresh leaf to avoid pollution from other tests
      const leaf = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'email',
        title: 'Entity Tokens Test',
        project_id: testProjectId,
      });

      await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      const results = await findShareTokensByEntity(db, 'leaf', leaf.id);

      expect(results).toHaveLength(2);
      expect(results.every((t) => t.entity_id === leaf.id)).toBe(true);
      expect(results.every((t) => t.entity_type === 'leaf')).toBe(true);
    });

    it('returns empty array when no tokens exist for entity', async () => {
      const results = await findShareTokensByEntity(db, 'leaf', 'leaf_nonexistent');

      expect(results).toHaveLength(0);
    });

    it('excludes revoked tokens', async () => {
      const leaf = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'article',
        title: 'Revoke Filter Test',
        project_id: testProjectId,
      });

      const token1 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      // Revoke token1
      await revokeShareToken(db, token1.id);

      const results = await findShareTokensByEntity(db, 'leaf', leaf.id);

      expect(results).toHaveLength(1);
      expect(results[0].id).not.toBe(token1.id);
    });
  });

  describe('revokeShareToken', () => {
    it('revokes a token and sets revoked_at', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const revoked = await revokeShareToken(db, created.id);

      expect(revoked).toBeDefined();
      expect(revoked!.id).toBe(created.id);
      expect(revoked!.revoked_at).not.toBeNull();
    });

    it('returns null when token ID does not exist', async () => {
      const revoked = await revokeShareToken(db, 'share_nonexistent');

      expect(revoked).toBeNull();
    });

    it('can revoke an already revoked token (updates revoked_at)', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const firstRevoke = await revokeShareToken(db, created.id);
      expect(firstRevoke).toBeDefined();
      expect(firstRevoke!.revoked_at).not.toBeNull();

      const secondRevoke = await revokeShareToken(db, created.id);
      expect(secondRevoke).toBeDefined();
      expect(secondRevoke!.revoked_at).not.toBeNull();
    });
  });

  describe('multiple tokens for same entity', () => {
    it('allows creating multiple tokens for the same entity', async () => {
      const leaf = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'slack',
        title: 'Multi Token Test',
        project_id: testProjectId,
      });

      const token1 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      const token2 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      const token3 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      // All tokens are unique
      const ids = [token1.id, token2.id, token3.id];
      expect(new Set(ids).size).toBe(3);

      const tokens = [token1.token, token2.token, token3.token];
      expect(new Set(tokens).size).toBe(3);

      // All are findable by token
      for (const t of [token1, token2, token3]) {
        const found = await findShareTokenByToken(db, t.token);
        expect(found).toBeDefined();
        expect(found!.id).toBe(t.id);
      }

      // findShareTokensByEntity returns all
      const entityTokens = await findShareTokensByEntity(db, 'leaf', leaf.id);
      expect(entityTokens).toHaveLength(3);
    });

    it('revoking one token does not affect others', async () => {
      const leaf = await createLeaf(db, {
        commit_hash: testCommitHash,
        type: 'weibo',
        title: 'Selective Revoke Test',
        project_id: testProjectId,
      });

      const token1 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      const token2 = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: leaf.id,
        project_id: testProjectId,
      });

      // Revoke only token1
      await revokeShareToken(db, token1.id);

      // token1 should not be findable by token
      const found1 = await findShareTokenByToken(db, token1.token);
      expect(found1).toBeNull();

      // token2 should still be findable
      const found2 = await findShareTokenByToken(db, token2.token);
      expect(found2).toBeDefined();
      expect(found2!.id).toBe(token2.id);

      // findShareTokensByEntity should return only token2
      const entityTokens = await findShareTokensByEntity(db, 'leaf', leaf.id);
      expect(entityTokens).toHaveLength(1);
      expect(entityTokens[0].id).toBe(token2.id);
    });
  });

  describe('commit entity type', () => {
    it('creates a share token for a commit entity', async () => {
      const result = await createShareToken(db, {
        entity_type: 'commit',
        entity_id: testCommitHash,
        project_id: testProjectId,
      });

      expect(result.entity_type).toBe('commit');
      expect(result.entity_id).toBe(testCommitHash);

      const found = await findShareTokenByToken(db, result.token);
      expect(found).toBeDefined();
      expect(found!.entity_type).toBe('commit');
    });
  });

  describe('ISO string format', () => {
    it('returns created_at as ISO string', async () => {
      const result = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('returns revoked_at as ISO string after revocation', async () => {
      const created = await createShareToken(db, {
        entity_type: 'leaf',
        entity_id: testLeafId,
        project_id: testProjectId,
      });

      const revoked = await revokeShareToken(db, created.id);

      expect(revoked!.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
