import type { LegacyYOpsEvidence } from '@t3x-dev/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getLegacyYOpsEvidenceMock = vi.fn();

vi.mock('@/infrastructure/sourceEvidence', () => ({
  getLegacyYOpsEvidence: (...args: unknown[]) => getLegacyYOpsEvidenceMock(...args),
}));

import { fetchArchivedYopsLog } from '@/queries/archivedYopsLog';

function evidenceRow(id: string, supersededAt: string | null) {
  return {
    id,
    conversation_id: 'conv_1',
    project_id: 'proj_1',
    source: 'pipeline',
    turn_hash: null,
    topic_id: null,
    yops: [],
    metadata: null,
    created_at: '2026-04-26T00:00:00Z',
    lifecycle: {
      status: supersededAt === null ? ('legacy_uncommitted' as const) : ('superseded' as const),
      superseded_at: supersededAt,
      committed_by: [],
    },
  };
}

function evidence(items: LegacyYOpsEvidence['items']): LegacyYOpsEvidence {
  return {
    mode: 'historical_evidence',
    authoritative_for_project_state: false,
    items,
    page: { total: items.length, limit: 200, offset: 0 },
  };
}

describe('fetchArchivedYopsLog', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it('uses the project-scoped historical-evidence boundary', async () => {
    getLegacyYOpsEvidenceMock.mockResolvedValueOnce(evidence([]));
    await fetchArchivedYopsLog('proj_1', 'conv_1');
    expect(getLegacyYOpsEvidenceMock).toHaveBeenCalledWith('proj_1', 'conv_1', {
      topicId: undefined,
      archivedOnly: true,
      order: 'desc',
      limit: 200,
    });
  });

  it('forwards the topic filter', async () => {
    getLegacyYOpsEvidenceMock.mockResolvedValueOnce(evidence([]));
    await fetchArchivedYopsLog('proj_1', 'conv_1', 'topic_42');
    expect(getLegacyYOpsEvidenceMock).toHaveBeenCalledWith('proj_1', 'conv_1', {
      topicId: 'topic_42',
      archivedOnly: true,
      order: 'desc',
      limit: 200,
    });
  });

  it('maps preserved evidence rows without restoring mutation authority', async () => {
    getLegacyYOpsEvidenceMock.mockResolvedValueOnce(
      evidence([
        evidenceRow('yl_archived2', '2026-04-26T02:00:00Z'),
        evidenceRow('yl_archived1', '2026-04-26T01:00:00Z'),
      ])
    );
    const result = await fetchArchivedYopsLog('proj_1', 'conv_1');
    expect(result.map((row) => row.id)).toEqual(['yl_archived2', 'yl_archived1']);
    expect(result[0]).toMatchObject({
      project_id: 'proj_1',
      conversation_id: 'conv_1',
      superseded_at: '2026-04-26T02:00:00Z',
    });
  });

  it('defensively omits non-archived rows from a malformed page', async () => {
    getLegacyYOpsEvidenceMock.mockResolvedValueOnce(
      evidence([evidenceRow('yl_active', null), evidenceRow('yl_archived', '2026-04-26T01:00:00Z')])
    );
    const result = await fetchArchivedYopsLog('proj_1', 'conv_1');
    expect(result.map((row) => row.id)).toEqual(['yl_archived']);
  });
});
