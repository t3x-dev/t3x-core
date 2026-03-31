/**
 * Projects Storage Tests
 *
 * Tests all project CRUD operations and verifies database effects.
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertAgentDraft } from '../queries/agent-drafts';
import { insertBranch } from '../queries/branches';
import { createCommit } from '../queries/commits';
import { insertConversation } from '../queries/conversations';
import {
  deleteProject,
  findProjectById,
  findProjectByIdIncludingDeleted,
  findProjects,
  findProjectWithStats,
  insertProject,
  permanentDeleteProject,
  restoreProject,
  updateProject,
} from '../queries/projects';
import { insertTurn } from '../queries/turns';
import { projects } from '../schema';
import { createTestDB, testData } from './setup';

describe('Projects Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('insertProject', () => {
    it('creates a project and returns it with generated ID', async () => {
      const input = testData.project({ name: 'My Project' });

      const result = await insertProject(db, input);

      // Verify return value
      expect(result).toBeDefined();
      expect(result.projectId).toMatch(/^proj_[a-f0-9]+$/);
      expect(result.name).toBe('My Project');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('stores the project in the database', async () => {
      const input = testData.project({ name: 'DB Test Project' });

      const result = await insertProject(db, input);

      // Verify database effect
      const rows = await db.select().from(projects).where(eq(projects.projectId, result.projectId));

      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('DB Test Project');
      expect(rows[0].projectId).toBe(result.projectId);
    });

    it('stores metadata as JSON', async () => {
      const input = {
        name: 'Project with Metadata',
        metadata: { tags: ['test', 'demo'], priority: 1 },
      };

      const result = await insertProject(db, input);

      // Verify metadata stored as JSON
      const rows = await db.select().from(projects).where(eq(projects.projectId, result.projectId));

      expect(rows[0].metadataJson).toBeDefined();
      const metadata = JSON.parse(rows[0].metadataJson!);
      expect(metadata.tags).toEqual(['test', 'demo']);
      expect(metadata.priority).toBe(1);
    });
  });

  describe('findProjectById', () => {
    it('returns the project when it exists', async () => {
      const created = await insertProject(db, testData.project({ name: 'Find Me' }));

      const found = await findProjectById(db, created.projectId);

      expect(found).toBeDefined();
      expect(found!.projectId).toBe(created.projectId);
      expect(found!.name).toBe('Find Me');
    });

    it('returns null when project does not exist', async () => {
      const found = await findProjectById(db, 'proj_nonexistent');

      expect(found).toBeNull();
    });
  });

  describe('findProjects', () => {
    it('returns all projects with default options', async () => {
      // Create a few projects
      await insertProject(db, testData.project({ name: 'List Test 1' }));
      await insertProject(db, testData.project({ name: 'List Test 2' }));

      const results = await findProjects(db, {});

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('respects limit option', async () => {
      const results = await findProjects(db, { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('respects offset option', async () => {
      const all = await findProjects(db, {});
      const offset = await findProjects(db, { offset: 1 });

      expect(offset.length).toBe(Math.max(0, all.length - 1));
    });
  });

  describe('updateProject', () => {
    it('updates project name', async () => {
      const created = await insertProject(db, testData.project({ name: 'Original Name' }));

      const updated = await updateProject(db, created.projectId, { name: 'Updated Name' });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');

      // Verify database effect
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.projectId, created.projectId));

      expect(rows[0].name).toBe('Updated Name');
    });

    it('returns null when project does not exist', async () => {
      const updated = await updateProject(db, 'proj_nonexistent', { name: 'New Name' });

      expect(updated).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('soft-deletes the project (hidden from find)', async () => {
      const created = await insertProject(db, testData.project({ name: 'To Soft Delete' }));

      const deleted = await deleteProject(db, created.projectId);

      expect(deleted).toBe(true);

      // findProjectById should return null (filtered)
      const found = await findProjectById(db, created.projectId);
      expect(found).toBeNull();

      // But row still exists in database (including deleted)
      const raw = await findProjectByIdIncludingDeleted(db, created.projectId);
      expect(raw).toBeDefined();
      expect(raw!.deletedAt).toBeInstanceOf(Date);
    });

    it('returns false when project does not exist', async () => {
      const deleted = await deleteProject(db, 'proj_nonexistent');

      expect(deleted).toBe(false);
    });

    it('returns false when project is already soft-deleted', async () => {
      const created = await insertProject(db, testData.project({ name: 'Already Deleted' }));
      await deleteProject(db, created.projectId);

      const deleted = await deleteProject(db, created.projectId);
      expect(deleted).toBe(false);
    });
  });

  describe('restoreProject', () => {
    it('restores a soft-deleted project', async () => {
      const created = await insertProject(db, testData.project({ name: 'To Restore' }));
      await deleteProject(db, created.projectId);

      const restored = await restoreProject(db, created.projectId);

      expect(restored).toBeDefined();
      expect(restored!.projectId).toBe(created.projectId);
      expect(restored!.deletedAt).toBeNull();

      // findProjectById should find it again
      const found = await findProjectById(db, created.projectId);
      expect(found).toBeDefined();
      expect(found!.name).toBe('To Restore');
    });

    it('returns null for non-existent project', async () => {
      const restored = await restoreProject(db, 'proj_nonexistent');
      expect(restored).toBeNull();
    });

    it('returns null for non-deleted project', async () => {
      const created = await insertProject(db, testData.project({ name: 'Not Deleted' }));

      const restored = await restoreProject(db, created.projectId);
      expect(restored).toBeNull();
    });
  });

  describe('permanentDeleteProject', () => {
    it('permanently removes the project from database', async () => {
      const created = await insertProject(db, testData.project({ name: 'To Permanently Delete' }));

      const deleted = await permanentDeleteProject(db, created.projectId);

      expect(deleted).toBe(true);

      // Gone from both regular and including-deleted queries
      const found = await findProjectById(db, created.projectId);
      expect(found).toBeNull();
      const raw = await findProjectByIdIncludingDeleted(db, created.projectId);
      expect(raw).toBeNull();
    });

    it('can permanently delete a soft-deleted project', async () => {
      const created = await insertProject(db, testData.project({ name: 'Soft Then Permanent' }));
      await deleteProject(db, created.projectId);

      const deleted = await permanentDeleteProject(db, created.projectId);
      expect(deleted).toBe(true);

      const raw = await findProjectByIdIncludingDeleted(db, created.projectId);
      expect(raw).toBeNull();
    });

    it('restore fails after permanent delete', async () => {
      const created = await insertProject(db, testData.project({ name: 'Cannot Restore' }));
      await permanentDeleteProject(db, created.projectId);

      const restored = await restoreProject(db, created.projectId);
      expect(restored).toBeNull();
    });
  });

  describe('soft-delete filtering', () => {
    it('findProjects excludes soft-deleted projects', async () => {
      const active = await insertProject(db, testData.project({ name: 'Active Project' }));
      const toDelete = await insertProject(db, testData.project({ name: 'Deleted Project' }));
      await deleteProject(db, toDelete.projectId);

      const results = await findProjects(db, {});
      const ids = results.map((p) => p.projectId);

      expect(ids).toContain(active.projectId);
      expect(ids).not.toContain(toDelete.projectId);
    });

    it('updateProject does not update soft-deleted projects', async () => {
      const created = await insertProject(db, testData.project({ name: 'Update Block' }));
      await deleteProject(db, created.projectId);

      const updated = await updateProject(db, created.projectId, { name: 'New Name' });
      expect(updated).toBeNull();
    });

    it('findProjectWithStats returns null for soft-deleted projects', async () => {
      const created = await insertProject(db, testData.project({ name: 'Stats Block' }));
      await deleteProject(db, created.projectId);

      const result = await findProjectWithStats(db, created.projectId);
      expect(result).toBeNull();
    });
  });

  describe('findProjectWithStats', () => {
    it('returns null for non-existent project', async () => {
      const result = await findProjectWithStats(db, 'proj_nonexistent');

      expect(result).toBeNull();
    });

    it('returns project with zero counts when no related entities', async () => {
      const project = await insertProject(db, testData.project({ name: 'Empty Stats' }));

      const result = await findProjectWithStats(db, project.projectId);

      expect(result).toBeDefined();
      expect(result!.projectId).toBe(project.projectId);
      expect(result!.name).toBe('Empty Stats');
      expect(result!.stats).toEqual({
        conversationsCount: 0,
        turnsCount: 0,
        commitsCount: 0,
        branchesCount: 0,
        draftsCount: 0,
      });
    });

    it('returns correct counts for all related entities', async () => {
      // Create project with related entities
      const project = await insertProject(db, testData.project({ name: 'With Stats' }));
      const projectId = project.projectId;

      // Create 2 conversations
      const conv1 = await insertConversation(db, { projectId, title: 'Conv 1' });
      const conv2 = await insertConversation(db, { projectId, title: 'Conv 2' });

      // Create 3 turns
      await insertTurn(db, {
        projectId,
        conversationId: conv1.conversationId,
        role: 'user',
        content: 'Hello 1',
      });
      await insertTurn(db, {
        projectId,
        conversationId: conv1.conversationId,
        role: 'assistant',
        content: 'Hi 1',
      });
      await insertTurn(db, {
        projectId,
        conversationId: conv2.conversationId,
        role: 'user',
        content: 'Hello 2',
      });

      // Create 1 branch
      await insertBranch(db, { projectId, name: 'main' });

      // Create 1 draft
      await insertAgentDraft(db, {
        projectId,
        conversationId: conv1.conversationId,
        bridgeId: 'test',
        bridgePayload: {},
        llmConfig: { provider: 'test', model: 'test' },
        text: 'Draft text',
      });

      // Create 1 commit (frame-based)
      await createCommit(
        db,
        {
          author: { type: 'human', name: 'Test User' },
          content: {
            trees: [
              {
                key: 'test_knowledge',
                slots: { text: 'Test sentence' },
                children: [],
              },
            ],
            relations: [],
          },
          project_id: projectId,
          branch: 'main',
          message: 'Initial',
        } as any,
        { strictParents: false }
      );

      const result = await findProjectWithStats(db, projectId);

      expect(result).toBeDefined();
      expect(result!.stats.conversationsCount).toBe(2);
      expect(result!.stats.turnsCount).toBe(3);
      expect(result!.stats.branchesCount).toBe(1);
      expect(result!.stats.draftsCount).toBe(1);
      expect(result!.stats.commitsCount).toBe(1);
    });
  });
});
