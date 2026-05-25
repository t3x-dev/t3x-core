// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextManifestBar } from '@/components/chat/ContextManifestBar';
import type { ConversationContextManifest } from '@/types/api';

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

describe('ContextManifestBar', () => {
  it('renders the collapsed baseline and feedback summary', () => {
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

    expect(screen.getByText('abcdef12')).not.toBeNull();
    expect(screen.getByText('main')).not.toBeNull();
    expect(screen.getByText('2 nodes')).not.toBeNull();
    expect(screen.getByText('1 rel')).not.toBeNull();
    expect(screen.getByText('1 feedback')).not.toBeNull();
  });

  it('opens the panel and shows baseline YAML plus feedback lessons', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /open context manifest/i }));

    expect(screen.getByText('Baseline YAML')).not.toBeNull();
    expect(screen.getByTestId('baseline-yaml').textContent).toContain('goal');
    expect(screen.getByText('Keep the tone precise.')).not.toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: /open context manifest/i }));
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

    fireEvent.click(screen.getByRole('checkbox', { name: /include launch leaf/i }));

    expect(onReferenceToggle).toHaveBeenLastCalledWith('pin_leaf', true);
  });

  it('toggles feedback assertion inclusion from the opened panel', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /open context manifest/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /include feedback keep the tone/i }));

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

    fireEvent.click(screen.getByRole('checkbox', { name: /include feedback keep the tone/i }));

    expect(onAssertionToggle).toHaveBeenLastCalledWith('pin_leaf', 'ast_1', true);
  });

  it('keeps feedback checkboxes tied to selection, not effective inclusion', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /open context manifest/i }));

    expect(
      (
        screen.getByRole('checkbox', {
          name: /include feedback keep the tone/i,
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

    expect(screen.getByText('Loading context')).not.toBeNull();
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
