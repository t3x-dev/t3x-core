#!/usr/bin/env npx tsx
/**
 * Migration Script: commits_v2 → commits_v3
 *
 * Migrates V2 commits to V3 format with:
 * - Topological sorting (parents first)
 * - v2→v3 hash mapping for parent reference conversion
 * - Per-segment turn_hash for accurate provenance
 * - Dry-run mode support
 *
 * Usage:
 *   # Dry run (preview only)
 *   pnpm tsx src/migrations/migrate-v2-to-v3.ts --dry-run
 *
 *   # Actual migration
 *   pnpm tsx src/migrations/migrate-v2-to-v3.ts
 *
 *   # With specific database URL
 *   DATABASE_URL=postgres://... pnpm tsx src/migrations/migrate-v2-to-v3.ts
 */

import {
  computeCommitV3Hash,
  buildConstraints,
  type Sentence,
  type Constraint,
  type CommitAuthor,
  type CommitContent,
} from '@t3x/core';
import {
  createPGLiteStorage,
  createPostgresStorage,
  type AnyDB,
  commits as commitsV2Table,
  commitsV3 as commitsV3Table,
} from '../index';

// ============================================================
// Types (exported for testing)
// ============================================================

export interface V2CommitRecord {
  commitHash: string;
  projectId: string;
  branch: string;
  message: string | null;
  parentsJson: string;
  turnWindowJson: string;
  facetSnapshotJson: string;
  mustHaveJson: string | null;
  mustntHaveJson: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
}

export interface SegmentFacet {
  facet: 'segment';
  key: string; // segmentId
  text: string;
  value: string;
  start_char: number;
  end_char: number;
  turn_hash: string;
  confidence?: number;
}

export interface MigrationOptions {
  dryRun: boolean;
}

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  hashMapping: Map<string, string>; // v2Hash → v3Hash
}

// ============================================================
// Helper Functions (exported for testing)
// ============================================================

/**
 * Extract segment facets from facetSnapshotJson
 */
export function extractSegments(facetSnapshotJson: string): SegmentFacet[] {
  if (!facetSnapshotJson) return [];

  try {
    const facets = JSON.parse(facetSnapshotJson);
    if (!Array.isArray(facets)) return [];

    return facets.filter(
      (f): f is SegmentFacet =>
        f && typeof f === 'object' && f.facet === 'segment' && typeof f.text === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Build V3 sentences from V2 segment facets
 * Uses per-segment turn_hash for accurate provenance.
 *
 * Fail-Fast: Throws error if any segment is missing turn_hash.
 *
 * @param segments - Segment facets from V2 commit
 * @throws Error if segment is missing turn_hash (data integrity issue)
 */
export function buildSentencesFromV2Segments(segments: SegmentFacet[]): Sentence[] {
  return segments.map((seg, index) => {
    if (!seg.turn_hash) {
      const textPreview = seg.text.length > 50 ? `${seg.text.slice(0, 50)}...` : seg.text;
      throw new Error(
        `Segment "${seg.key}" (index ${index}) is missing turn_hash. ` +
          `Text: "${textPreview}". ` +
          `This indicates data corruption in V2 commit. ` +
          `Ensure all segments have turn_hash before migration.`
      );
    }

    return {
      id: seg.key, // segmentId
      text: seg.text,
      source: {
        turn_hash: seg.turn_hash,
        start_char: seg.start_char ?? 0,
        end_char: seg.end_char ?? seg.text.length,
      },
    };
  });
}

/**
 * Parse JSON safely with default value
 */
export function safeParseJson<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Build a DAG from commits and return topologically sorted order
 * Parents will be processed before children
 */
export function topologicalSort(commits: V2CommitRecord[]): V2CommitRecord[] {
  // Build adjacency list and in-degree count
  const commitMap = new Map<string, V2CommitRecord>();
  const children = new Map<string, Set<string>>(); // parent → children
  const inDegree = new Map<string, number>(); // commit → number of unprocessed parents

  for (const commit of commits) {
    commitMap.set(commit.commitHash, commit);
    children.set(commit.commitHash, new Set());
    inDegree.set(commit.commitHash, 0);
  }

  // Build edges
  for (const commit of commits) {
    const parents = safeParseJson<string[]>(commit.parentsJson, []);
    let validParentCount = 0;

    for (const parentHash of parents) {
      // Only count parents that exist in our commit set
      if (commitMap.has(parentHash)) {
        children.get(parentHash)!.add(commit.commitHash);
        validParentCount++;
      }
    }

    inDegree.set(commit.commitHash, validParentCount);
  }

  // Kahn's algorithm
  const result: V2CommitRecord[] = [];
  const queue: string[] = [];

  // Start with commits that have no parents (or all parents are external)
  for (const [hash, degree] of inDegree) {
    if (degree === 0) {
      queue.push(hash);
    }
  }

  while (queue.length > 0) {
    const hash = queue.shift()!;
    const commit = commitMap.get(hash)!;
    result.push(commit);

    // Process children
    for (const childHash of children.get(hash)!) {
      const newDegree = inDegree.get(childHash)! - 1;
      inDegree.set(childHash, newDegree);
      if (newDegree === 0) {
        queue.push(childHash);
      }
    }
  }

  // Check for cycles (should not happen in a valid DAG)
  if (result.length !== commits.length) {
    const missing = commits.length - result.length;
    console.warn(`⚠️ Warning: ${missing} commits not processed (possible cycle in DAG)`);
    // Add remaining commits anyway
    for (const commit of commits) {
      if (!result.includes(commit)) {
        result.push(commit);
      }
    }
  }

  return result;
}

/**
 * Default author for migrated commits
 */
export function getMigrationAuthor(): CommitAuthor {
  return {
    name: 'migrated',
    verification: 'none',
  };
}

// ============================================================
// Main Migration Logic (exported for testing)
// ============================================================

export async function migrate(db: AnyDB, options: MigrationOptions): Promise<MigrationResult> {
  const { dryRun } = options;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migration: commits_v2 → commits_v3');
  console.log(`  Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚡ LIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  // Step 1: Fetch all V2 commits
  console.log('📥 Fetching V2 commits...');
  const v2Commits = (await db.select().from(commitsV2Table)) as V2CommitRecord[];
  console.log(`   Found ${v2Commits.length} commits\n`);

  if (v2Commits.length === 0) {
    console.log('✅ No commits to migrate');
    return { total: 0, migrated: 0, skipped: 0, errors: 0, hashMapping: new Map() };
  }

  // Step 2: Topological sort
  console.log('🔀 Topologically sorting commits (parents first)...');
  const sortedCommits = topologicalSort(v2Commits);
  console.log(`   Sorted ${sortedCommits.length} commits\n`);

  // Step 3: Check for existing V3 commits
  console.log('🔍 Checking for existing V3 commits...');
  const existingV3 = await db.select({ hash: commitsV3Table.hash }).from(commitsV3Table);
  const existingV3Hashes = new Set(existingV3.map((c) => c.hash));
  console.log(`   Found ${existingV3Hashes.size} existing V3 commits\n`);

  // Step 4: Migrate commits
  console.log('🚀 Starting migration...\n');

  const hashMapping = new Map<string, string>(); // v2Hash → v3Hash
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < sortedCommits.length; i++) {
    const v2 = sortedCommits[i];
    const progress = `[${i + 1}/${sortedCommits.length}]`;

    try {
      // Extract segments from facetSnapshotJson
      const segments = extractSegments(v2.facetSnapshotJson);

      if (segments.length === 0) {
        console.warn(`${progress} ⚠️  ${v2.commitHash.slice(0, 16)}... - No segments found`);
      }

      // Build sentences with per-segment turn_hash (accurate provenance)
      // Fail-Fast: throws if any segment is missing turn_hash
      const sentences = buildSentencesFromV2Segments(segments);

      // Parse must_have / mustnt_have
      const mustHave = safeParseJson<string[]>(v2.mustHaveJson, []);
      const mustntHave = safeParseJson<string[]>(v2.mustntHaveJson, []);

      // Build constraints
      const constraints = buildConstraints(mustHave, mustntHave, sentences);

      // Map parent hashes from v2 to v3
      const v2Parents = safeParseJson<string[]>(v2.parentsJson, []);
      const v3Parents: string[] = [];
      const missingParents: string[] = [];

      for (const v2ParentHash of v2Parents) {
        const v3ParentHash = hashMapping.get(v2ParentHash);
        if (v3ParentHash) {
          v3Parents.push(v3ParentHash);
        } else {
          // Parent not in mapping - could be external reference or migration error
          missingParents.push(v2ParentHash);
        }
      }

      // Warn about missing parents (potential DAG integrity issue)
      if (missingParents.length > 0) {
        console.warn(
          `${progress} ⚠️  ${v2.commitHash.slice(0, 16)}... - Missing parent mappings: ${missingParents.map((h) => h.slice(0, 16)).join(', ')}`
        );
      }

      // Build commit content
      const content: CommitContent = {
        sentences,
        constraints: constraints.length > 0 ? constraints : undefined,
      };

      // Build V3 commit data (first-class fields for hash)
      const author = getMigrationAuthor();
      const committedAt = v2.createdAt.toISOString();

      const v3CommitData = {
        schema: 'commit/v3' as const,
        parents: v3Parents,
        author,
        committed_at: committedAt,
        content,
      };

      // Compute V3 hash
      const v3Hash = computeCommitV3Hash(v3CommitData);

      // Store mapping
      hashMapping.set(v2.commitHash, v3Hash);

      // Check if already exists
      if (existingV3Hashes.has(v3Hash)) {
        console.log(`${progress} ⏭️  ${v2.commitHash.slice(0, 16)}... → ${v3Hash.slice(0, 23)}... (already exists)`);
        skipped++;
        continue;
      }

      // Log migration
      console.log(`${progress} ✅ ${v2.commitHash.slice(0, 16)}... → ${v3Hash.slice(0, 23)}...`);
      console.log(`         Sentences: ${sentences.length}, Constraints: ${constraints.length}, Parents: ${v3Parents.length}`);

      // Insert if not dry-run
      if (!dryRun) {
        await db.insert(commitsV3Table).values({
          hash: v3Hash,
          schema: 'commit/v3',
          parents: v3Parents,
          author,
          committedAt: v2.createdAt,
          content,
          projectId: v2.projectId,
          message: v2.message,
          branch: v2.branch,
          positionX: v2.positionX,
          positionY: v2.positionY,
        });
      }

      migrated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${progress} ❌ ${v2.commitHash.slice(0, 16)}... - Error: ${message}`);
      errors++;
    }
  }

  // Database verification (only in live mode)
  let v2CountVerified = 0;
  let v3CountVerified = 0;

  if (!dryRun) {
    console.log('🔍 Verifying database counts...');
    const v2CountResult = await db.select().from(commitsV2Table);
    const v3CountResult = await db.select().from(commitsV3Table);
    v2CountVerified = v2CountResult.length;
    v3CountVerified = v3CountResult.length;
    console.log(`   V2 commits in DB: ${v2CountVerified}`);
    console.log(`   V3 commits in DB: ${v3CountVerified}`);
  }

  // Summary
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total V2 commits:  ${sortedCommits.length}`);
  console.log(`  Migrated:          ${migrated}`);
  console.log(`  Skipped (exists):  ${skipped}`);
  console.log(`  Errors:            ${errors}`);

  if (!dryRun) {
    console.log();
    console.log('  Database verification:');

    // Verify: migrated + skipped should equal total (excluding errors)
    const actuallyProcessed = migrated + skipped;
    const shouldHaveProcessed = sortedCommits.length - errors;
    if (actuallyProcessed === shouldHaveProcessed) {
      console.log(`    ✅ All ${shouldHaveProcessed} commits processed correctly (${migrated} migrated, ${skipped} skipped)`);
    } else {
      console.log(`    ⚠️  Mismatch: should have processed ${shouldHaveProcessed}, actually processed ${actuallyProcessed}`);
    }

    // Reference counts (V3 may include pre-existing commits not from this migration)
    console.log(`    V2 commits in DB: ${v2CountVerified}`);
    console.log(`    V3 commits in DB: ${v3CountVerified} (may include pre-existing)`);
  }

  console.log();

  if (dryRun) {
    console.log('  ℹ️  This was a DRY RUN. No changes were made.');
    console.log('  ℹ️  Run without --dry-run to perform actual migration.');
  } else {
    console.log('  ✅ Migration complete!');
  }

  console.log('═══════════════════════════════════════════════════════════════');

  return {
    total: sortedCommits.length,
    migrated,
    skipped,
    errors,
    hashMapping,
  };
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // Determine database connection
  const databaseUrl = process.env.DATABASE_URL;

  let db: AnyDB;
  let cleanup: (() => Promise<void>) | undefined;

  if (databaseUrl) {
    console.log('📦 Connecting to PostgreSQL...');
    db = await createPostgresStorage({ connectionString: databaseUrl });
  } else {
    console.log('📦 Connecting to PGLite (local)...');
    const storage = await createPGLiteStorage({ dataDir: '.t3x/database' });
    db = storage;
    // PGLite returns the db directly, cleanup handled by process exit
  }

  try {
    await migrate(db, { dryRun });
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    // Cleanup database connection if available
    if (cleanup) {
      await cleanup();
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
