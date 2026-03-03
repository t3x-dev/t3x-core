/**
 * Templates Storage Tests
 *
 * Tests CRUD operations for templates including the
 * default_constraints and semantic_threshold columns.
 *
 * @see packages/storage/src/queries/templates.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createTemplate,
  deleteTemplate,
  findTemplateById,
  listTemplates,
} from '../queries/templates';
import { createTestDB } from './setup';

describe('templates with constraints', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestDB();
    db = result.db;
    cleanup = result.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  test('create template with default_constraints and semantic_threshold', async () => {
    const row = await createTemplate(db, {
      template_id: 'tmpl_test001',
      title: 'Test Tweet',
      description: 'Tweet template',
      category: 'social',
      leaf_type: 'tweet',
      system_prompt: 'You are a tweet writer',
      user_prompt: 'Write about {{topic}}',
      variables: [{ name: 'topic', description: 'Topic', required: true }],
      default_constraints: [
        { type: 'require', match_mode: 'exact', value: 'Must be 280 chars or fewer' },
      ],
      semantic_threshold: { require: 0.85, exclude: 0.8 },
    });
    expect(row.templateId).toBe('tmpl_test001');
  });

  test('find template returns new columns', async () => {
    const found = await findTemplateById(db, 'tmpl_test001');
    expect(found).not.toBeNull();
    expect(found?.defaultConstraints).toHaveLength(1);
    expect(found?.semanticThreshold).toEqual({ require: 0.85, exclude: 0.8 });
  });

  test('create template without new columns uses defaults', async () => {
    await createTemplate(db, {
      template_id: 'tmpl_test002',
      title: 'Plain',
      description: 'No constraints',
      category: 'general',
      leaf_type: 'custom',
      system_prompt: 'Be helpful',
      user_prompt: '{{input}}',
      variables: [],
    });
    const found = await findTemplateById(db, 'tmpl_test002');
    expect(found?.defaultConstraints).toEqual([]);
    expect(found?.semanticThreshold).toBeNull();
  });

  test('list templates returns new columns', async () => {
    const rows = await listTemplates(db);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const withConstraints = rows.find((r) => r.templateId === 'tmpl_test001');
    expect(withConstraints?.defaultConstraints).toHaveLength(1);
    expect(withConstraints?.semanticThreshold).toEqual({ require: 0.85, exclude: 0.8 });

    const withoutConstraints = rows.find((r) => r.templateId === 'tmpl_test002');
    expect(withoutConstraints?.defaultConstraints).toEqual([]);
    expect(withoutConstraints?.semanticThreshold).toBeNull();
  });

  test('delete template', async () => {
    const deleted = await deleteTemplate(db, 'tmpl_test001');
    expect(deleted).toBe(true);

    const found = await findTemplateById(db, 'tmpl_test001');
    expect(found).toBeNull();
  });
});
