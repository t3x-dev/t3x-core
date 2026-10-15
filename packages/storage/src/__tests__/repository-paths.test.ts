import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureRepositoryPaths } from '../adapters/repository-paths';
import { insertPersonalNamespace } from '../queries/namespaces';
import {
  deleteProject,
  findProjectById,
  insertProject,
  restoreProject,
  updateProject,
} from '../queries/projects';
import {
  findRepositoryClaim,
  getRepositoryAddress,
  resolveRepositoryProject,
} from '../queries/repository-paths';
import { projects } from '../schema';
import { createTestDB } from './setup';

describe('repository path constraints on real PostgreSQL', () => {
  let setup: Awaited<ReturnType<typeof createTestDB>>;
  let namespaceId: string;
  let otherNamespaceId: string;
  beforeAll(async () => {
    setup = await createTestDB();
    namespaceId = (await insertPersonalNamespace(setup.db, { slug: 'paths-test' })).namespaceId;
    otherNamespaceId = (await insertPersonalNamespace(setup.db, { slug: 'paths-other' }))
      .namespaceId;
  });
  afterAll(async () => {
    await setup?.cleanup();
  });

  it('normalizes once, preserves legal case/punctuation and long digits', async () => {
    for (const [input, expected] of [
      [' My Project ', 'My-Project'],
      ['HoloCure_fishing_auto', 'HoloCure_fishing_auto'],
      ['A--B..._C', 'A--B..._C'],
      ['Release 2026101500000', 'Release-2026101500000'],
    ]) {
      const project = await insertProject(setup.db, { name: input, namespaceId });
      expect(project.name).toBe(expected);
      expect(await getRepositoryAddress(setup.db, project)).toMatchObject({
        canonical_path: `/paths-test/${expected}`,
      });
    }
    for (const name of ['', '项目计划', '---', '.', '..', 'a'.repeat(101), 'NEW', 'Settings']) {
      await expect(insertProject(setup.db, { name, namespaceId })).rejects.toThrow();
    }
  });

  it('arbitrates concurrent creates with a database constraint and scopes by namespace', async () => {
    const results = await Promise.allSettled(
      ['Concurrent', 'concurrent'].map((name) => insertProject(setup.db, { name, namespaceId }))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(
      insertProject(setup.db, { name: 'Concurrent', namespaceId: otherNamespaceId })
    ).resolves.toBeDefined();
  });

  it('keeps direct historical claims, supports own aliases and case-only renames', async () => {
    const p = await insertProject(setup.db, { name: 'First', namespaceId });
    await updateProject(setup.db, p.projectId, { name: 'Second' });
    await updateProject(setup.db, p.projectId, { name: 'THIRD' });
    for (const name of ['first', 'second', 'third']) {
      expect((await resolveRepositoryProject(setup.db, 'PATHS-TEST', name))?.projectId).toBe(
        p.projectId
      );
    }
    await expect(insertProject(setup.db, { name: 'FIRST', namespaceId })).rejects.toThrow();
    expect((await updateProject(setup.db, p.projectId, { name: 'first' }))?.name).toBe('first');
    expect((await updateProject(setup.db, p.projectId, { name: 'First' }))?.name).toBe('First');
  });

  it('rolls back losing renames and metadata, and retains deleted names through restore', async () => {
    const a = await insertProject(setup.db, { name: 'Race-A', namespaceId });
    const b = await insertProject(setup.db, { name: 'Race-B', namespaceId });
    const results = await Promise.allSettled(
      [a, b].map((p) =>
        updateProject(setup.db, p.projectId, {
          name: 'Race-Destination',
          metadata: { winner: true },
        })
      )
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results[0].status === 'rejected' ? a : b;
    expect(await findProjectById(setup.db, loser.projectId)).toMatchObject({
      name: loser.name,
      metadataJson: null,
    });
    await deleteProject(setup.db, loser.projectId);
    await expect(insertProject(setup.db, { name: loser.name, namespaceId })).rejects.toThrow();
    expect((await restoreProject(setup.db, loser.projectId))?.name).toBe(loser.name);
  });

  it('enforces transfer claims even on direct SQL and preserves source addresses', async () => {
    const p = await insertProject(setup.db, { name: 'Transfer', namespaceId });
    await setup.db
      .update(projects)
      .set({ namespaceId: otherNamespaceId })
      .where(eq(projects.projectId, p.projectId));
    expect((await resolveRepositoryProject(setup.db, 'paths-test', 'Transfer'))?.projectId).toBe(
      p.projectId
    );
    expect((await resolveRepositoryProject(setup.db, 'paths-other', 'Transfer'))?.projectId).toBe(
      p.projectId
    );
    const occupied = await insertProject(setup.db, {
      name: 'Transfer-Clash',
      namespaceId: otherNamespaceId,
    });
    const moving = await insertProject(setup.db, { name: 'Transfer-Clash', namespaceId });
    await expect(
      setup.db
        .update(projects)
        .set({ namespaceId: otherNamespaceId })
        .where(eq(projects.projectId, moving.projectId))
    ).rejects.toThrow();
    expect((await findProjectById(setup.db, moving.projectId))?.namespaceId).toBe(namespaceId);
    expect((await findRepositoryClaim(setup.db, otherNamespaceId, moving.name))?.projectId).toBe(
      occupied.projectId
    );
  });

  it('migrates clean historical rows without renaming and blocks ambiguous legacy candidates', async () => {
    // Simulate a v75 import inside a transaction; no real user data is touched.
    await setup.sql.begin(async (tx) => {
      await tx.unsafe('ALTER TABLE projects DISABLE TRIGGER projects_repository_path');
      await tx.unsafe(`INSERT INTO projects(project_id, namespace_id, name, created_at) VALUES
        ('legacy-clean', '${namespaceId}', 'Clean-Legacy', NOW()),
        ('legacy-spaced', '${namespaceId}', '  Confirm Name  ', NOW()),
        ('legacy-space', '${namespaceId}', 'Collision Name', NOW()),
        ('legacy-normal', '${namespaceId}', 'Collision-Name', NOW()),
        ('legacy-case-a', '${namespaceId}', 'Case-Clash', NOW()),
        ('legacy-case-b', '${namespaceId}', 'case-clash', NOW()),
        ('legacy-chinese', '${namespaceId}', '项目计划', NOW()),
        ('legacy-long', '${namespaceId}', repeat('a', 10000), NOW()),
        ('legacy-owner', NULL, 'No-Owner', NOW())`);
      await ensureRepositoryPaths(tx);
    });
    const clean = (await findProjectById(setup.db, 'legacy-clean'))!;
    expect((await getRepositoryAddress(setup.db, clean)).canonical_path).toBe(
      '/paths-test/Clean-Legacy'
    );
    for (const id of [
      'legacy-space',
      'legacy-normal',
      'legacy-case-a',
      'legacy-case-b',
      'legacy-chinese',
      'legacy-long',
      'legacy-owner',
    ]) {
      const p = (await findProjectById(setup.db, id))!;
      expect(p).toBeDefined();
      expect((await getRepositoryAddress(setup.db, p)).path_status).toBe('pending_migration');
    }
    const spaced = (await findProjectById(setup.db, 'legacy-spaced'))!;
    expect((await getRepositoryAddress(setup.db, spaced)).canonical_path).toBeNull();
    expect(await resolveRepositoryProject(setup.db, 'paths-test', 'Confirm-Name')).toBeNull();
    const confirmed = (await updateProject(setup.db, spaced.projectId, { name: 'Confirm-Name' }))!;
    expect((await getRepositoryAddress(setup.db, confirmed)).canonical_path).toBe(
      '/paths-test/Confirm-Name'
    );
    expect((await findProjectById(setup.db, 'legacy-space'))?.name).toBe('Collision Name');
    await expect(
      insertProject(setup.db, { namespaceId, name: 'Collision-Name' })
    ).rejects.toThrow();
  });
});
