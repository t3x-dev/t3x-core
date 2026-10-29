// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceCurrentDraft } from '@/components/workspaces/WorkspaceCurrentDraft';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';

const mocks = vi.hoisted(() => ({
  schema: {
    definition: undefined as Record<string, unknown> | undefined,
    hasCandidate: false,
    loading: false,
    error: undefined as string | undefined,
  },
  pending: { data: { status: 'none', pending: null } },
}));
vi.mock('@/hooks/schemas/useWorkspaceDraftSchema', () => ({
  useWorkspaceDraftSchema: () => mocks.schema,
}));
vi.mock('@/hooks/schemas/useWorkspaceSchemaPending', () => ({
  useWorkspaceSchemaPending: () => mocks.pending,
}));

describe('Workspace current Draft sidebar', () => {
  beforeEach(() => {
    mocks.schema = {
      definition: {
        nodes: { product: { required: true, slots: { title: { type: 'string', minLength: 1 } } } },
      },
      hasCandidate: false,
      loading: false,
      error: undefined,
    };
  });
  it('shows current content and bound definition as read-only trees without a redundant outer collapse', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const current = {
      domain: 't3x.dev/semantic-content',
      content: {
        trees: [
          {
            key: 'product',
            slots: { title: 'Current title', enabled: false, count: 0 },
            children: [{ key: 'notes', slots: { text: 'Details' }, children: [] }],
          },
        ],
        relations: [],
      },
    };
    render(<WorkspaceCurrentDraft candidate={candidate} current={current} revision={4} enabled />);
    const panel = screen.getByRole('region', { name: 'Current Draft' });
    expect(within(panel).getByText('r4')).toBeVisible();
    expect(within(panel).getByText('Current title')).toBeVisible();
    expect(within(panel).getByText('false')).toBeVisible();
    expect(within(panel).getByText('0')).toBeVisible();
    expect(within(panel).queryByText('Details')).not.toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Content content/trees/[key=product]/children/[key=notes]',
      })
    );
    expect(within(panel).getByText('Details')).toBeVisible();
    fireEvent.click(within(panel).getByRole('button', { name: 'Node product' }));
    expect(within(panel).getByText('minLength: 1')).toBeVisible();
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: /save|apply|adopt/i })
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Toggle current Draft' })
    ).not.toBeInTheDocument();
    expect(within(panel).getByText('Current title')).toBeVisible();
  });
  it('marks local staging and unadopted candidates without mixing them with the bound tree', () => {
    mocks.schema.hasCandidate = true;
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const { rerender } = render(
      <WorkspaceCurrentDraft
        candidate={candidate}
        current={{ title: 'Draft title' }}
        revision={1}
        enabled
        stagedCount={2}
      />
    );
    expect(screen.getByText(/2 ungrouped local changes/)).toBeVisible();
    expect(screen.getByText(/Schema candidate available in Studio/)).toBeVisible();
    rerender(
      <WorkspaceCurrentDraft
        candidate={candidate}
        current={{ title: 'Updated title' }}
        revision={2}
        enabled
      />
    );
    expect(screen.getByText('Updated title')).toBeVisible();
    expect(screen.queryByText('Draft title')).not.toBeInTheDocument();
    expect(screen.queryByText(/ungrouped local changes/)).not.toBeInTheDocument();
  });
  it('distinguishes empty content, unavailable content and an unbound Schema', () => {
    mocks.schema.definition = undefined;
    const candidate = { ...getProjectWorkspaceStarterCandidate('proj_1'), schemaBindings: [] };
    const { rerender } = render(
      <WorkspaceCurrentDraft candidate={candidate} current={undefined} enabled={false} />
    );
    expect(screen.getByText(/Enable Draft activity in Chat/)).toBeVisible();
    expect(screen.getByText('No Schema bound.')).toBeVisible();
    rerender(<WorkspaceCurrentDraft candidate={candidate} current={{}} enabled />);
    expect(screen.getByText('No content yet.')).toBeVisible();
    rerender(<WorkspaceCurrentDraft candidate={candidate} current={undefined} enabled loading />);
    expect(screen.getByText('Loading current Draft…')).toBeVisible();
  });
});
