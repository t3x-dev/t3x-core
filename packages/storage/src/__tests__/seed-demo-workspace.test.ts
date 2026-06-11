import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteProject,
  findConversationsByProject,
  findLeavesByProject,
  findProjects,
  getGlobalSetting,
  listCommits,
} from '../queries';
import {
  type DemoWorkspaceSeedMarker,
  getDemoWorkspaceSeedKey,
  seedDemoWorkspace,
} from '../queries/seed-demo-workspace';
import { createTestDB } from './setup';

describe('seedDemoWorkspace', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDb = await createTestDB();
    db = testDb.db;
    cleanup = testDb.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('creates a professional demo project with source, commit, and leaf data', async () => {
    const result = await seedDemoWorkspace(db, { ownerId: null });

    expect(result.status).toBe('created');
    expect(result.project?.name).toBe(DEMO_WORKSPACE_FIXTURE.project.name);

    const projects = await findProjects(db, {});
    expect(projects).toHaveLength(1);
    const metadata = JSON.parse(projects[0]?.metadataJson ?? '{}');
    expect(metadata.is_demo).toBe(true);
    expect(metadata.demo_fixture_id).toBe(DEMO_WORKSPACE_FIXTURE.id);
    expect(typeof metadata.demo_seeded_at).toBe('string');

    const conversations = await findConversationsByProject(db, {
      projectId: projects[0]!.projectId,
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.title).toBe(DEMO_WORKSPACE_FIXTURE.source.title);

    const commits = await listCommits(db, { projectId: projects[0]!.projectId });
    expect(commits).toHaveLength(1);
    expect(commits[0]?.message).toBe(DEMO_WORKSPACE_FIXTURE.commit.message);
    expect(commits[0]?.provenance?.method).toBe('fixture_replay');
    expect(commits[0]?.content.trees[0]?.key).toBe('support_escalation_review');

    const leaves = await findLeavesByProject(db, projects[0]!.projectId);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.title).toBe(DEMO_WORKSPACE_FIXTURE.leaf.title);
    expect(leaves[0]?.output).toContain('Refunds above $100');
    expect(leaves[0]?.assertions?.every((assertion) => assertion.passed)).toBe(true);

    const marker = await getGlobalSetting<DemoWorkspaceSeedMarker>(
      db,
      getDemoWorkspaceSeedKey(null)
    );
    expect(marker?.project_id).toBe(projects[0]!.projectId);
    expect(marker?.status).toBe('active');
  });

  it('is idempotent and does not duplicate demo rows', async () => {
    const first = await seedDemoWorkspace(db, { ownerId: null });
    const second = await seedDemoWorkspace(db, { ownerId: null });

    expect(second.status).toBe('exists');
    expect(second.project?.projectId).toBe(first.project?.projectId);

    const projects = await findProjects(db, {});
    expect(projects).toHaveLength(1);
    expect(
      await findConversationsByProject(db, { projectId: projects[0]!.projectId })
    ).toHaveLength(1);
    expect(await listCommits(db, { projectId: projects[0]!.projectId })).toHaveLength(1);
    expect(await findLeavesByProject(db, projects[0]!.projectId)).toHaveLength(1);
  });

  it('does not silently recreate a deleted demo project unless reset is explicit', async () => {
    const first = await seedDemoWorkspace(db, { ownerId: null });
    await deleteProject(db, first.project!.projectId);

    const skipped = await seedDemoWorkspace(db, { ownerId: null });
    expect(skipped.status).toBe('skipped_deleted');
    expect(skipped.project).toBeNull();
    expect(await findProjects(db, {})).toHaveLength(0);

    const reset = await seedDemoWorkspace(db, { ownerId: null, resetDeleted: true });
    expect(reset.status).toBe('created');
    expect(reset.project?.projectId).not.toBe(first.project?.projectId);
    expect(await findProjects(db, {})).toHaveLength(1);
  });

  it('recreates a deleted demo project when reset is explicit on the first retry', async () => {
    const first = await seedDemoWorkspace(db, { ownerId: null });
    await deleteProject(db, first.project!.projectId);

    const reset = await seedDemoWorkspace(db, { ownerId: null, resetDeleted: true });
    expect(reset.status).toBe('created');
    expect(reset.project?.projectId).not.toBe(first.project?.projectId);
    expect(await findProjects(db, {})).toHaveLength(1);
  });
});
