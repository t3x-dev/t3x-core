// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextManifestBar } from '@/components/chat/ContextManifestBar';
import type { ConversationContextManifest, Leaf, Material } from '@/types/api';

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
  source_items: [
    {
      id: 'sha256:abcdef1234567890',
      kind: 'baseline',
      role: 'baseline',
      title: 'Baseline inherited',
      pinned: false,
      pinnable: false,
      included: true,
      readonly: true,
    },
    {
      id: 'leaf_1',
      kind: 'leaf',
      role: 'evidence',
      title: 'Launch leaf',
      pin_id: 'pin_leaf',
      pinned: true,
      pinnable: true,
      included: true,
    },
    {
      id: 'ast_1',
      kind: 'lesson',
      role: 'guidance',
      title: 'Keep the tone precise.',
      parent_source_id: 'leaf_1',
      pin_id: 'pin_leaf',
      pinned: false,
      pinnable: false,
      included: true,
      metadata: {
        selected: true,
        passed: true,
      },
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

const sourceDocumentMaterial = {
  id: 'mat_source_doc',
  project_id: 'proj_1',
  source_type: 'document',
  title: 'Launch notes',
  filename: 'launch-notes.pdf',
  mime_type: 'application/pdf',
  content_hash: 'abc123',
  content_excerpt: 'Private beta starts with five design partners.',
  token_estimate: 12,
  metadata: {},
  created_at: '2026-05-26T00:00:00.000Z',
  archived_at: null,
  created_by: null,
} satisfies Material;

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

  it('opens the sources panel with Materials tab and no retired parent pin action', () => {
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
    expect(screen.getByRole('tab', { name: /materials/i })).not.toBeNull();
    expect(screen.getByRole('tab', { name: /lessons/i })).not.toBeNull();
    expect(screen.queryByRole('tab', { name: /leaves/i })).toBeNull();
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

  it('renders pinned and available source choices in the Materials tab', () => {
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
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    expect(screen.getByRole('heading', { name: 'Materials' })).not.toBeNull();
    expect(screen.getAllByText('Launch leaf').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'References' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /add material follow-up brief/i }));

    expect(onPinLeaf).toHaveBeenCalledWith('leaf_followup');
  });

  it('adds available uploaded materials to the current context', () => {
    const onPinMaterial = vi.fn();
    const onOpenMaterial = vi.fn();
    const onArchiveMaterial = vi.fn();
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
        sourcePicker={{
          availableMaterials: [sourceDocumentMaterial],
          availableMaterialsLoading: false,
          availableMaterialsError: null,
          materialPinningIds: new Set(),
          onPinMaterial,
          onOpenMaterial,
          onArchiveMaterial,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    expect(screen.getByText('Launch notes')).not.toBeNull();
    expect(screen.getByText(/launch-notes\.pdf/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /use material launch notes/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /add material launch notes/i }));

    expect(onPinMaterial).toHaveBeenCalledWith('mat_source_doc');

    fireEvent.click(screen.getByRole('button', { name: /open material launch notes/i }));

    expect(onOpenMaterial).toHaveBeenCalledWith('mat_source_doc');

    fireEvent.click(screen.getByRole('button', { name: /archive material launch notes/i }));

    expect(onArchiveMaterial).toHaveBeenCalledWith('mat_source_doc');
  });

  it('lets users add an uploaded material from the Materials tab', () => {
    const onUploadMaterial = vi.fn();
    render(
      <ContextManifestBar
        manifest={makeManifest()}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
        sourcePicker={{
          onUploadMaterial,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    expect(screen.getByRole('button', { name: /add material/i })).not.toBeNull();

    const file = new File(['source material'], 'source.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/add material file/i), {
      target: { files: [file] },
    });

    expect(onUploadMaterial).toHaveBeenCalledWith(file);
  });

  it('removes currently used materials without showing checkboxes or a preview panel', () => {
    const onReferenceToggle = vi.fn();
    const manifest = makeManifest();
    render(
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
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    expect(screen.getAllByText('Launch leaf').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
    expect(screen.queryByText('source details')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /use material launch leaf/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /include launch leaf/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /remove material launch leaf/i }));

    expect(onReferenceToggle).toHaveBeenCalledWith('pin_leaf', false);
    expect(screen.queryByText(/checkbox = include/i)).toBeNull();
  });

  it('opens a pinned uploaded material from the Materials tab', () => {
    const onOpenMaterial = vi.fn();
    const manifest = makeManifest();
    manifest.references = [
      {
        type: 'import',
        id: 'mat_source_doc',
        pin_id: 'pin_material',
        included: true,
        title: 'Launch notes',
      },
    ];
    manifest.source_items = [
      manifest.source_items[0],
      {
        id: 'mat_source_doc',
        kind: 'import',
        role: 'evidence',
        title: 'Launch notes',
        pin_id: 'pin_material',
        pinned: true,
        pinnable: true,
        included: true,
      },
    ];

    render(
      <ContextManifestBar
        manifest={manifest}
        loading={false}
        error={null}
        onReload={vi.fn()}
        onReferenceToggle={vi.fn()}
        onAssertionToggle={vi.fn()}
        sourcePicker={{
          onOpenMaterial,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));
    fireEvent.click(screen.getByRole('button', { name: /open material launch notes/i }));

    expect(onOpenMaterial).toHaveBeenCalledWith('mat_source_doc');
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
    updatedManifest.source_items[2].included = false;
    updatedManifest.source_items[2].metadata = {
      selected: false,
      passed: true,
    };
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
    manifest.source_items[1].included = false;
    manifest.source_items[2].included = false;
    manifest.source_items[2].metadata = {
      selected: true,
      passed: true,
    };

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

  it('uses source_items as the display contract for included context and materials', () => {
    const manifest = makeManifest();
    manifest.references = [
      {
        type: 'leaf',
        id: 'leaf_legacy',
        pin_id: 'pin_legacy',
        included: false,
        title: 'Legacy reference title',
      },
    ];
    manifest.feedback = [];
    manifest.source_items = [
      {
        id: 'sha256:abcdef1234567890',
        kind: 'baseline',
        role: 'baseline',
        title: 'Baseline inherited',
        pinned: false,
        pinnable: false,
        included: true,
        readonly: true,
      },
      {
        id: 'conv_material',
        kind: 'conversation',
        role: 'evidence',
        title: 'Pinned conversation material',
        pin_id: 'pin_conversation',
        pinned: true,
        pinnable: true,
        included: true,
      },
      {
        id: 'ast_guidance',
        kind: 'lesson',
        role: 'guidance',
        title: 'Guidance from prior result',
        parent_source_id: 'conv_material',
        pin_id: 'pin_conversation',
        pinned: false,
        pinnable: false,
        included: true,
        metadata: {
          selected: true,
          passed: true,
        },
      },
    ];

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

    expect(screen.getByText('1 included')).not.toBeNull();
    expect(screen.getByText('1 lesson')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));

    expect(screen.getByText('Pinned conversation material')).not.toBeNull();
    expect(screen.getByText('Guidance from prior result')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    expect(screen.getByText('Pinned conversation material')).not.toBeNull();
    expect(screen.queryByText('Guidance from prior result')).toBeNull();
    expect(screen.queryByText('Legacy reference title')).toBeNull();
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
