// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextManifestBar } from '@/components/chat/ContextManifestBar';
import type { ConversationContextManifest, Leaf } from '@/types/api';

vi.mock('@/components/commit/CommitYAMLDocument', () => ({
  CommitYAMLDocument: ({ content }: { content: { trees: { key: string }[] } }) => (
    <div data-testid="baseline-yaml">{content.trees.map((tree) => tree.key).join(', ')}</div>
  ),
}));

const makeManifest = (): ConversationContextManifest => ({
  conversation_id: 'conv_1',
  project_id: 'proj_1',
  baseline: {
    commit_hash: 'sha256:abcdef1234567890',
    branch: 'main',
    message: 'Parent commit',
    source: 'parent_commit',
    source_conversation_id: null,
    node_count: 2,
    relation_count: 1,
    content: {
      trees: [{ key: 'goal', slots: { summary: 'Ship the manifest bar' }, children: [] }],
      relations: [],
    },
  },
  references: [
    {
      type: 'leaf',
      id: 'leaf_1',
      pin_id: 'pin_leaf',
      included: true,
      title: 'Launch leaf',
    },
  ],
  feedback: [
    {
      type: 'leaf_assertion',
      id: 'ast_1',
      parent_ref_id: 'leaf_1',
      pin_id: 'pin_leaf',
      selected: true,
      included: true,
      passed: true,
      lesson: 'Keep the tone precise.',
    },
    {
      type: 'leaf_assertion',
      id: 'ast_2',
      parent_ref_id: 'leaf_1',
      pin_id: 'pin_leaf',
      selected: false,
      included: false,
      passed: false,
      lesson: 'Avoid vague claims.',
    },
  ],
  token_estimate: 128,
  sources: [{ type: 'commit', id: 'sha256:abcdef1234567890', title: 'Parent commit' }],
  chat_context_text: 'chat context',
  extraction_context_text: 'feedback context',
});

const followUpLeaf = {
  id: 'leaf_followup',
  commit_hash: 'sha256:commit2',
  type: 'article',
  title: 'Follow-up brief',
  constraints: [],
  config: {},
  output: null,
  generated_at: null,
  assertions: null,
  runner_assertions: null,
  project_id: 'proj_1',
  created_at: '2026-05-01T00:00:00.000Z',
  created_by: null,
} satisfies Leaf;

describe('ContextManifestBar', () => {
  it('renders the collapsed sources summary', () => {
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Sources')).not.toBeNull();
    expect(screen.getByText('Baseline abcdef12')).not.toBeNull();
    expect(screen.getByText('1 included')).not.toBeNull();
    expect(screen.getByText('1 lesson')).not.toBeNull();
    expect(screen.getByText('128 tokens')).not.toBeNull();
  });

  it('opens the sources panel with MVP tabs and no retired parent pin action', () => {
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));

    expect(screen.getByRole('region', { name: /sources/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /included/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /baseline/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /leaves/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /lessons/i })).not.toBeNull();
    expect(screen.queryByText('Context Manifest')).toBeNull();
    expect(screen.queryByText('Pin parent')).toBeNull();
  });

  it('shows baseline YAML with commit and source conversation links', () => {
    const manifest = makeManifest();
    manifest.baseline.source_conversation_id = 'conv_parent';

    render(
      <ContextManifestBar
        manifest={manifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
        sourcePicker={{
          baseline: {
            commitHash: 'sha256:abcdef1234567890',
            branch: 'main',
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /baseline/i }));

    expect(screen.getByTestId('baseline-yaml').textContent).toContain('goal');
    expect(screen.getByRole('link', { name: /view commit/i }).getAttribute('href')).toBe(
      '/project/proj_1/commit/sha256%3Aabcdef1234567890'
    );
    expect(
      screen.getByRole('link', { name: /view source conversation/i }).getAttribute('href')
    ).toBe('/chat/conv_parent');
  });

  it('marks the baseline source conversation unavailable when lineage is missing', () => {
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /baseline/i }));

    expect(screen.getByText('No source conversation')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /view source conversation/i })).toBeNull();
  });

  it('renders leaf source choices in the Leaves tab', () => {
    const onPinLeaf = vi.fn();
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
        sourcePicker={{
          availableLeaves: [followUpLeaf],
          availableLeavesLoading: false,
          availableLeavesError: null,
          leafPinningIds: new Set(),
          onPinLeaf,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /leaves/i }));

    expect(screen.getByRole('heading', { name: 'Leaves' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'References' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /pin and include leaf follow-up brief/i }));

    expect(onPinLeaf).toHaveBeenCalledWith('leaf_followup');
  });

  it('toggles reference inclusion from the opened panel', () => {
    const onReferenceToggle = vi.fn();
    const manifest = makeManifest();
    const { rerender } = render(
      <ContextManifestBar
        manifest={manifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={onReferenceToggle}
        onAssertionToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /leaves/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /include launch leaf/i }));

    expect(onReferenceToggle).toHaveBeenCalledWith('pin_leaf', false);

    const excludedManifest = makeManifest();
    excludedManifest.references[0].included = false;
    rerender(
      <ContextManifestBar
        manifest={excludedManifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={onReferenceToggle}
        onAssertionToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /leaves/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /include launch leaf/i }));

    expect(onReferenceToggle).toHaveBeenLastCalledWith('pin_leaf', true);
  });

  it('toggles lesson inclusion from the Lessons tab', () => {
    const onAssertionToggle = vi.fn();
    const manifest = makeManifest();
    const { rerender } = render(
      <ContextManifestBar
        manifest={manifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={onAssertionToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /lessons/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /include lesson keep the tone/i }));

    expect(onAssertionToggle).toHaveBeenCalledWith('pin_leaf', 'ast_1', false);

    const updatedManifest = makeManifest();
    updatedManifest.feedback[0].selected = false;
    updatedManifest.feedback[0].included = false;
    rerender(
      <ContextManifestBar
        manifest={updatedManifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={onAssertionToggle}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /lessons/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /include lesson keep the tone/i }));

    expect(onAssertionToggle).toHaveBeenLastCalledWith('pin_leaf', 'ast_1', true);
  });

  it('keeps lesson checkboxes tied to selection, not effective inclusion', () => {
    const manifest = makeManifest();
    manifest.references[0].included = false;
    manifest.feedback[0].selected = true;
    manifest.feedback[0].included = false;

    render(
      <ContextManifestBar
        manifest={manifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /lessons/i }));

    expect(
      (
        screen.getByRole('checkbox', {
          name: /include lesson keep the tone/i,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it('renders a stable loading summary state', () => {
    render(
      <ContextManifestBar
        manifest={null}
        loading
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Loading sources')).not.toBeNull();
  });

  it('renders an error summary state', () => {
    render(
      <ContextManifestBar
        manifest={null}
        loading={false}
        error={new Error('Context unavailable')}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Context unavailable')).not.toBeNull();
  });
});
