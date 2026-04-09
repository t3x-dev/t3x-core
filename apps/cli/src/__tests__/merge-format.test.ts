import { describe, expect, it } from 'vitest';
import { formatPrepareResult, formatMergeCommitResult } from '../lib/merge-format.js';

describe('formatPrepareResult', () => {
  it('shows conflict summary with counts', () => {
    const output = formatPrepareResult({
      mergeId: 'md_123',
      autoKept: 10,
      onlyInSource: 2,
      onlyInTarget: 1,
      conflicts: [
        { path: 'travel.destination', sourceValue: 'Tokyo', targetValue: 'Kyoto' },
        { path: 'travel.budget', sourceValue: '1000', targetValue: '800' },
      ],
      projectId: 'proj_1',
      webUrl: 'http://localhost:3000',
    });

    expect(output).toContain('md_123');
    expect(output).toContain('Auto-kept');
    expect(output).toContain('10');
    expect(output).toContain('Conflicts');
    expect(output).toContain('2');
    expect(output).toContain('travel.destination');
    expect(output).toContain('Tokyo');
    expect(output).toContain('Kyoto');
    expect(output).toContain('localhost:3000');
  });

  it('shows clean merge when zero conflicts', () => {
    const output = formatPrepareResult({
      mergeId: 'md_456',
      autoKept: 5,
      onlyInSource: 1,
      onlyInTarget: 0,
      conflicts: [],
      projectId: 'proj_1',
      webUrl: 'http://localhost:3000',
    });

    expect(output).toContain('0');
    expect(output).not.toContain('Resolve conflicts');
  });
});

describe('formatMergeCommitResult', () => {
  it('shows commit hash and merge summary', () => {
    const output = formatMergeCommitResult({
      hash: 'sha256:abc123def456',
      parents: ['sha_src', 'sha_tgt'],
      branch: 'main',
      mergeSummary: {
        kept_identical: 10,
        resolved_conflicts: 3,
        kept_from_source: 2,
        kept_from_target: 1,
        discarded: 0,
        total_nodes: 16,
      },
    });

    expect(output).toContain('abc123def456');
    expect(output).toContain('main');
    expect(output).toContain('10');
    expect(output).toContain('3');
  });
});
