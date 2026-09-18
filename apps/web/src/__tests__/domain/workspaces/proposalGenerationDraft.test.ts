import { describe, expect, it } from 'vitest';
import {
  composeConversationTranscript,
  yopsDraftFromProposalGeneration,
} from '@/domain/workspaces/proposalGenerationDraft';
import type { WorkspaceProposalGenerationView } from '@/types/workspaces';

describe('proposalGenerationDraft', () => {
  it('joins chat turns so Proposal generation can read the Compose conversation', () => {
    expect(
      composeConversationTranscript(
        [
          { role: 'user', content: 'Raise allocation to 25%.' },
          { role: 'assistant', content: 'That is on page 3.' },
        ],
        'Also assign Maya.'
      )
    ).toBe('You: Raise allocation to 25%.\n\nAssistant: That is on page 3.\n\nYou: Also assign Maya.');
  });

  it('turns generation groups into workspace draft cards', () => {
    const view = {
      generation: {
        groups: [
          {
            id: 'allocation',
            origin: 'source_backed',
            operationIndexes: [0],
            operations: [{ set: { path: '/rollout/allocation', value: 25 } }],
            paths: ['rollout/allocation'],
            values: [
              {
                path: 'rollout/allocation',
                before: { availability: 'available', value: 10 },
                after: { availability: 'available', value: 25 },
                changed: true,
              },
            ],
            evidence: [],
            basis: [],
            assumptions: [],
            reason: 'The release plan specifies 25%.',
            challenges: [],
          },
        ],
      },
    } as Pick<WorkspaceProposalGenerationView, 'generation'>;

    expect(yopsDraftFromProposalGeneration(view)).toEqual([
      {
        id: 'op_allocation_0',
        op: 'set',
        path: 'rollout/allocation',
        summary: 'The release plan specifies 25%.',
        beforeValue: 10,
        afterValue: 25,
        reason: 'The release plan specifies 25%.',
      },
    ]);
  });
});
