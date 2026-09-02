import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  changeProjectVisibility,
  listProjectVisibilityEvents,
} from '../queries/project-visibility';
import { insertProject } from '../queries/projects';
import { createTestDB } from './setup';

describe('project visibility evidence', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('changes visibility and appends exact actor evidence atomically', async () => {
    const project = await insertProject(db, {
      name: 'Visibility evidence',
      namespaceId: 'ns_t3x_dev',
    });

    const result = await changeProjectVisibility(db, {
      projectId: project.projectId,
      namespaceId: 'ns_t3x_dev',
      visibility: 'unlisted',
      actor: { kind: 'human', id: 'user_visibility_admin' },
      publicationConfirmed: false,
    });

    expect(result?.project.visibility).toBe('unlisted');
    expect(result?.event).toMatchObject({
      projectId: project.projectId,
      namespaceId: 'ns_t3x_dev',
      fromVisibility: 'private',
      toVisibility: 'unlisted',
      actorKind: 'human',
      actorId: 'user_visibility_admin',
      publicationConfirmed: false,
    });
  });

  it('is idempotent when the requested visibility is already current', async () => {
    const project = await insertProject(db, {
      name: 'Visibility no-op',
      namespaceId: 'ns_t3x_dev',
    });
    const input = {
      projectId: project.projectId,
      namespaceId: 'ns_t3x_dev',
      visibility: 'unlisted' as const,
      actor: { kind: 'human' as const, id: 'user_visibility_admin' },
      publicationConfirmed: false,
    };

    await changeProjectVisibility(db, input);
    const repeated = await changeProjectVisibility(db, input);

    expect(repeated?.event).toBeNull();
    expect(await listProjectVisibilityEvents(db, project.projectId)).toHaveLength(1);
  });

  it('requires explicit confirmation before recording public intent', async () => {
    const project = await insertProject(db, {
      name: 'Publication confirmation',
      namespaceId: 'ns_t3x_dev',
    });

    await expect(
      changeProjectVisibility(db, {
        projectId: project.projectId,
        namespaceId: 'ns_t3x_dev',
        visibility: 'public',
        actor: { kind: 'human', id: 'user_visibility_admin' },
        publicationConfirmed: false,
      })
    ).rejects.toThrow(/publication confirmation/i);
    expect(await listProjectVisibilityEvents(db, project.projectId)).toEqual([]);

    const published = await changeProjectVisibility(db, {
      projectId: project.projectId,
      namespaceId: 'ns_t3x_dev',
      visibility: 'public',
      actor: { kind: 'human', id: 'user_visibility_admin' },
      publicationConfirmed: true,
    });
    expect(published?.event?.publicationConfirmed).toBe(true);
  });

  it('fails closed for a stale or cross-tenant namespace', async () => {
    const project = await insertProject(db, {
      name: 'Tenant isolation',
      namespaceId: 'ns_t3x_dev',
    });

    const result = await changeProjectVisibility(db, {
      projectId: project.projectId,
      namespaceId: 'ns_other',
      visibility: 'unlisted',
      actor: { kind: 'human', id: 'user_visibility_admin' },
      publicationConfirmed: false,
    });

    expect(result).toBeNull();
    expect(await listProjectVisibilityEvents(db, project.projectId)).toEqual([]);
  });
});
