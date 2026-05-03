import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YOpsLogEntry } from '@/infrastructure/trees';

const loadYOpsLogMock = vi.fn();

vi.mock('@/infrastructure/yopsLog', () => ({
  loadYOpsLog: (...args: unknown[]) => loadYOpsLogMock(...args),
}));

import { fetchArchivedYopsLog } from '@/queries/archivedYopsLog';

function row(id: string, supersededAt: string | null): YOpsLogEntry {
  return {
    id,
    conversation_id: 'conv_1',
    project_id: 'proj_1',
    source: 'pipeline' as YOpsLogEntry['source'],
    yops: [],
    created_at: '2026-04-26T00:00:00Z',
    superseded_at: supersededAt,
  } as YOpsLogEntry;
}

describe('fetchArchivedYopsLog', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it('passes activeOnly: false to the underlying loader', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([]);
    await fetchArchivedYopsLog('conv_1');
    expect(loadYOpsLogMock).toHaveBeenCalledWith('conv_1', undefined, { activeOnly: false });
  });

  it('forwards topic filter when provided', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([]);
    await fetchArchivedYopsLog('conv_1', 'topic_42');
    expect(loadYOpsLogMock).toHaveBeenCalledWith('conv_1', 'topic_42', { activeOnly: false });
  });

  it('filters out active rows (superseded_at is null)', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([
      row('yl_active1', null),
      row('yl_archived1', '2026-04-26T01:00:00Z'),
      row('yl_active2', null),
      row('yl_archived2', '2026-04-26T02:00:00Z'),
    ]);
    const result = await fetchArchivedYopsLog('conv_1');
    expect(result.map((r) => r.id)).toEqual(['yl_archived2', 'yl_archived1']);
  });

  it('sorts archived rows by superseded_at descending (newest first)', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([
      row('a', '2026-04-26T01:00:00Z'),
      row('c', '2026-04-26T03:00:00Z'),
      row('b', '2026-04-26T02:00:00Z'),
    ]);
    const result = await fetchArchivedYopsLog('conv_1');
    expect(result.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('returns empty array when no archived rows exist', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([row('yl_active', null)]);
    const result = await fetchArchivedYopsLog('conv_1');
    expect(result).toEqual([]);
  });

  it('treats undefined superseded_at as active (defensive — backend may omit)', async () => {
    loadYOpsLogMock.mockResolvedValueOnce([
      { id: 'yl_no_field', source: 'pipeline', yops: [], created_at: 'x' } as YOpsLogEntry,
    ]);
    const result = await fetchArchivedYopsLog('conv_1');
    expect(result).toEqual([]);
  });
});
