// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationSourceEvidencePage } from '@/components/sources/ConversationSourceEvidencePage';
import type { ConversationSourceEvidence } from '@/types/sourceEvidence';

const readerMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/sources/useSourceEvidenceReader', () => ({
  useSourceEvidenceReader: () => readerMock,
}));

const baseEvidence: ConversationSourceEvidence = {
  availability: { mode: 'available', reasons: [] },
  source: {
    type: 'conversation',
    id: 'conv_1',
    project_id: 'proj_1',
    title: 'Release review',
    alias: null,
    parent_commit_hash: null,
    committed_as: null,
    committed_at: null,
    created_at: '2026-08-01T08:00:00.000Z',
    metadata: null,
    provider: 'openai',
    model: 'gpt-5',
  },
  turns: {
    items: [
      {
        turn_hash: 'sha256:turn-1',
        parent_turn_hash: null,
        role: 'user',
        content: 'Raise the rollout to 20%.',
        language: 'en',
        rings: null,
        content_blocks: null,
        created_at: '2026-08-01T08:01:00.000Z',
      },
    ],
    total: 1,
    limit: 100,
    offset: 0,
    completeness: 'complete',
  },
  revisions: [],
  evidence_selection: { mode: 'immutable_refs', turn_hashes: [] },
  referring_commits: [],
};

describe('ConversationSourceEvidencePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readerMock.mockReset().mockResolvedValue(baseEvidence);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders an available immutable source without exposing the Chat workbench', async () => {
    render(
      <ConversationSourceEvidencePage
        projectId="proj_1"
        conversationId="conv_1"
        branch="main"
        commitId="sha256:commit-1"
        turnHash="sha256:turn-1"
      />
    );

    expect(await screen.findByRole('heading', { name: 'Release review' })).toBeInTheDocument();
    expect(screen.getByText('Source is available')).toBeInTheDocument();
    expect(screen.getByText('Raise the rollout to 20%.')).toBeInTheDocument();
    expect(screen.getByText('Referenced turn')).toBeInTheDocument();
    expect(screen.getByText('0 immutable turns referenced')).toBeInTheDocument();
    expect(screen.queryByText('Send message')).not.toBeInTheDocument();
  });

  it('renders CommitV2 evidence references explicitly', async () => {
    readerMock.mockResolvedValue({
      ...baseEvidence,
      evidence_selection: { mode: 'immutable_refs', turn_hashes: ['sha256:turn-1'] },
      referring_commits: [
        {
          commit_digest: 'sha256:historical',
          intent: 'Historical policy change',
          recorded_at: '2026-07-01T00:00:00.000Z',
          evidence_refs: [
            {
              resource: {
                uri: 't3x://projects/proj_1/conversations/conv_1/turns/sha256%3Aturn-1',
                mediaType: 'text/plain;charset=utf-8',
                digest: 'sha256:evidence',
              },
              locator: { scheme: 't3x.text-quote/v1', value: { quote: 'Raise rollout' } },
            },
          ],
        },
      ],
    });

    render(<ConversationSourceEvidencePage projectId="proj_1" conversationId="conv_1" />);

    expect(await screen.findByText('Source is available')).toBeInTheDocument();
    expect(screen.getByText('Historical policy change')).toBeInTheDocument();
    expect(screen.getByText('1 immutable turn referenced')).toBeInTheDocument();
  });

  it('keeps a missing source visibly unavailable while retaining commit references', async () => {
    readerMock.mockResolvedValue({
      ...baseEvidence,
      availability: { mode: 'unavailable', reasons: ['SOURCE_RECORD_MISSING'] },
      source: null,
      turns: { ...baseEvidence.turns, items: [], total: 0 },
      referring_commits: [
        {
          commit_digest: 'sha256:still-recorded',
          intent: 'Recorded reference',
          recorded_at: '2026-06-01T00:00:00.000Z',
          evidence_refs: [],
        },
      ],
    });

    render(<ConversationSourceEvidencePage projectId="proj_1" conversationId="conv_missing" />);

    expect(await screen.findByText('Source is unavailable')).toBeInTheDocument();
    expect(screen.getByText('No turns are available.')).toBeInTheDocument();
    expect(screen.getByText('Recorded reference')).toBeInTheDocument();
  });

  it('loads the next immutable page and clears the partial state only when complete', async () => {
    readerMock
      .mockResolvedValueOnce({
        ...baseEvidence,
        availability: { mode: 'partial', reasons: ['TURN_PAGE_INCOMPLETE'] },
        turns: { ...baseEvidence.turns, total: 2, completeness: 'partial' },
      })
      .mockResolvedValueOnce({
        ...baseEvidence,
        turns: {
          ...baseEvidence.turns,
          items: [
            {
              ...baseEvidence.turns.items[0],
              turn_hash: 'sha256:turn-2',
              role: 'assistant',
              content: 'The rollout is now 20%.',
            },
          ],
          total: 2,
          offset: 1,
          completeness: 'partial',
        },
      });

    render(<ConversationSourceEvidencePage projectId="proj_1" conversationId="conv_1" />);

    expect(await screen.findByText('Source is partially loaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more turns' }));

    expect(await screen.findByText('The rollout is now 20%.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Source is available')).toBeInTheDocument());
    expect(screen.queryByText('Partial history')).not.toBeInTheDocument();
  });

  it('shows access failures instead of rendering an empty successful state', async () => {
    readerMock.mockReset().mockRejectedValue(new Error('Forbidden'));

    render(<ConversationSourceEvidencePage projectId="proj_private" conversationId="conv_1" />);

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    expect(screen.queryByText('Source is available')).not.toBeInTheDocument();
  });
});
