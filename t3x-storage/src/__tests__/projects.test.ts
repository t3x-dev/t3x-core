/**
 * Projects Storage Tests
 *
 * Tests all project CRUD operations and verifies database effects.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDB, testData } from './setup';
import {
  insertProject,
  findProjectById,
  findProjects,
  updateProject,
  deleteProject,
} from '../queries/projects';
import { projects } from '../schema';
import type { AnyDB } from '../adapters';
import type { PGlite } from '@electric-sql/pglite';

describe('Projects Storage', () => {
  let db: AnyDB;
  let client: PGlite;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    client = setup.client;
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
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.projectId, result.projectId));

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
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.projectId, result.projectId));

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
    it('deletes the project from database', async () => {
      const created = await insertProject(db, testData.project({ name: 'To Delete' }));

      const deleted = await deleteProject(db, created.projectId);

      expect(deleted).toBe(true);

      // Verify database effect
      const found = await findProjectById(db, created.projectId);
      expect(found).toBeNull();
    });

    it('returns false when project does not exist', async () => {
      const deleted = await deleteProject(db, 'proj_nonexistent');

      expect(deleted).toBe(false);
    });
  });
});
