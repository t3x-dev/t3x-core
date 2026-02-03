/**
 * Migration Tests: commits_v2 → commits_v3
 *
 * Tests for the V2 to V3 commit migration script.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  buildSentencesFromV2Segments,
  extractSegments,
  getMigrationAuthor,
  migrate,
  type SegmentFacet,
  safeParseJson,
  topologicalSort,
  type V2CommitRecord,
} from '../migrations/migrate-v2-to-v3';
import { insertProject } from '../queries/projects';
import { commits as commitsV2Table, commitsV3 as commitsV3Table } from '../schema';
import { createTestDB, testData } from './setup';

// Suppress console output during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractSegments', () => {
  it('should extract segment facets from valid JSON', () => {
    const facetSnapshotJson = JSON.stringify([
      {
        facet: 'segment',
        key: 's-1',
        text: 'Hello world',
        value: 'Hello world',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:abc123',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'How are you?',
        value: 'How are you?',
        start_char: 12,
        end_char: 24,
        turn_hash: 'sha256:def456',
      },
      {
        facet: 'keyword',
        key: 'hello',
        value: 'hello',
      },
    ]);

    const segments = extractSegments(facetSnapshotJson);

    expect(segments).toHaveLength(2);
    expect(segments[0].key).toBe('s-1');
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].turn_hash).toBe('sha256:abc123');
    expect(segments[1].key).toBe('s-2');
    expect(segments[1].turn_hash).toBe('sha256:def456');
  });

  it('should return empty array for empty JSON', () => {
    expect(extractSegments('')).toEqual([]);
    expect(extractSegments('[]')).toEqual([]);
  });

  it('should return empty array for invalid JSON', () => {
    expect(extractSegments('not valid json')).toEqual([]);
    expect(extractSegments('{}')).toEqual([]);
  });

  it('should filter out invalid segment facets', () => {
    const facetSnapshotJson = JSON.stringify([
      { facet: 'segment', key: 's-1', text: 'Valid' }, // missing turn_hash etc but has text
      { facet: 'segment', key: 's-2' }, // missing text - should be filtered
      { facet: 'keyword', text: 'Not a segment' },
      null,
      undefined,
    ]);

    const segments = extractSegments(facetSnapshotJson);

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Valid');
  });
});

describe('buildSentencesFromV2Segments', () => {
  it('should convert segment facets to V3 sentences', () => {
    const segments: SegmentFacet[] = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Hello world',
        value: 'Hello world',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turn1',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'Goodbye world',
        value: 'Goodbye world',
        start_char: 12,
        end_char: 25,
        turn_hash: 'sha256:turn2',
      },
    ];

    const sentences = buildSentencesFromV2Segments(segments);

    expect(sentences).toHaveLength(2);

    expect(sentences[0]).toEqual({
      id: 's-1',
      text: 'Hello world',
      source: {
        turn_hash: 'sha256:turn1',
        start_char: 0,
        end_char: 11,
      },
    });

    expect(sentences[1]).toEqual({
      id: 's-2',
      text: 'Goodbye world',
      source: {
        turn_hash: 'sha256:turn2',
        start_char: 12,
        end_char: 25,
      },
    });
  });

  it('should handle empty segments array', () => {
    const sentences = buildSentencesFromV2Segments([]);
    expect(sentences).toEqual([]);
  });

  it('should use per-segment turn_hash for accurate provenance', () => {
    // This is a key feature - each sentence should have its own turn_hash
    const segments: SegmentFacet[] = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'From turn 1',
        value: 'From turn 1',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turn_A',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'From turn 2',
        value: 'From turn 2',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turn_B',
      },
      {
        facet: 'segment',
        key: 's-3',
        text: 'From turn 3',
        value: 'From turn 3',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turn_C',
      },
    ];

    const sentences = buildSentencesFromV2Segments(segments);

    // Each sentence should have different turn_hash
    expect(sentences[0].source.turn_hash).toBe('sha256:turn_A');
    expect(sentences[1].source.turn_hash).toBe('sha256:turn_B');
    expect(sentences[2].source.turn_hash).toBe('sha256:turn_C');
  });

  it('should throw error when segment is missing turn_hash (Fail-Fast)', () => {
    // Fail-Fast: missing turn_hash is a data integrity issue, not a fallback scenario
    const segments: SegmentFacet[] = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Has turn_hash',
        value: 'Has turn_hash',
        start_char: 0,
        end_char: 13,
        turn_hash: 'sha256:explicit',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'No turn_hash - should fail',
        value: 'No turn_hash - should fail',
        start_char: 0,
        end_char: 26,
        turn_hash: '', // Empty string = missing
      },
    ];

    expect(() => buildSentencesFromV2Segments(segments)).toThrow(
      /Segment "s-2".*missing turn_hash/
    );
  });

  it('should include helpful error message with segment details', () => {
    const segments: SegmentFacet[] = [
      {
        facet: 'segment',
        key: 'seg-abc',
        text: 'This is a segment without turn_hash that should cause an error',
        value: 'This is a segment without turn_hash that should cause an error',
        start_char: 0,
        end_char: 63,
        turn_hash: '', // Missing
      },
    ];

    expect(() => buildSentencesFromV2Segments(segments)).toThrow(
      /seg-abc.*index 0.*missing turn_hash.*data corruption/
    );
  });
});

describe('safeParseJson', () => {
  it('should parse valid JSON', () => {
    expect(safeParseJson('["a", "b"]', [])).toEqual(['a', 'b']);
    expect(safeParseJson('{"key": "value"}', {})).toEqual({ key: 'value' });
  });

  it('should return default value for null/empty', () => {
    expect(safeParseJson(null, [])).toEqual([]);
    expect(safeParseJson('', ['default'])).toEqual(['default']);
  });

  it('should return default value for invalid JSON', () => {
    expect(safeParseJson('not json', [])).toEqual([]);
    expect(safeParseJson('{invalid}', { fallback: true })).toEqual({ fallback: true });
  });
});

describe('topologicalSort', () => {
  const makeCommit = (hash: string, parents: string[]): V2CommitRecord => ({
    commitHash: hash,
    projectId: 'proj_1',
    branch: 'main',
    message: null,
    parentsJson: JSON.stringify(parents),
    turnWindowJson: '{}',
    facetSnapshotJson: '[]',
    mustHaveJson: null,
    mustntHaveJson: null,
    positionX: null,
    positionY: null,
    createdAt: new Date(),
  });

  it('should sort commits so parents come before children', () => {
    // DAG:  A → B → C
    const commits = [makeCommit('C', ['B']), makeCommit('A', []), makeCommit('B', ['A'])];

    const sorted = topologicalSort(commits);
    const hashes = sorted.map((c) => c.commitHash);

    // A must come before B, B must come before C
    expect(hashes.indexOf('A')).toBeLessThan(hashes.indexOf('B'));
    expect(hashes.indexOf('B')).toBeLessThan(hashes.indexOf('C'));
  });

  it('should handle multiple root commits', () => {
    // DAG:  A → C
    //       B → C
    const commits = [makeCommit('C', ['A', 'B']), makeCommit('A', []), makeCommit('B', [])];

    const sorted = topologicalSort(commits);
    const hashes = sorted.map((c) => c.commitHash);

    // A and B must come before C
    expect(hashes.indexOf('A')).toBeLessThan(hashes.indexOf('C'));
    expect(hashes.indexOf('B')).toBeLessThan(hashes.indexOf('C'));
  });

  it('should handle diamond pattern', () => {
    // DAG:      A
    //         /   \
    //        B     C
    //         \   /
    //           D
    const commits = [
      makeCommit('D', ['B', 'C']),
      makeCommit('C', ['A']),
      makeCommit('B', ['A']),
      makeCommit('A', []),
    ];

    const sorted = topologicalSort(commits);
    const hashes = sorted.map((c) => c.commitHash);

    // A must come first
    expect(hashes.indexOf('A')).toBeLessThan(hashes.indexOf('B'));
    expect(hashes.indexOf('A')).toBeLessThan(hashes.indexOf('C'));
    // B and C must come before D
    expect(hashes.indexOf('B')).toBeLessThan(hashes.indexOf('D'));
    expect(hashes.indexOf('C')).toBeLessThan(hashes.indexOf('D'));
  });

  it('should handle external parent references (not in commit set)', () => {
    // B references external parent "external_hash" not in our set
    const commits = [makeCommit('B', ['A', 'external_hash']), makeCommit('A', [])];

    const sorted = topologicalSort(commits);
    const hashes = sorted.map((c) => c.commitHash);

    // Should still work - external references are ignored
    expect(hashes.indexOf('A')).toBeLessThan(hashes.indexOf('B'));
  });

  it('should handle empty input', () => {
    const sorted = topologicalSort([]);
    expect(sorted).toEqual([]);
  });

  it('should handle single commit', () => {
    const commits = [makeCommit('A', [])];
    const sorted = topologicalSort(commits);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].commitHash).toBe('A');
  });

  it('should handle cyclic DAG gracefully (warn and include all commits)', () => {
    // DAG with cycle: A → B → C → A (invalid but should not crash)
    const commits = [
      makeCommit('A', ['C']), // A depends on C
      makeCommit('B', ['A']), // B depends on A
      makeCommit('C', ['B']), // C depends on B (creates cycle)
    ];

    // Should not throw, should return all commits
    const sorted = topologicalSort(commits);

    // All commits should be included despite cycle
    expect(sorted).toHaveLength(3);
    expect(sorted.map((c) => c.commitHash).sort()).toEqual(['A', 'B', 'C']);

    // Verify warning was logged about cycle
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('commits not processed'));
  });
});

describe('getMigrationAuthor', () => {
  it('should return correct migration author', () => {
    const author = getMigrationAuthor();

    expect(author).toEqual({
      name: 'migrated',
      verification: 'none',
    });
  });
});

describe('migrate (integration)', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDB = await createTestDB();
    db = testDB.db;
    cleanup = testDB.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should return empty result when no V2 commits exist', async () => {
    const result = await migrate(db, { dryRun: false });

    expect(result.total).toBe(0);
    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should migrate V2 commits to V3 in dry-run mode', async () => {
    // Create a project first
    const project = await insertProject(db, testData.project());

    // Insert V2 commit directly
    const v2CommitHash = 'sha256:v2_commit_1';
    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test sentence',
        value: 'Test sentence',
        start_char: 0,
        end_char: 13,
        turn_hash: 'sha256:turn1',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: v2CommitHash,
      projectId: project.projectId,
      branch: 'main',
      message: 'Test commit',
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: JSON.stringify(['$5000']),
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    // Run migration in dry-run mode
    const result = await migrate(db, { dryRun: true });

    expect(result.total).toBe(1);
    expect(result.migrated).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.hashMapping.size).toBe(1);
    expect(result.hashMapping.has(v2CommitHash)).toBe(true);

    // Verify no V3 commits were actually created (dry-run)
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(0);
  });

  it('should migrate V2 commits to V3 in live mode', async () => {
    // Create a project first
    const project = await insertProject(db, testData.project());

    // Insert V2 commit directly
    const v2CommitHash = 'sha256:v2_commit_1';
    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test sentence one',
        value: 'Test sentence one',
        start_char: 0,
        end_char: 17,
        turn_hash: 'sha256:turn1',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'Test sentence two',
        value: 'Test sentence two',
        start_char: 18,
        end_char: 35,
        turn_hash: 'sha256:turn2',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: v2CommitHash,
      projectId: project.projectId,
      branch: 'main',
      message: 'Test commit',
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    // Run migration in live mode
    const result = await migrate(db, { dryRun: false });

    expect(result.total).toBe(1);
    expect(result.migrated).toBe(1);
    expect(result.errors).toBe(0);

    // Verify V3 commit was created
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);

    const v3Commit = v3Commits[0];
    expect(v3Commit.schema).toBe('commit/v3');
    expect(v3Commit.projectId).toBe(project.projectId);
    expect(v3Commit.branch).toBe('main');
    expect(v3Commit.message).toBe('Test commit');
    expect(v3Commit.author).toEqual({ name: 'migrated', verification: 'none' });

    // Verify content structure
    const content = v3Commit.content as { sentences: unknown[]; constraints?: unknown[] };
    expect(content.sentences).toHaveLength(2);
  });

  it('should preserve per-segment turn_hash in migrated commits', async () => {
    const project = await insertProject(db, testData.project());

    // Create V2 commit with segments from different turns
    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'From turn A',
        value: 'From turn A',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turnA',
      },
      {
        facet: 'segment',
        key: 's-2',
        text: 'From turn B',
        value: 'From turn B',
        start_char: 0,
        end_char: 11,
        turn_hash: 'sha256:turnB',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:v2_multi_turn',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    await migrate(db, { dryRun: false });

    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);

    const content = v3Commits[0].content as {
      sentences: Array<{ id: string; text: string; source: { turn_hash: string } }>;
    };

    // Verify each sentence has its correct turn_hash
    expect(content.sentences[0].source.turn_hash).toBe('sha256:turnA');
    expect(content.sentences[1].source.turn_hash).toBe('sha256:turnB');
  });

  it('should map parent hashes from V2 to V3', async () => {
    const project = await insertProject(db, testData.project());

    // Create parent V2 commit
    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:parent_v2',
      projectId: project.projectId,
      branch: 'main',
      message: 'Parent commit',
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify([
        {
          facet: 'segment',
          key: 's-1',
          text: 'Parent',
          value: 'Parent',
          start_char: 0,
          end_char: 6,
          turn_hash: 'sha256:t1',
        },
      ]),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date('2024-01-01'),
    });

    // Create child V2 commit referencing parent
    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:child_v2',
      projectId: project.projectId,
      branch: 'main',
      message: 'Child commit',
      parentsJson: JSON.stringify(['sha256:parent_v2']),
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify([
        {
          facet: 'segment',
          key: 's-1',
          text: 'Child',
          value: 'Child',
          start_char: 0,
          end_char: 5,
          turn_hash: 'sha256:t2',
        },
      ]),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date('2024-01-02'),
    });

    const result = await migrate(db, { dryRun: false });

    expect(result.migrated).toBe(2);
    expect(result.hashMapping.size).toBe(2);

    // Get the V3 hashes
    const parentV3Hash = result.hashMapping.get('sha256:parent_v2');
    const childV3Hash = result.hashMapping.get('sha256:child_v2');

    expect(parentV3Hash).toBeDefined();
    expect(childV3Hash).toBeDefined();

    // Verify child V3 commit has correct parent reference
    const v3Commits = await db.select().from(commitsV3Table);
    const childV3 = v3Commits.find((c) => c.hash === childV3Hash);

    expect(childV3).toBeDefined();
    expect(childV3!.parents).toContain(parentV3Hash);
  });

  it('should skip already migrated commits', async () => {
    const project = await insertProject(db, testData.project());

    // Insert V2 commit
    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test',
        value: 'Test',
        start_char: 0,
        end_char: 4,
        turn_hash: 'sha256:t1',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:v2_commit',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    // Run migration first time
    const result1 = await migrate(db, { dryRun: false });
    expect(result1.migrated).toBe(1);
    expect(result1.skipped).toBe(0);

    // Run migration second time
    const result2 = await migrate(db, { dryRun: false });
    expect(result2.migrated).toBe(0);
    expect(result2.skipped).toBe(1);

    // Verify only one V3 commit exists
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);
  });

  it('should handle commits with no segments (warning but continue)', async () => {
    const project = await insertProject(db, testData.project());

    // Insert V2 commit with no segments
    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:empty_segments',
      projectId: project.projectId,
      branch: 'main',
      message: 'Empty commit',
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify([{ facet: 'keyword', key: 'test', value: 'test' }]),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    const result = await migrate(db, { dryRun: false });

    // Should still migrate (with warning)
    expect(result.migrated).toBe(1);
    expect(result.errors).toBe(0);

    // Verify V3 commit has empty sentences
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);

    const content = v3Commits[0].content as { sentences: unknown[] };
    expect(content.sentences).toHaveLength(0);
  });

  it('should convert mustHave/mustntHave to constraints', async () => {
    const project = await insertProject(db, testData.project());

    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'The price is $5000 per month',
        value: 'The price is $5000 per month',
        start_char: 0,
        end_char: 28,
        turn_hash: 'sha256:t1',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:with_constraints',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: JSON.stringify(['$5000']),
      mustntHaveJson: JSON.stringify(['competitor']),
      createdAt: new Date(),
    });

    await migrate(db, { dryRun: false });

    const v3Commits = await db.select().from(commitsV3Table);
    const content = v3Commits[0].content as {
      sentences: unknown[];
      constraints: Array<{ type: string; value: string }>;
    };

    expect(content.constraints).toBeDefined();
    expect(content.constraints.length).toBeGreaterThanOrEqual(2);

    const requireConstraint = content.constraints.find(
      (c) => c.type === 'require' && c.value === '$5000'
    );
    const excludeConstraint = content.constraints.find(
      (c) => c.type === 'exclude' && c.value === 'competitor'
    );

    expect(requireConstraint).toBeDefined();
    expect(excludeConstraint).toBeDefined();

    // Verify source_sentence_id is correctly linked
    const requireWithSource = requireConstraint as {
      type: string;
      value: string;
      source_sentence_id?: string;
    };
    expect(requireWithSource.source_sentence_id).toBe('s-1');
  });

  it('should preserve position fields from V2 to V3', async () => {
    const project = await insertProject(db, testData.project());

    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test',
        value: 'Test',
        start_char: 0,
        end_char: 4,
        turn_hash: 'sha256:t1',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:with_position',
      projectId: project.projectId,
      branch: 'main',
      message: 'Positioned commit',
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      positionX: 150.5,
      positionY: 200.75,
      createdAt: new Date(),
    });

    await migrate(db, { dryRun: false });

    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);
    expect(v3Commits[0].positionX).toBe(150.5);
    expect(v3Commits[0].positionY).toBe(200.75);
  });

  it('should preserve committedAt timestamp from V2 createdAt', async () => {
    const project = await insertProject(db, testData.project());

    const specificDate = new Date('2024-06-15T10:30:00.000Z');
    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test',
        value: 'Test',
        start_char: 0,
        end_char: 4,
        turn_hash: 'sha256:t1',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:with_timestamp',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: specificDate,
    });

    await migrate(db, { dryRun: false });

    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);
    expect(v3Commits[0].committedAt.toISOString()).toBe(specificDate.toISOString());
  });

  it('should count errors when migration fails for individual commits', async () => {
    const project = await insertProject(db, testData.project());

    // Insert a V2 commit with segment missing turn_hash (will fail Fail-Fast check)
    const badFacetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Missing turn_hash',
        value: 'Missing turn_hash',
        start_char: 0,
        end_char: 17,
        turn_hash: '',
      },
    ];

    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:bad_commit',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: '[]',
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(badFacetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    const result = await migrate(db, { dryRun: false });

    expect(result.total).toBe(1);
    expect(result.migrated).toBe(0);
    expect(result.errors).toBe(1);

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error:'));

    // Verify no V3 commit was created
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(0);
  });

  it('should exclude external parent references from V3 parents', async () => {
    const project = await insertProject(db, testData.project());

    const facetSnapshot = [
      {
        facet: 'segment',
        key: 's-1',
        text: 'Test',
        value: 'Test',
        start_char: 0,
        end_char: 4,
        turn_hash: 'sha256:t1',
      },
    ];

    // Insert V2 commit that references an external parent (not in migration set)
    await db.insert(commitsV2Table).values({
      commitHash: 'sha256:with_external_parent',
      projectId: project.projectId,
      branch: 'main',
      message: null,
      parentsJson: JSON.stringify(['sha256:external_not_migrated']),
      turnWindowJson: '{}',
      facetSnapshotJson: JSON.stringify(facetSnapshot),
      mustHaveJson: null,
      mustntHaveJson: null,
      createdAt: new Date(),
    });

    const result = await migrate(db, { dryRun: false });

    expect(result.migrated).toBe(1);

    // Verify warning was logged about missing parent mapping
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Missing parent mappings'));

    // Verify V3 commit has empty parents (external reference excluded)
    const v3Commits = await db.select().from(commitsV3Table);
    expect(v3Commits).toHaveLength(1);
    expect(v3Commits[0].parents).toEqual([]);
  });
});
