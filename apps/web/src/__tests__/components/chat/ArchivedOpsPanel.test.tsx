// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YOpsLogEntry } from '@/infrastructure/trees';

const fetchArchivedYopsLogMock = vi.fn();

vi.mock('@/queries/archivedYopsLog', async () => {
  const actual = await vi.importActual<typeof import('@/queries/archivedYopsLog')>(
    '@/queries/archivedYopsLog'
  );
  return {
    ...actual,
    fetchArchivedYopsLog: (...args: unknown[]) => fetchArchivedYopsLogMock(...args),
  };
});

import { ArchivedOpsPanel } from '@/components/chat/ArchivedOpsPanel';

function archivedRow(id: string, supersededAt: string, opCount = 1): YOpsLogEntry {
  return {
    id,
    conversation_id: 'conv_1',
    project_id: 'proj_1',
    source: 'pipeline' as YOpsLogEntry['source'],
    yops: Array.from({ length: opCount }, () => ({})),
    created_at: '2026-04-26T00:00:00Z',
    superseded_at: supersededAt,
  } as YOpsLogEntry;
}

describe('ArchivedOpsPanel', () => {
  beforeEach(() => fetchArchivedYopsLogMock.mockReset());
  afterEach(() => fetchArchivedYopsLogMock.mockReset());

  it('renders an empty state when no conversation is active', () => {
    const { container } = render(<ArchivedOpsPanel conversationId={null} />);
    // Idle status — no fetch issued, no error, no rows.
    expect(fetchArchivedYopsLogMock).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-testid^="archived-op-"]').length).toBe(0);
  });

  it('shows a loading state while the fetch is in flight, then renders rows', async () => {
    fetchArchivedYopsLogMock.mockResolvedValueOnce([
      archivedRow('yl_a', '2026-04-26T01:00:00Z', 3),
      archivedRow('yl_b', '2026-04-26T02:00:00Z', 1),
    ]);

    const { container } = render(<ArchivedOpsPanel conversationId="conv_1" />);
    expect(container.textContent).toContain('loading');

    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid^="archived-op-"]').length).toBe(2);
    });

    const text = container.textContent ?? '';
    expect(text).toContain('2 entries');
    expect(text).toContain('yl_a');
    expect(text).toContain('yl_b');
    expect(text).toContain('3 ops');
    expect(text).toContain('1 op');
  });

  it('renders an empty-but-loaded state when the conversation has no archived rows', async () => {
    fetchArchivedYopsLogMock.mockResolvedValueOnce([]);
    const { container } = render(<ArchivedOpsPanel conversationId="conv_1" />);
    await waitFor(() => {
      expect(container.textContent).toContain('No archived ops');
    });
  });

  it('surfaces a failure message when the fetch rejects', async () => {
    fetchArchivedYopsLogMock.mockRejectedValueOnce(new Error('network blip'));
    const { container } = render(<ArchivedOpsPanel conversationId="conv_1" />);
    await waitFor(() => {
      expect(container.textContent).toContain('Couldn');
      expect(container.textContent).toContain('network blip');
    });
  });

  it('passes the topicId filter through to the query', async () => {
    fetchArchivedYopsLogMock.mockResolvedValueOnce([]);
    render(<ArchivedOpsPanel conversationId="conv_1" topicId="topic_42" />);
    await waitFor(() => {
      expect(fetchArchivedYopsLogMock).toHaveBeenCalledWith('conv_1', 'topic_42');
    });
  });
});
