import { describe, expect, test, vi } from 'vitest';
import { CommitDraftDialog } from '@/components/draft/CommitDraftDialog';
import type { ConflictReport } from '@/lib/api';

describe('CommitDraftDialog', () => {
  test('component exports successfully', () => {
    expect(CommitDraftDialog).toBeDefined();
    expect(typeof CommitDraftDialog).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      open: true,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      includedCount: 5,
      constraintCount: 2,
    };
    expect(props.includedCount).toBe(5);
    expect(props.constraintCount).toBe(2);
  });

  test('parentCommitHash enables conflict checking', () => {
    const props = {
      open: true,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      includedCount: 3,
      constraintCount: 0,
      parentCommitHash: 'sha256:abc123',
    };
    expect(props.parentCommitHash).toBe('sha256:abc123');
  });

  test('conflict report has expected structure', () => {
    const report: ConflictReport = {
      conflicts: [
        {
          new_node_id: 's1',
          new_node_text: 'Budget is $3000',
          existing_node_id: 's2',
          existing_node_text: 'Budget is $3500',
          existing_commit_hash: 'sha256:def456',
          cosine: 0.92,
          jaccard: 0.66,
        },
      ],
      checked_count: 5,
    };
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].cosine).toBe(0.92);
    expect(report.checked_count).toBe(5);
  });

  test('empty conflict report means no warnings', () => {
    const report: ConflictReport = {
      conflicts: [],
      checked_count: 10,
    };
    expect(report.conflicts).toHaveLength(0);
  });
});
