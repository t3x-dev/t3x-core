import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import type { WorkspaceCandidate } from '@/types/workspaces';

function content(slots: Record<string, unknown>): SemanticContent {
  return {
    relations: [],
    trees: [
      {
        children: [],
        key: 'prd',
        slots,
      },
    ],
  } as SemanticContent;
}

describe('buildStructuredStateDiff', () => {
  it('derives added, modified, and removed fields from parent and HEAD', () => {
    const changes = buildStructuredStateDiff({
      baseline: content({ audience: 'Travelers', obsolete: 'Remove me' }),
      head: content({ audience: 'Recreational travelers', outcome: 'Plan safely' }),
    });

    expect(changes).toMatchObject([
      {
        afterValue: 'Recreational travelers',
        beforeValue: 'Travelers',
        kind: 'modified',
        path: 'prd/audience',
        summary: 'Updated target audience',
      },
      {
        afterValue: 'No value recorded',
        beforeValue: 'Remove me',
        kind: 'removed',
        path: 'prd/obsolete',
      },
      {
        afterValue: 'Plan safely',
        beforeValue: 'No value recorded',
        kind: 'added',
        path: 'prd/outcome',
        summary: 'Added desired outcome',
      },
    ]);
  });

  it('shows appended list items and enriches them with committed workspace provenance', () => {
    const workspace = {
      id: 'workspace_1',
      lastCommitHash: 'sha256:head',
      sourceBundle: [
        {
          id: 'source_chat',
          previewTurns: [
            {
              author: 'User',
              content: 'I want to follow all local fishing rules.',
              id: 'turn_1',
              role: 'user',
            },
          ],
          title: 'PRD source chat',
          type: 'chat',
        },
      ],
      yopsDraft: {
        id: 'draft_1',
        operations: [
          {
            afterValue: 'Check permits and local restrictions',
            id: 'op_1',
            op: 'append',
            path: 'prd/acceptance/-',
            reason: 'Ensures the trip plan accounts for local legal requirements.',
            sourceRefs: ['source_chat'],
            summary: 'Add legal acceptance criterion',
          },
        ],
      },
    } as WorkspaceCandidate;

    const [change] = buildStructuredStateDiff({
      baseline: content({ acceptance: ['Check seasons'] }),
      head: content({
        acceptance: ['Check seasons', 'Check permits and local restrictions'],
      }),
      workspace,
    });

    expect(change).toMatchObject({
      afterValue: 'Check permits and local restrictions',
      beforeValue: 'No value recorded',
      evidence: 'I want to follow all local fishing rules.',
      evidenceSource: 'PRD source chat',
      kind: 'added',
      op: 'APPEND',
      path: 'prd/acceptance/-',
      reason: 'Ensures the trip plan accounts for local legal requirements.',
      summary: 'Added acceptance criterion',
    });
  });
});
