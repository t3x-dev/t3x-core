// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioSchemaEditCandidate } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { dump, load } from 'js-yaml';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaStudioExperience } from '@/components/schemas/SchemaStudioExperience';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  ensureAuthoring: vi.fn(),
  livePreview: vi.fn(),
  contentPreview: vi.fn(),
  prepareContent: vi.fn(),
  fullReview: vi.fn(),
  draftView: undefined as unknown,
  publish: vi.fn(),
  data: undefined as unknown,
  previewResult: undefined as ((input: unknown) => unknown) | undefined,
  pendingSchema: { status: 'none', pending: null } as unknown,
  query: 'candidate=provider',
  candidatesLoading: false,
  branches: [] as string[],
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  saveDraft: vi.fn(),
  saveSchemaEdit: vi.fn(),
  schemaEditCandidate: null as null | {
    candidateId: string;
    revision: number;
    localContribution: Record<string, unknown>;
    origin: { channel: string };
    baseSources?: StudioSchemaEditCandidate['baseSources'];
    baseDefinition?: StudioSchemaEditCandidate['baseDefinition'];
    authoringDraft?: StudioSchemaEditCandidate['authoringDraft'];
  },
  previewInputs: [] as unknown[],
  workspaces: [] as Array<{
    id: string;
    revision?: number;
    status: string;
    targetBranch: string;
    title: string;
    schemaBindings?: WorkspaceSchemaBinding[];
  }>,
}));
vi.mock('@/hooks/schemas/useSchemaDraftStatus', () => ({
  useSchemaDraftStatus: () => mocks.draftView,
}));
vi.mock('@/hooks/schemas/useSchemaReviewFlow', () => ({
  useSchemaReviewFlow: () => ({
    readEdit: async () => mocks.schemaEditCandidate,
    ensureAuthoring: mocks.ensureAuthoring,
    preview: mocks.livePreview,
    previewContent: mocks.contentPreview,
    prepareContent: mocks.prepareContent,
    review: mocks.fullReview,
  }),
}));
vi.mock('@/components/workspaces/WorkspaceYOpsEditor', () => ({
  WorkspaceYOpsEditor: ({
    ariaLabel,
    value,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/team/project/schemas',
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/hooks/schemas/useSchemaSourceIdentities', () => ({
  useSchemaSourceIdentities: () => ({}),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({
    items: [
      {
        id: 'provider',
        available: true,
        title: 'Shared foundation',
        kind: 'module',
        source: {
          projectId: null,
          artifactVersionId: 'base-v1',
          canonicalName: 'team/base',
          version: '1.0',
          hash: 'sha256:abc',
        },
      },
    ],
    loading: mocks.candidatesLoading,
  }),
}));
vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({ refresh: mocks.refresh, workspaces: mocks.workspaces }),
}));
vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branchHeads: {},
    branches: mocks.branches,
    loading: false,
    refresh: vi.fn(),
    create: vi.fn(),
  }),
}));
vi.mock('@/queries/workspaces', () => ({
  saveWorkspaceDraft: (...args: unknown[]) => mocks.saveDraft(...args),
}));
vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useApplyStudioSelection: () => mocks.apply,
  useStudioPreview: (_projectId: string, input: unknown) => {
    mocks.previewInputs.push(input);
    const data = mocks.previewResult ? mocks.previewResult(input) : mocks.data;
    return { data, loading: !data, refresh: vi.fn() };
  },
}));
vi.mock('@/hooks/schemas/usePublishStudioSchema', () => ({
  usePublishStudioSchema: () => mocks.publish,
}));
vi.mock('@/hooks/schemas/useStudioSchemaEditCandidate', () => ({
  useStudioSchemaEditCandidate: () => ({
    candidate: mocks.schemaEditCandidate,
    loading: false,
    pending: false,
    save: mocks.saveSchemaEdit,
  }),
}));
vi.mock('@/hooks/schemas/useWorkspaceSchemaPending', () => ({
  useWorkspaceSchemaPending: () => ({
    data: mocks.pendingSchema,
    loading: false,
    refresh: vi.fn(),
  }),
}));
beforeEach(() => {
  mocks.query = 'candidate=provider';
  mocks.draftView = undefined;
  mocks.ensureAuthoring.mockReset().mockResolvedValue(undefined);
  mocks.livePreview.mockReset().mockImplementation(async () => mocks.data);
  mocks.contentPreview.mockReset().mockResolvedValue({ canPrepare: true, previewHash: 'checked' });
  mocks.prepareContent.mockReset().mockResolvedValue({ outcome: 'prepared' });
  mocks.fullReview
    .mockReset()
    .mockResolvedValue('/project/p?tab=workspaces&reviewSnapshot=exact-review');
  mocks.previewResult = undefined;
  mocks.candidatesLoading = false;
  mocks.apply.mockReset();
  mocks.publish.mockReset();
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.refresh.mockReset();
  mocks.saveDraft.mockReset();
  mocks.saveSchemaEdit.mockReset();
  mocks.schemaEditCandidate = null;
  mocks.pendingSchema = { status: 'none', pending: null };
  mocks.previewInputs = [];
  mocks.saveDraft.mockResolvedValue({});
  mocks.saveSchemaEdit.mockImplementation(async (input) => ({
    outcome: 'created',
    workspaceRevision: 2,
    candidate: {
      candidateId: 'schema-edit',
      revision: 1,
      localContribution: input.localContribution,
    },
  }));
  mocks.branches = [];
  mocks.workspaces = [];
  mocks.data = {
    samples: [],
    schema: { yschema: '0.1', name: 'studio:test', strict: false, nodes: {} },
    schemaHash: 'definition-hash',
    reviewHash: 'review',
    renderPlan: [],
    origins: {},
    sources: [],
    modules: [{ candidateId: 'provider', requiredBy: ['team/consumer'] }],
    report: {
      valid: false,
      issues: [
        { code: 'REQUIRED_IMPORT_MISSING', message: 'Missing service capability', blocking: true },
      ],
      layers: [
        {
          id: 'composition',
          label: 'Composition dependencies',
          status: 'failed',
          issues: [
            {
              code: 'REQUIRED_IMPORT_MISSING',
              message: 'Missing service capability',
              blocking: true,
            },
          ],
        },
      ],
    },
    adoption: { allowed: true },
    workspace: { id: 'target', revision: 2, changes: [] },
  };
});
it('keeps the selected branch when Studio links to Browse', () => {
  mocks.query = 'candidate=provider&branch=feature%2Frelease';
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('link', { name: 'Browse source releases' })).toHaveAttribute(
    'href',
    '/explore?view=browse&type=schemas&studioTarget=p&branch=feature%2Frelease'
  );
});
it('synchronizes exact sources and revision when an assistant snapshot replaces the open candidate', async () => {
  mocks.query = 'workspace=saved';
  mocks.workspaces = [
    { id: 'saved', revision: 2, status: 'draft', targetBranch: 'main', title: 'Saved' },
  ];
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  mocks.schemaEditCandidate = {
    candidateId: 'assistant-schema',
    revision: 3,
    localContribution: {},
    origin: { channel: 'assistant' },
    baseSources: [
      {
        projectId: null,
        artifactVersionId: 'base-v1',
        canonicalName: 'team/base',
        version: '1.0',
        hash: 'sha256:abc',
      },
    ],
  };
  rerender(<SchemaStudioExperience projectId="p" />);
  await waitFor(() =>
    expect(mocks.previewInputs).toContainEqual({
      candidateIds: ['provider'],
      workspaceId: 'saved',
      schemaEditCandidate: { candidateId: 'assistant-schema', revision: 3 },
    })
  );
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked();
});
it('does not review another Workspace when the deep-linked target is missing', () => {
  mocks.query = 'candidate=provider&workspace=missing';
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Workspace missing was not found in this project'
  );
  expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled();
  expect(screen.getByRole('link', { name: 'Browse source releases' })).toHaveAttribute(
    'href',
    '/explore?view=browse&type=schemas&studioTarget=p&workspace=missing'
  );
});
it('keeps a required provider checked and locked while blocking a failed definition review', () => {
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  const controls = screen.getByRole('toolbar', { name: 'Studio controls' });
  const composition = screen.getByRole('main', { name: 'Schema editor' });
  const sources = screen.getByRole('complementary', { name: 'Available Schema sources' });
  expect(composition).toContainElement(controls);
  expect(composition).toContainElement(sources);
  expect(composition).toContainElement(screen.getByRole('region', { name: 'Schema definition' }));
  expect(within(sources).getByRole('button', { name: 'Manage sources' })).toBeVisible();
  expect(within(controls).getByRole('button', { name: 'Review Schema changes' })).toBeEnabled();
  expect(screen.getByLabelText('Target Workspace')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove Shared foundation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled();
  closeSources();
  fireEvent.click(screen.getByRole('button', { name: 'Review Schema changes' }));
  expect(screen.getByRole('region', { name: 'Schema checks' })).toBeVisible();
  expect(screen.getByText('Missing service capability')).toBeVisible();
  expect(screen.getByText('Composition dependencies')).toBeVisible();
  expect(screen.getByText('Failed')).toBeVisible();
  expect(screen.getByText('Changes require attention')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  openSources();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it.each([
  '',
  'workspace=workspace_branch%3Amain&branch=main',
])('restores the bound snapshot without selecting or applying sources (query: %s)', async (query) => {
  mocks.query = query;
  mocks.workspaces = [boundWorkspace()];
  const { unmount } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSnapshot();
  unmount();
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSnapshot();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.saveDraft).not.toHaveBeenCalled();
});

it('keeps bound snapshot editing independent of source list refreshes', async () => {
  mocks.query = '';
  mocks.workspaces = [boundWorkspace()];
  mocks.candidatesLoading = true;
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  mocks.candidatesLoading = false;
  rerender(<SchemaStudioExperience projectId="p" />);
  await expectBoundSnapshot();
  mocks.workspaces = [{ ...boundWorkspace(), revision: 3 }];
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
});

it.each([
  'hash',
  'artifactVersionId',
  'projectId',
  'canonicalName',
  'version',
] as const)('does not substitute a different bound source %s', (field) => {
  mocks.query = '';
  const workspace = boundWorkspace();
  workspace.schemaBindings[0]!.studioSources![0]![field] = 'different';
  mocks.workspaces = [workspace];
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('clears restored sources when switching to an unbound Workspace', async () => {
  mocks.query = '';
  mocks.workspaces = [
    boundWorkspace(),
    {
      id: 'workspace_branch:feature',
      revision: 1,
      status: 'draft',
      targetBranch: 'feature',
      title: 'Feature workspace',
      schemaBindings: [],
    },
  ];
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSnapshot();
  fireEvent.change(screen.getByLabelText('Target Workspace'), {
    target: { value: 'workspace_branch:feature' },
  });
  mocks.query = new URL(mocks.push.mock.calls[0][0], 'http://local').search.slice(1);
  rerender(<SchemaStudioExperience projectId="p" />);
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked()
  );
  expect(screen.getByText('Choose a Schema or Module in Sources to start editing.')).toBeVisible();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('keeps pending Studio selection ahead of the bound sources', async () => {
  mocks.query = '';
  const workspace = boundWorkspace();
  workspace.schemaBindings[0]!.studioSources![0]!.hash = 'different';
  mocks.workspaces = [workspace];
  mocks.pendingSchema = {
    status: 'pending_preparation',
    pending: { source: { kind: 'studio', candidateIds: ['provider'] } },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSelection();
});

it('keeps the saved edit selection ahead of the bound sources', () => {
  mocks.query = '';
  mocks.workspaces = [boundWorkspace()];
  mocks.schemaEditCandidate = {
    candidateId: 'schema-edit',
    revision: 1,
    localContribution: { nodes: {} },
    origin: { channel: 'studio' },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
});

function boundWorkspace() {
  return {
    id: 'workspace_branch:main',
    revision: 2,
    status: 'draft',
    targetBranch: 'main',
    title: 'Main workspace',
    schemaBindings: [
      {
        schemaName: 'team/base',
        version: '1.0',
        mode: 'draft_override',
        studioSources: [
          {
            projectId: null,
            artifactVersionId: 'base-v1',
            canonicalName: 'team/base',
            version: '1.0',
            hash: 'sha256:abc',
          },
        ],
      },
    ] as WorkspaceSchemaBinding[],
  };
}

async function expectBoundSelection() {
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked()
  );
  expect(screen.getByText('team/base · 1.0')).toBeVisible();
  expect(mocks.previewInputs).toContainEqual({
    candidateIds: ['provider'],
    workspaceId: 'workspace_branch:main',
  });
}

it('previews a recovered Schema edit by server-managed candidate revision', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 4,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.schemaEditCandidate = {
    candidateId: 'schema-edit',
    revision: 3,
    localContribution: { nodes: { advantage: { slots: {} } } },
    origin: { channel: 'studio' },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await waitFor(() =>
    expect(mocks.previewInputs).toContainEqual({
      candidateIds: ['provider'],
      workspaceId: 'workspace_branch:main',
      schemaEditCandidate: { candidateId: 'schema-edit', revision: 3 },
    })
  );
  expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled();
});

it('does not offer the selected candidate as its own comparison', () => {
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.queryByRole('option', { name: 'Shared foundation · 1.0' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Combine sources…' })).toBeDisabled();
});

it('opens source composition without applying or discarding the current candidate', () => {
  mocks.workspaces = [boundWorkspace()];
  render(
    <SchemaStudioExperience projectId="p">
      <div>Module workbench content</div>
    </SchemaStudioExperience>
  );
  openSources();
  fireEvent.click(screen.getByRole('button', { name: 'Combine sources…' }));
  const dialog = screen.getByRole('dialog', { name: 'Combine Schema sources' });
  expect(
    within(dialog).getByRole('checkbox', { name: 'Combine Shared foundation @ 1.0' })
  ).toBeChecked();
  expect(within(dialog).queryByText('Module workbench content')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('opens the embedded definition workbench and saves the YAML candidate', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  openYaml();
  const editDefinition = screen.getByRole('button', { name: 'Edit YAML' });
  expect(editDefinition.closest('[role=dialog]')).toContainElement(
    screen.getByRole('button', { name: 'Download YAML' })
  );
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Edit YAML' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit Schema definition' });
  expect(within(dialog).queryByRole('tab', { name: 'Structure' })).not.toBeInTheDocument();
  expect(within(dialog).getByText('Base (immutable)')).toBeVisible();
  expect(within(dialog).getByText('Result preview')).toBeVisible();
  const yaml = within(dialog).getByLabelText(
    'Schema definition YAML editor'
  ) as HTMLTextAreaElement;
  fireEvent.change(yaml, {
    target: {
      value: dump({ ...(load(yaml.value) as object), nodes: { new_node: { slots: {} } } }),
    },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save candidate' }));
  await waitFor(() =>
    expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace_branch:main',
        candidateIds: ['provider'],
        ifRevision: 0,
        origin: 'studio',
        localContribution: {},
        schemaDefinition: expect.objectContaining({ nodes: { new_node: { slots: {} } } }),
      })
    )
  );
});

it('selects the only draft workspace once instead of duplicating Main workspace', () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  const select = screen.getByLabelText('Target Workspace');
  expect(select.querySelectorAll('option')).toHaveLength(1);
  expect(select).toHaveValue('workspace_branch:main');
  expect(select).toHaveTextContent('Main workspace');
});

it('starts a new branch editor from its inherited bound definition, not the original source schema', async () => {
  mocks.query = 'candidate=provider&workspace=workspace_branch%3Afeature';
  mocks.workspaces = [
    {
      id: 'workspace_branch:feature',
      revision: 2,
      status: 'draft',
      targetBranch: 'feature',
      title: 'Feature workspace',
    },
  ];
  const inherited = {
    yschema: '0.1',
    name: 'inherited',
    strict: true,
    nodes: {
      product: {
        slots: { owner: { type: 'string' }, existing_local: { type: 'string', maxWords: 40 } },
      },
    },
  };
  mocks.data = {
    ...(mocks.data as object),
    schemaHash: 'inherited-hash',
    workspace: { id: 'workspace_branch:feature', revision: 2, changes: [], boundSchema: inherited },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Edit YAML' }));
  const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  expect(load(yaml.value)).toEqual(inherited);
  fireEvent.change(yaml, { target: { value: yaml.value.replace('type: string', 'type: number') } });
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() =>
    expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace_branch:feature',
        baseSchemaHash: 'inherited-hash',
        schemaDefinition: {
          ...inherited,
          nodes: {
            product: {
              slots: {
                owner: { type: 'number' },
                existing_local: { type: 'string', maxWords: 40 },
              },
            },
          },
        },
      })
    )
  );
});

it('edits existing fields against a frozen Base and retains unsaved input while preview is revalidating', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.data = {
    ...(mocks.data as object),
    schema: {
      yschema: '0.1',
      name: 'studio:test',
      strict: true,
      nodes: { product: { slots: { title: { type: 'string' } } } },
    },
  };
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Edit YAML' }));
  const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  const editedYaml = yaml.value.replace('type: string', 'type: number');
  fireEvent.change(yaml, { target: { value: editedYaml } });
  mocks.data = undefined;
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByLabelText('Schema definition YAML editor')).toHaveValue(editedYaml);
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() =>
    expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSchemaHash: 'definition-hash',
        localContribution: {},
        schemaDefinition: expect.objectContaining({
          strict: true,
          nodes: { product: { slots: { title: { type: 'number' } } } },
        }),
      })
    )
  );
});

it.each([
  false,
  true,
])('opens the complete Review without adopting a pending candidate (local edit: %s)', async (localEdit) => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.pendingSchema = {
    status: 'pending_preparation',
    pending: { source: { kind: 'studio', candidateIds: ['provider'] } },
  };
  if (localEdit)
    mocks.schemaEditCandidate = {
      candidateId: 'saved-local',
      revision: 3,
      localContribution: { nodes: { advantage: { slots: {} } } },
      origin: { channel: 'studio' },
    };
  mocks.branches = ['main'];
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.data = {
    samples: [],
    schema: { nodes: {} },
    schemaHash: 'definition-hash',
    reviewHash: 'review',
    renderPlan: [],
    origins: {},
    sources: [],
    modules: [],
    report: { valid: true, issues: [] },
    impact: {
      status: 'safe',
      canAdopt: true,
      canPublish: true,
      changes: [],
      items: [],
      content: { source: 'candidate_fields', hash: null, valid: true, ready: true, issues: [] },
    },
    adoption: { allowed: true },
    workspace: { id: 'workspace_branch:main', revision: 3, changes: [] },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByLabelText('Target Workspace')).toHaveValue('workspace_branch:main');
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review Schema changes' }));
  await waitFor(() => expect(mocks.fullReview).toHaveBeenCalledWith('workspace_branch:main'));
  expect(mocks.livePreview).toHaveBeenCalledWith({
    candidateIds: ['provider'],
    workspaceId: 'workspace_branch:main',
    ...(localEdit ? { schemaEditCandidate: { candidateId: 'saved-local', revision: 3 } } : {}),
  });
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.prepareContent).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('reviewSnapshot=exact-review'))
  );
});

it('shows unsafe content impact while preventing confirmation, then discards a stale review', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  const preview = {
    samples: [],
    schema: { nodes: {} },
    schemaHash: 'hash',
    reviewHash: 'unsafe-review',
    renderPlan: [],
    origins: {},
    sources: [],
    modules: [],
    report: { valid: true, issues: [], layers: [] },
    adoption: { allowed: true },
    workspace: {
      id: 'workspace_branch:main',
      revision: 3,
      changes: [{ kind: 'REMOVE', path: 'nodes.product', summary: 'Removed product' }],
    },
    impact: {
      status: 'needs_mapping',
      canAdopt: false,
      canPublish: false,
      changes: [],
      items: [
        {
          kind: 'needs_mapping',
          code: 'REMOVAL_REQUIRES_MAPPING',
          path: 'nodes.product',
          message: 'Map existing content before removing product.',
          affectedPaths: ['product/title'],
        },
      ],
      content: {
        source: 'authoring_ledger',
        hash: 'content-hash',
        valid: true,
        ready: true,
        issues: [],
      },
    },
  };
  mocks.data = preview;
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  openChecks();
  const dialog = screen.getByRole('dialog', { name: 'Schema checks' });
  expect(within(dialog).getByText('Map existing content before removing product.')).toBeVisible();
  expect(
    within(dialog).queryByRole('button', { name: 'Adopt & return to Workspace' })
  ).not.toBeInTheDocument();
  expect(within(dialog).getByRole('region', { name: 'Schema definition changes' })).toBeVisible();
  expect(within(dialog).getByRole('region', { name: 'Schema content impact' })).toBeVisible();
  mocks.data = { ...preview, reviewHash: 'new-revision-review' };
  rerender(<SchemaStudioExperience projectId="p" />);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('prepares an empty first binding and opens full Review without adoption', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain&candidate=provider';
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.data = {
    ...(mocks.data as object),
    sources: [],
    report: { valid: true, issues: [] },
    impact: {
      status: 'needs_input',
      canAdopt: true,
      canPublish: false,
      items: [],
      content: { source: 'empty', valid: true, ready: false, issues: [] },
    },
    workspace: {
      id: 'workspace_branch:main',
      revision: 3,
      binding: null,
      canBind: true,
      changes: [],
    },
  };
  mocks.apply.mockResolvedValue({ outcome: 'bound', workspaceRevision: 4, binding: {} });
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.queryByRole('button', { name: 'Bind Schema' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review Schema changes' }));
  await waitFor(() =>
    expect(mocks.prepareContent).toHaveBeenCalledWith(
      'workspace_branch:main',
      expect.objectContaining({
        ifRevision: 3,
        commands: [],
        previewHash: 'checked',
      })
    )
  );
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Apply exact definition' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('reviewSnapshot=exact-review'))
  );
});

it('opens private publication from the checked saved candidate without applying or navigating the Workspace', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain&candidate=provider';
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.schemaEditCandidate = {
    candidateId: 'saved-local',
    revision: 3,
    localContribution: { nodes: {} },
    origin: { channel: 'studio' },
  };
  mocks.data = {
    samples: [],
    schema: { nodes: {} },
    schemaHash: `sha256:${'a'.repeat(64)}`,
    reviewHash: `sha256:${'b'.repeat(64)}`,
    renderPlan: [],
    origins: {},
    sources: [],
    modules: [],
    report: { valid: true, issues: [] },
    impact: {
      status: 'safe',
      canAdopt: true,
      canPublish: true,
      items: [],
      content: { source: 'candidate_fields', valid: true, ready: true, issues: [] },
    },
    adoption: { allowed: true },
    workspace: { id: 'workspace_branch:main', revision: 3, changes: [] },
    freshness: { candidateId: 'saved-local', candidateRevision: 3 },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled()
  );
  openChecks();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Review actions' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Publish public Schema' }));
  expect(screen.getByRole('dialog', { name: 'Publish public Schema' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Publish public version' })).toBeEnabled();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('saves a main branch workspace when none is persisted', async () => {
  mocks.branches = ['main'];
  mocks.refresh.mockResolvedValue(undefined);
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByLabelText('Target Workspace')).toHaveValue('workspace_branch:main');
  await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
  expect(mocks.saveDraft).toHaveBeenCalledWith(
    'p',
    'workspace_branch:main',
    expect.objectContaining({ targetBranch: 'main', title: 'Main workspace', status: 'draft' })
  );
  expect(mocks.refresh).toHaveBeenCalled();
});

it('edits Schema fields in the default Data view and saves through the existing candidate API', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.data = {
    ...(mocks.data as object),
    schema: {
      yschema: '0.1',
      name: 'checklist',
      strict: true,
      nodes: { checklist: { slots: { title: { type: 'string', maxLength: 50 } } } },
    },
  };
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.queryByRole('tablist', { name: 'Studio view' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  expect(screen.getByLabelText('Target Workspace')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Review Schema changes' })).toBeEnabled();
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  openYaml();
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Schema YAML' })).getByRole('button', {
      name: 'Close',
    })
  );
  expect(screen.getByRole('tree', { name: 'Schema fields' })).toBeVisible();
  expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() =>
    expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateIds: ['provider'],
        workspaceId: 'workspace_branch:main',
        ifRevision: 0,
        baseSchemaHash: 'definition-hash',
        localContribution: {},
        schemaDefinition: {
          yschema: '0.1',
          name: 'checklist',
          strict: true,
          nodes: {
            checklist: {
              slots: { title: { type: 'string', maxLength: 50 } },
              requiredSlots: ['title'],
            },
          },
        },
      })
    )
  );
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('does not replace an unsaved Data edit when another candidate revision arrives', async () => {
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 1,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main workspace',
    },
  ];
  mocks.data = {
    ...(mocks.data as object),
    schema: { yschema: '0.1', nodes: { checklist: { slots: { title: { type: 'string' } } } } },
  };
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  fireEvent.change(screen.getByLabelText('Type checklist/title'), { target: { value: 'number' } });
  mocks.schemaEditCandidate = {
    candidateId: 'remote',
    revision: 2,
    localContribution: {},
    origin: { channel: 'assistant' },
  };
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByLabelText('Type checklist/title')).toHaveValue('number');
  expect(screen.getByRole('alert')).toHaveTextContent('changed elsewhere');
  expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
});

it('waits for the saved candidate preview instead of initializing Data from its base', async () => {
  mocks.workspaces = [
    { id: 'saved', revision: 2, status: 'draft', targetBranch: 'main', title: 'Saved' },
  ];
  mocks.query = 'workspace=saved&candidate=provider';
  mocks.schemaEditCandidate = {
    candidateId: 'saved-edit',
    revision: 2,
    localContribution: {},
    origin: { channel: 'studio' },
  };
  const base = {
    ...(mocks.data as object),
    schema: { yschema: '0.1', nodes: { base: { slots: { title: { type: 'string' } } } } },
  };
  mocks.previewResult = (input) =>
    (input as { schemaEditCandidate?: unknown }).schemaEditCandidate ? undefined : base;
  const view = render(<SchemaStudioExperience projectId="p" />);
  expect(screen.queryByLabelText('Type base/title')).not.toBeInTheDocument();
  expect(screen.getByText('Loading Schema definition…')).toBeVisible();
  mocks.previewResult = (input) =>
    (input as { schemaEditCandidate?: unknown }).schemaEditCandidate
      ? {
          ...base,
          schema: { yschema: '0.1', nodes: { saved: { slots: { title: { type: 'number' } } } } },
        }
      : base;
  view.rerender(<SchemaStudioExperience projectId="p" />);
  await waitFor(() => expect(screen.getByLabelText('Type saved/title')).toHaveValue('number'));
  expect(screen.queryByLabelText('Type base/title')).not.toBeInTheDocument();
});

it.each([
  false,
  true,
])('allows explicit source selection after saved candidate recovery (missing source: %s)', async (missing) => {
  mocks.workspaces = [
    { id: 'saved', revision: 2, status: 'draft', targetBranch: 'main', title: 'Saved' },
  ];
  mocks.query = 'workspace=saved&candidate=provider';
  mocks.schemaEditCandidate = {
    candidateId: 'saved-edit',
    revision: 2,
    localContribution: {},
    origin: { channel: 'studio' },
    ...(missing
      ? {
          baseSources: [
            {
              projectId: null,
              artifactVersionId: 'missing-v1',
              canonicalName: 'team/missing',
              version: '1.0',
              hash: 'sha256:missing',
            },
          ],
        }
      : {}),
  };
  mocks.data = {
    ...(mocks.data as object),
    modules: [],
    schema: { yschema: '0.1', nodes: { chosen: { slots: { title: { type: 'string' } } } } },
  };
  render(<SchemaStudioExperience projectId="p" />);
  if (missing) {
    expect(screen.getByRole('alert')).toHaveTextContent('team/missing @ 1.0');
    expect(screen.getByRole('button', { name: 'Retry Schema' })).toBeVisible();
    expect(screen.queryByText('Loading Schema definition…')).not.toBeInTheDocument();
  } else {
    await waitFor(() => expect(screen.getByLabelText('Type chosen/title')).toBeVisible());
  }
  openSources();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' }));
  await waitFor(() => expect(screen.getByLabelText('Type chosen/title')).toBeVisible());
  expect(screen.queryByText('Loading Schema definition…')).not.toBeInTheDocument();
  expect(screen.getByRole('tree', { name: 'Schema fields' })).toBeVisible();
  expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument();
  mocks.schemaEditCandidate!.baseDefinition = { yschema: '0.1', nodes: {} };
  fireEvent.change(screen.getByLabelText('Type chosen/title'), { target: { value: 'object' } });
  await waitFor(() =>
    expect(mocks.previewInputs).toContainEqual(
      expect.objectContaining({
        schemaDefinition: expect.anything(),
        baseSchemaHash: 'definition-hash',
      })
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(screen.getByLabelText('Type chosen/title')).toHaveValue('string'));
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Type chosen/title'), { target: { value: 'object' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() =>
    expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        ifRevision: 2,
        baseSchemaHash: 'definition-hash',
        rebase: true,
      })
    )
  );
});

it('reviews failed checks without a Workspace and never offers adoption into another target', () => {
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByRole('button', { name: 'Review Schema changes' }));
  const dialog = screen.getByRole('dialog', { name: 'Schema checks' });
  expect(within(dialog).getByRole('region', { name: 'Schema checks' })).toBeVisible();
  expect(within(dialog).getByText('Missing service capability')).toBeVisible();
  expect(
    within(dialog).queryByRole('region', { name: 'Schema definition changes' })
  ).not.toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: 'Adopt & return to Workspace' })
  ).not.toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: 'Prepare content & mappings' })
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(screen.queryByRole('tablist', { name: 'Studio view' })).not.toBeInTheDocument();
});

it('uses the resolved branch target in all outbound Studio links and normalizes its URL', () => {
  mocks.query =
    'branch=feature&returnTo=%2Fexplore%3FcatalogName%3Dteam%252Fbase%26workspace%3Dold%26branch%3Dmain';
  mocks.workspaces = [
    boundWorkspace(),
    { ...boundWorkspace(), id: 'feature-draft', title: 'Feature', targetBranch: 'feature' },
  ];
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByLabelText('Target Workspace')).toHaveValue('feature-draft');
  expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining('workspace=feature-draft'), {
    scroll: false,
  });
  const back = screen.getByRole('link', { name: 'Back to source' });
  const url = new URL(back.getAttribute('href')!, 'http://local');
  expect(url.searchParams.get('workspace')).toBe('feature-draft');
  expect(url.searchParams.get('branch')).toBe('feature');
  openSources();
  expect(screen.getByRole('link', { name: 'Browse source releases' })).not.toHaveAttribute(
    'href',
    expect.stringContaining('catalogName')
  );
});

it('discards only the unsaved editor before completing a requested Workspace switch', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain&branch=main&candidate=provider';
  mocks.workspaces = [
    boundWorkspace(),
    { ...boundWorkspace(), id: 'feature-draft', title: 'Feature', targetBranch: 'feature' },
  ];
  mocks.data = {
    ...(mocks.data as object),
    schema: { yschema: '0.1', nodes: { checklist: { slots: { title: { type: 'string' } } } } },
  };
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  fireEvent.change(screen.getByLabelText('Target Workspace'), {
    target: { value: 'feature-draft' },
  });
  expect(screen.getByRole('dialog')).toHaveTextContent('Save Schema edits before leaving?');
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard & continue' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      '/team/project/schemas?workspace=feature-draft&branch=feature&schemaView=studio',
      { scroll: false }
    )
  );
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
});

function selectSchemaAction(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Schema actions' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name, exact: true }));
}

function openSources() {
  const trigger = screen.getByRole('button', { name: 'Manage sources' });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}
function closeSources() {
  const trigger = screen.getByRole('button', { name: 'Manage sources' });
  if (trigger.getAttribute('aria-expanded') === 'true') fireEvent.click(trigger);
}
function openYaml() {
  if (screen.queryByRole('dialog', { name: 'Schema YAML' })) return;
  closeSources();
  selectSchemaAction('View YAML');
}

it('keeps one source palette and opens candidate YAML from More without changing the candidate', () => {
  mocks.workspaces = [boundWorkspace()];
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.queryByRole('tablist', { name: 'Studio view' })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Manage sources' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.queryByRole('region', { name: 'Schema details' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Schema YAML' })).not.toBeInTheDocument();
  expect(screen.getByText('Draft Schema: team/base · 1.0')).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Schema actions' }), { key: 'Enter' });
  expect(screen.queryByRole('menuitem', { name: 'Open Workspace' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'View YAML', exact: true }));
  expect(screen.getByText(/yschema: '0.1'/, { selector: 'code' })).toBeVisible();
  expect(screen.queryByRole('tablist', { name: 'Studio view' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Composed structure' })).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Module details' })).not.toBeInTheDocument();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('downloads the candidate as YAML without applying it', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:schema');
  const revokeObjectURL = vi.fn();
  let downloadedName = '';
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    downloadedName = this.download;
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  try {
    render(<SchemaStudioExperience projectId="p" />);
    openYaml();
    fireEvent.click(screen.getByRole('button', { name: 'Download YAML' }));
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(createObjectURL.mock.calls[0][0].type).toBe('application/yaml');
    expect(downloadedName).toBe('schema-studio-definition.yaml');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:schema');
    expect(mocks.apply).not.toHaveBeenCalled();
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});

function openChecks() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Schema actions' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Schema checks & publishing' }));
}

async function expectBoundSnapshot() {
  await waitFor(() =>
    expect(mocks.previewInputs).toContainEqual({
      candidateIds: [],
      workspaceId: 'workspace_branch:main',
    })
  );
  expect(
    screen.queryByText('Choose a Schema or Module in Sources to start editing.')
  ).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
}

it.each([
  false,
  true,
])('recovers an applied edit from the snapshot with truthful committed status: %s', async (committed) => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  const workspace = boundWorkspace();
  workspace.schemaBindings = [
    { ...workspace.schemaBindings[0], schemaHash: 'snapshot-hash', studioSources: undefined },
  ];
  mocks.workspaces = [workspace];
  mocks.schemaEditCandidate = {
    candidateId: 'applied',
    revision: 2,
    localContribution: {},
    origin: { channel: 'studio' },
    baseSources: [
      {
        projectId: null,
        artifactVersionId: 'removed',
        canonicalName: 'team/removed',
        version: '1.0',
        hash: 'sha256:removed',
      },
    ],
    authoringDraft: {
      resultSchemaHash: 'snapshot-hash',
    } as StudioSchemaEditCandidate['authoringDraft'],
  };
  mocks.draftView = {
    hasChanges: !committed,
    basis: { refHead: committed ? 'sha256:committed-head' : null },
  };
  mocks.data = {
    ...(mocks.data as object),
    schema: { yschema: '0.1', nodes: { item: { slots: { title: { type: 'number' } } } } },
  };
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSnapshot();
  expect(screen.getByLabelText('Type item/title')).toHaveValue('number');
  expect(
    screen.getByText(committed ? 'Committed · committed-he' : 'Saved to Draft · not committed', {
      exact: true,
    })
  ).toBeVisible();
  expect(screen.queryByText(/needs missing sources/)).not.toBeInTheDocument();
  expect(screen.queryByText('Changes saved · not committed')).not.toBeInTheDocument();
});

it('keeps a failed Review on the editor without navigating to Workspace', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.data = {
    ...(mocks.data as object),
    report: { valid: true, issues: [] },
    workspace: { id: 'workspace_branch:main', revision: 2, changes: [] },
  };
  mocks.fullReview.mockRejectedValue(new Error('The branch moved. Review again.'));
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByRole('button', { name: 'Review Schema changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The branch moved. Review again.');
  expect(mocks.push).not.toHaveBeenCalled();
});
