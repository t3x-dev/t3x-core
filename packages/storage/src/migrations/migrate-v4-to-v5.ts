/**
 * Migration Script: commits_v4 → commits
 *
 * Converts all V4 sentence-based commits to frame-based commits.
 * Each sentence becomes a frame with type 'legacy_sentence' and slots: { text }.
 * If the V4 commit has a `semantic` JSONB field with frames, those are used directly.
 *
 * This script is IDEMPOTENT — safe to run multiple times.
 * Commits already in commits table (by hash) are skipped.
 *
 * Usage:
 *   npx tsx packages/storage/src/migrations/migrate-v4-to-v5.ts [--dry-run]
 *
 * After migration, verify with:
 *   SELECT count(*) FROM commits_v4 WHERE hash NOT IN (SELECT hash FROM commits);
 *   -- Must return 0
 *
 * Then DROP:
 *   DROP TABLE IF EXISTS commits_v4;
 */

import { sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { commits } from '../schema-commits';
import { commitsV4 } from '../schema-frames';

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: Array<{ hash: string; error: string }>;
}

/**
 * Migrate all V4 sentence-based commits to frame-based format.
 *
 * @param db - Database instance
 * @param dryRun - If true, report what would be migrated without writing
 */
export async function migrateV4ToV5(db: AnyDB, dryRun = false): Promise<MigrationResult> {
  const result: MigrationResult = { total: 0, migrated: 0, skipped: 0, errors: [] };

  // Fetch all V4 commits
  const v4Rows = await db.select().from(commitsV4);
  result.total = v4Rows.length;

  if (v4Rows.length === 0) {
    return result;
  }

  // Fetch existing frame-based commit hashes for dedup
  const v5Hashes = new Set(
    (await db.select({ hash: commits.hash }).from(commits)).map((r) => r.hash)
  );

  for (const row of v4Rows) {
    // Skip if already migrated
    if (v5Hashes.has(row.hash)) {
      result.skipped++;
      continue;
    }

    try {
      // Convert V4 content to frames
      const content = row.content as {
        sentences?: Array<{ id: string; text: string; confidence?: number }>;
      } | null;
      const semantic = row.semantic as { frames?: unknown[]; relations?: unknown[] } | null;

      let frames: unknown[];
      let relations: unknown[] = [];

      if (semantic?.frames && (semantic.frames as unknown[]).length > 0) {
        // V4 commit has semantic frame data — use it directly
        frames = semantic.frames;
        relations = semantic.relations ?? [];
      } else if (content?.sentences) {
        // Convert sentences to legacy_sentence frames
        frames = content.sentences.map((s, i) => ({
          id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
          type: 'legacy_sentence',
          slots: { text: s.text },
          confidence: s.confidence,
        }));
      } else {
        frames = [];
      }

      if (!dryRun) {
        // Parse V4 fields
        const parents = (row.parents as string[]) ?? [];
        const author = (row.author as { type?: string; name?: string; id?: string }) ?? {};
        const sourceRefs = row.sourceRefs as Array<{
          type: string;
          id: string;
          title?: string;
        }> | null;

        await db.insert(commits).values({
          hash: row.hash,
          schema: 't3x/commit/5',
          parents,
          author: {
            type: author.type ?? 'human',
            name: author.name,
            id: author.id,
          },
          committedAt: row.committedAt,
          content: { frames, relations },
          projectId: row.projectId,
          message: row.message,
          branch: row.branch ?? 'main',
          sources:
            sourceRefs?.map((sr) => ({
              type: sr.type,
              id: sr.id,
              title: sr.title,
            })) ?? null,
          provenance: { method: 'import' as const },
          positionX: row.positionX,
          positionY: row.positionY,
        });
      }

      result.migrated++;
    } catch (err) {
      result.errors.push({
        hash: row.hash,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Verify migration completeness.
 * Returns count of V4 commits NOT in the commits table.
 */
export async function verifyMigration(
  db: AnyDB
): Promise<{ orphanCount: number; leafOrphanCount: number }> {
  const [orphanResult] = await db.execute(
    sql`SELECT count(*)::int as count FROM commits_v4 WHERE hash NOT IN (SELECT hash FROM commits)`
  );
  const orphanCount = (orphanResult as { count: number })?.count ?? -1;

  // Check leaves referencing commits not yet migrated
  const [leafOrphanResult] = await db.execute(
    sql`SELECT count(*)::int as count FROM leaves WHERE commit_hash NOT IN (SELECT hash FROM commits)`
  );
  const leafOrphanCount = (leafOrphanResult as { count: number })?.count ?? -1;

  return { orphanCount, leafOrphanCount };
}

// CLI entry point
if (process.argv[1]?.includes('migrate-v4-to-v5')) {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`V4 → Frame Migration ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('=========================================');

  import('../embedded').then(async ({ getDB }) => {
    const db = await getDB();
    const result = await migrateV4ToV5(db, dryRun);

    console.log(`Total V4 commits:  ${result.total}`);
    console.log(`Migrated:          ${result.migrated}`);
    console.log(`Skipped (exists):  ${result.skipped}`);
    console.log(`Errors:            ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const e of result.errors) {
        console.log(`  ${e.hash.slice(0, 16)}: ${e.error}`);
      }
    }

    if (!dryRun && result.total > 0) {
      console.log('\nVerifying...');
      const verify = await verifyMigration(db);
      console.log(`Orphan commits:    ${verify.orphanCount}`);
      console.log(`Orphan leaves:     ${verify.leafOrphanCount}`);

      if (verify.orphanCount === 0 && verify.leafOrphanCount === 0) {
        console.log('\n✅ Safe to DROP TABLE commits_v4');
        console.log('   Table is already named "commits" — no rename needed.');
      } else {
        console.log('\n⚠️  Migration incomplete — DO NOT drop commits_v4');
      }
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  });
}
