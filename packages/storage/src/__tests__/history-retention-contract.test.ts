import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createTestDB } from './setup';

type StorageObject = { table: string; column?: string };
type RetentionResource = {
  id: string;
  owner: string;
  lifecycle: 'active' | 'compatibility' | 'immutable_history';
  storage: StorageObject[];
  read_paths: string[];
  write_paths: string[];
  retention: string;
  removal_gate: string;
};
type RetentionContract = {
  schema_version: number;
  lifecycle_states: string[];
  commit_policy: {
    writable_format: string;
    legacy_v1: string;
    enforcement_issue: string;
  };
  resources: RetentionResource[];
};

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const contractPath = fileURLToPath(
  new URL('../../contracts/history-retention.json', import.meta.url)
);

async function readContract(): Promise<RetentionContract> {
  return JSON.parse(await readFile(contractPath, 'utf8')) as RetentionContract;
}

describe('mixed-history retention contract', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => cleanup());

  it('names every retained or retiring storage concern exactly once', async () => {
    const contract = await readContract();
    expect(contract.schema_version).toBe(1);
    expect(contract.lifecycle_states).toEqual(['active', 'compatibility', 'immutable_history']);
    expect(contract.commit_policy).toEqual({
      writable_format: 't3x/commit/v2',
      legacy_v1: 'read_only_history',
      enforcement_issue: '#1305',
    });

    const ids = contract.resources.map((resource) => resource.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      [
        'committed_source_deletion_lock',
        'legacy_commit_archive',
        'legacy_commit_sources',
        'legacy_commit_yops_links',
        'legacy_topics',
        'legacy_tree_projection',
        'legacy_yops_history',
        'source_context_selection',
        'source_text_revisions',
        'source_thread',
        'source_turns',
      ].sort()
    );

    for (const resource of contract.resources) {
      expect(resource.owner.length).toBeGreaterThan(0);
      expect(resource.storage.length).toBeGreaterThan(0);
      expect(resource.read_paths.length).toBeGreaterThan(0);
      expect(resource.write_paths.length).toBeGreaterThan(0);
      expect(resource.retention.length).toBeGreaterThan(0);
      expect(resource.removal_gate.length).toBeGreaterThan(0);
    }
  });

  it('points only to checked-in owners and existing database objects', async () => {
    const contract = await readContract();
    const databaseRows = await db.execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const columns = new Set(
      (Array.isArray(databaseRows) ? databaseRows : (databaseRows.rows ?? [])).map(
        (row) => `${row.table_name}.${row.column_name}`
      )
    );

    for (const resource of contract.resources) {
      for (const path of [...resource.read_paths, ...resource.write_paths]) {
        await expect(access(`${repositoryRoot}/${path}`)).resolves.toBeUndefined();
      }
      for (const object of resource.storage) {
        const prefix = `${object.table}.`;
        expect(
          [...columns].some((column) => column.startsWith(prefix)),
          `${resource.id}: ${object.table}`
        ).toBe(true);
        if (object.column)
          expect(
            columns.has(`${object.table}.${object.column}`),
            `${resource.id}: ${object.table}.${object.column}`
          ).toBe(true);
      }
    }
  });
});
