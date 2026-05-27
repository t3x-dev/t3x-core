/**
 * Materials Storage Tests
 *
 * Materials are raw imported source objects that can be pinned with
 * PinType "import" and used as LLM source context.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createMaterial,
  deleteMaterial,
  findMaterialById,
  findMaterialsByIds,
  findMaterialsByProject,
} from '../queries/materials';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Materials Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Materials Test Project' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates and finds a document material', async () => {
    const created = await createMaterial(db, {
      project_id: testProjectId,
      source_type: 'document',
      title: 'Product Notes',
      filename: 'product-notes.md',
      mime_type: 'text/markdown',
      content_text: 'Launch the alpha to a small design partner cohort.',
      content_hash: 'sha256:material-notes',
      metadata: {
        source_type: 'document',
        source_filename: 'product-notes.md',
        content_hash: 'sha256:material-notes',
        content_length: 52,
        imported_at: '2026-05-26T00:00:00.000Z',
      },
      token_estimate: 13,
      created_by: 'user_test',
    });

    expect(created.id).toMatch(/^mat_/);
    expect(created.project_id).toBe(testProjectId);
    expect(created.source_type).toBe('document');
    expect(created.title).toBe('Product Notes');
    expect(created.filename).toBe('product-notes.md');
    expect(created.mime_type).toBe('text/markdown');
    expect(created.content_text).toContain('design partner cohort');
    expect(created.content_hash).toBe('sha256:material-notes');
    expect(created.token_estimate).toBe(13);
    expect(created.created_by).toBe('user_test');

    await expect(findMaterialById(db, created.id)).resolves.toEqual(created);
  });

  it('lists project materials newest first and fetches by ids in caller order', async () => {
    const older = await createMaterial(db, {
      project_id: testProjectId,
      source_type: 'document',
      title: 'Older Brief',
      content_text: 'Older source material.',
      content_hash: 'sha256:older-material',
      metadata: { content_hash: 'sha256:older-material' },
      token_estimate: 6,
    });
    const newer = await createMaterial(db, {
      project_id: testProjectId,
      source_type: 'document',
      title: 'Newer Brief',
      content_text: 'Newer source material.',
      content_hash: 'sha256:newer-material',
      metadata: { content_hash: 'sha256:newer-material' },
      token_estimate: 6,
    });

    const listed = await findMaterialsByProject(db, testProjectId, { limit: 10 });
    expect(listed.map((material) => material.id)).toEqual(
      expect.arrayContaining([older.id, newer.id])
    );
    expect(listed.findIndex((material) => material.id === newer.id)).toBeLessThan(
      listed.findIndex((material) => material.id === older.id)
    );

    await expect(findMaterialsByIds(db, [older.id, newer.id])).resolves.toEqual([older, newer]);
  });

  it('deletes a material', async () => {
    const material = await createMaterial(db, {
      project_id: testProjectId,
      source_type: 'document',
      title: 'Temporary Brief',
      content_text: 'Temporary source material.',
      content_hash: 'sha256:temporary-material',
      metadata: { content_hash: 'sha256:temporary-material' },
      token_estimate: 6,
    });

    await expect(deleteMaterial(db, material.id)).resolves.toBe(true);
    await expect(findMaterialById(db, material.id)).resolves.toBeNull();
    await expect(deleteMaterial(db, material.id)).resolves.toBe(false);
  });
});
