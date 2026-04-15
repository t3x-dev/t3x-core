/**
 * Legacy Commit Schema Round-Trip (Audit 2026-04-15, B-8)
 *
 * Commits written before commit 6ced2044 (2026-04-13) stored the first-class
 * `schema` field as `'t3x/commit/1'`. That commit renamed COMMIT_SCHEMA to
 * `'t3x/commit'`, but `rowToCommit` used to unconditionally rewrite the
 * loaded `schema` back to the new constant. Because `schema` is hashed, the
 * recomputed hash then diverged from the stored one — every legacy commit
 * failed `verifyHashChain` with `hash_mismatch`.
 *
 * This test locks in the fix: a row with `schema = 't3x/commit/1'` must
 * round-trip unchanged through `getCommit`, and the recomputed hash must
 * match the stored hash.
 */

import { type Author, computeCommitHash } from '@t3x-dev/core';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { verifyHashChain } from '../backup/verify';
import { getCommit } from '../queries/commits';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

const LEGACY_SCHEMA = 't3x/commit/1' as const;

describe('rowToCommit — legacy schema round-trip (B-8)', () => {
  let db: AnyDB;
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    sql = setup.sql;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Legacy Schema Fixture' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('preserves legacy schema on read and keeps the stored hash valid', async () => {
    const author: Author = { type: 'human', name: 'Legacy Author' };
    const committedAt = '2026-04-10T02:15:00.000Z';
    const content = {
      trees: [
        {
          key: 'node_0',
          slots: { text: 'Budget is $3000' },
          children: [] as Array<{
            key: string;
            slots: Record<string, unknown>;
            children: [];
          }>,
        },
      ],
      relations: [] as never[],
    };

    // Compute the hash using the legacy schema string exactly as the pre-rename
    // code would have computed it.
    const legacyHash = computeCommitHash({
      schema: LEGACY_SCHEMA,
      parents: [],
      author,
      committed_at: committedAt,
      content,
    });

    // Insert the row directly, bypassing createCommit (which would use the
    // current COMMIT_SCHEMA and compute a different hash).
    await sql`
      INSERT INTO commits (
        hash, schema, parents, author, committed_at, content,
        project_id, message, branch, yops_log_ids
      )
      VALUES (
        ${legacyHash},
        ${LEGACY_SCHEMA},
        ${JSON.stringify([])}::jsonb,
        ${JSON.stringify(author)}::jsonb,
        ${committedAt}::timestamptz,
        ${JSON.stringify(content)}::jsonb,
        ${projectId},
        ${'legacy'},
        ${'main'},
        ${JSON.stringify([])}::jsonb
      )
    `;

    const loaded = await getCommit(db, legacyHash);
    expect(loaded).not.toBeNull();
    if (!loaded) return;

    // The schema must be preserved, NOT normalised to the current constant.
    expect(loaded.schema).toBe(LEGACY_SCHEMA);

    // Recomputing the hash over the loaded fields must reproduce the stored hash.
    const recomputed = computeCommitHash({
      schema: loaded.schema,
      parents: loaded.parents,
      author: loaded.author,
      committed_at: loaded.committed_at,
      content: loaded.content,
    });
    expect(recomputed).toBe(loaded.hash);

    // End-to-end: verifyHashChain must return valid=true for a project whose
    // only commit uses the legacy schema.
    const result = await verifyHashChain(db, projectId);
    expect(result.errors.hash_mismatch).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});
