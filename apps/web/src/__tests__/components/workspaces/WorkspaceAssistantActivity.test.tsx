// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceAssistantActivity } from '@/components/workspaces/WorkspaceAssistantActivity';

describe('WorkspaceAssistantActivity', () => {
  it('shows actual published paths and reveals only their related YOps', () => {
    render(
      <WorkspaceAssistantActivity
        activity={{
          turnId: 'turn-1',
          phase: 'complete',
          operations: [
            {
              id: 'operation-1',
              name: 'requestProposal',
              status: 'completed',
              transitionId: 'transition-1',
            },
          ],
        }}
        publication={{
          turnId: 'turn-1',
          kind: 'published',
          action: {
            actionId: 'action-1',
            sequence: 1,
            channel: 'assistant',
            actor: { kind: 'service', id: 'proposal-generator' },
            publishedAt: '2026-09-24T00:00:00.000Z',
            beforeRevision: 1,
            afterRevision: 2,
            operations: [
              { set: { path: 'prd/rollout/allocation', value: 15 } },
              { set: { path: 'prd/requirements/replicas', value: 16 } },
            ],
          },
          cards: [
            { nodeId: 'allocation', path: 'prd/rollout/allocation', before: 10, after: 15 },
            { nodeId: 'replicas', path: 'prd/requirements/replicas', before: 12, after: 16 },
          ],
        }}
      />
    );

    expect(screen.getByText('2 YAML paths changed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('prd/rollout/allocation'));
    const detail = screen.getByText('prd/rollout/allocation').closest('details');
    expect(detail).toHaveTextContent('Before10');
    expect(detail).toHaveTextContent('After15');
    expect(detail).toHaveTextContent('prd/rollout/allocation');
    expect(detail).not.toHaveTextContent('prd/requirements/replicas');
  });
});
