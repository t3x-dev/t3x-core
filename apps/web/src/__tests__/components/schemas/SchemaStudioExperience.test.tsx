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
  draftLoading: false,
  draftError: undefined as string | undefined,
  schemaEditLoading: false,
  schemaEditError: undefined as string | undefined,
  reviewStatus: { latest: null, loading: false, error: undefined } as {
    latest: unknown;
    loading: boolean;
    error?: string;
  },
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
  useSchemaDraftStatus: () => ({
    view: mocks.draftView,
    loading: mocks.draftLoading,
    error: mocks.draftError,
    refresh: vi.fn(),
  }),
}));
vi.mock('@/hooks/schemas/useSchemaReviewStatus', () => ({
  useSchemaReviewStatus: () => ({ ...mocks.reviewStatus, refresh: vi.fn() }),
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
    return {
      data,
      loading:
        !data &&
        !!(
          (input as { workspaceId?: string; candidateIds?: string[] }).workspaceId ||
          (input as { candidateIds?: string[] }).candidateIds?.length
        ),
      refresh: vi.fn(),
    };
  },
}));
vi.mock('@/hooks/schemas/usePublishStudioSchema', () => ({
  usePublishStudioSchema: () => mocks.publish,
}));
vi.mock('@/hooks/schemas/useStudioSchemaEditCandidate', () => ({
  useStudioSchemaEditCandidate: () => ({
    candidate: mocks.schemaEditCandidate,
    loading: mocks.schemaEditLoading,
    error: mocks.schemaEditError,
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
  mocks.draftLoading = false;
  mocks.draftError = undefined;
  mocks.schemaEditLoading = false;
  mocks.schemaEditError = undefined;
  mocks.query = 'candidate=provider';
  mocks.draftView = {
    workspaceRevision: 2,
    compositionRevision: 1,
    hasChanges: true,
    basis: { refName: 'main', refHead: null },
    current: {},
  };
  mocks.reviewStatus = { latest: null, loading: false };
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
      origin: { channel: 'studio' },
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
  expect(screen.getByRole('link', { name: 'Browse schema catalog' })).toHaveAttribute(
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
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
});
it('does not review another Workspace when the deep-linked target is missing', () => {
  mocks.query = 'candidate=provider&workspace=missing';
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Workspace missing was not found in this project'
  );
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled();
  expect(screen.getByRole('link', { name: 'Browse schema catalog' })).toHaveAttribute(
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
  expect(
    within(controls).getByRole('button', { name: /^(Review changes|Save and review)$/ })
  ).toBeEnabled();
  expect(screen.getByLabelText('Target Workspace')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove Shared foundation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled();
  closeSources();
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('Select a valid Workspace');
  openSources();
  expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
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
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
  mocks.candidatesLoading = false;
  rerender(<SchemaStudioExperience projectId="p" />);
  await expectBoundSnapshot();
  mocks.workspaces = [{ ...boundWorkspace(), revision: 3 }];
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
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
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
    ).not.toBeInTheDocument()
  );
  expect(screen.getByRole('button', { name: 'Create schema' })).toBeVisible();
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
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
    ).not.toBeInTheDocument()
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
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled();
});

it('does not offer the selected candidate as its own comparison', () => {
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.queryByRole('option', { name: 'Shared foundation · 1.0' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Combine schemas…' })).toBeDisabled();
});

it('opens source composition without applying or discarding the current candidate', () => {
  mocks.workspaces = [boundWorkspace()];
  render(
    <SchemaStudioExperience projectId="p">
      <div>Module workbench content</div>
    </SchemaStudioExperience>
  );
  openSources();
  fireEvent.click(screen.getByRole('button', { name: 'Combine schemas…' }));
  const dialog = screen.getByRole('dialog', { name: 'Combine schemas' });
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
  const dialog = screen.getByRole('dialog', { name: 'Schema YAML editor' });
  expect(within(dialog).queryByText('Base (immutable)')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Result preview')).not.toBeInTheDocument();
  const yaml = within(dialog).getByLabelText(
    'Schema definition YAML editor'
  ) as HTMLTextAreaElement;
  fireEvent.change(yaml, {
    target: {
      value: dump({ ...(load(yaml.value) as object), nodes: { new_node: { slots: {} } } }),
    },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft', exact: true }));
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
  const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  expect(load(yaml.value)).toEqual(inherited);
  fireEvent.change(yaml, { target: { value: yaml.value.replace('type: string', 'type: number') } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
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
  const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  const editedYaml = yaml.value.replace('type: string', 'type: number');
  fireEvent.change(yaml, { target: { value: editedYaml } });
  mocks.data = undefined;
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByLabelText('Schema definition YAML editor')).toHaveValue(editedYaml);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
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
    expect(
      screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
    ).not.toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
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

it.each([
  'definition',
  'authorization',
  'impact',
])('opens diagnostics instead of preparing or committing when fresh %s checks fail', async (failure) => {
  mocks.query = 'workspace=workspace_branch%3Amain&candidate=provider';
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main',
    },
  ];
  mocks.data = {
    ...mocks.data,
    report: { valid: true, issues: [] },
    workspace: { id: 'workspace_branch:main', revision: 3, changes: [] },
  };
  mocks.livePreview.mockResolvedValue({
    ...mocks.data,
    ...(failure === 'definition' ? { report: { valid: false, issues: [] } } : {}),
    ...(failure === 'authorization' ? { adoption: { allowed: false } } : {}),
    ...(failure === 'impact' ? { impact: { status: 'blocked' } } : {}),
  });
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      expect.stringContaining(
        'workspaceMode=review&branch=main&schemaDiagnostics=1&schemaSelection=1&schemaSource=provider'
      )
    )
  );
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.prepareContent).not.toHaveBeenCalled();
  expect(mocks.fullReview).not.toHaveBeenCalled();
});

it('opens detailed checks in Workspace Review without applying the Schema', () => {
  mocks.query = 'workspace=workspace_branch%3Amain&candidate=provider';
  mocks.workspaces = [
    {
      id: 'workspace_branch:main',
      revision: 3,
      status: 'draft',
      targetBranch: 'main',
      title: 'Main',
    },
  ];
  render(<SchemaStudioExperience projectId="p" />);
  openChecks();
  expect(mocks.push).toHaveBeenCalledWith(
    '/project/p?tab=workspaces&workspace=workspace_branch%3Amain&workspaceMode=review&branch=main&schemaDiagnostics=1&schemaSelection=1&schemaSource=provider'
  );
  expect(screen.queryByRole('dialog', { name: 'Schema checks' })).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.prepareContent).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
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

it('opens public publication from the checked saved candidate without applying or navigating the Workspace', async () => {
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
    expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled()
  );
  closeSources();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Schema actions' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Publish to public catalog…' }));
  expect(screen.getByRole('dialog', { name: 'Publish schema to public catalog' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Publish publicly' })).toBeEnabled();
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
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeEnabled();
  openSources();
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
  openYaml();
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Schema YAML editor' })).getByRole('button', {
      name: 'Close',
    })
  );
  expect(screen.getByRole('tree', { name: 'Schema fields' })).toBeVisible();
  expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
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
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
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
])('opens explicit composition without discarding the saved candidate (missing source: %s)', async (missing) => {
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
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(screen.queryByText('Loading Schema definition…')).not.toBeInTheDocument();
  } else {
    await waitFor(() => expect(screen.getByLabelText('Type chosen/title')).toBeVisible());
  }
  openSources();
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Combine schemas…' }));
  expect(screen.getByRole('dialog', { name: 'Combine schemas' })).toBeVisible();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  expect(mocks.schemaEditCandidate?.candidateId).toBe('saved-edit');
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Combine schemas' })).getByRole('button', {
      name: 'Cancel',
    })
  );
  if (missing) expect(screen.getByRole('alert')).toHaveTextContent('team/missing @ 1.0');
  else expect(screen.getByLabelText('Type chosen/title')).toBeVisible();
});

it('requires a valid Workspace for diagnostics and never opens a retired check dialog', () => {
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('Select a valid Workspace');
  expect(screen.queryByRole('dialog', { name: 'Schema checks' })).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
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
  expect(screen.getByRole('link', { name: 'Browse schema catalog' })).not.toHaveAttribute(
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
  expect(screen.getByRole('dialog')).toHaveTextContent('Save schema draft before leaving?');
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
  const trigger = screen.queryByRole('button', { name: 'Manage sources' });
  if (trigger?.getAttribute('aria-expanded') === 'true') fireEvent.click(trigger);
}
function openYaml() {
  if (screen.queryByRole('dialog', { name: 'Schema YAML editor' })) return;
  closeSources();
  selectSchemaAction('Edit YAML…');
}

it('keeps sources beside the fields and opens YAML directly without nested panels', () => {
  mocks.workspaces = [boundWorkspace()];
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Toggle Schema sources' })).not.toBeInTheDocument();
  openSources();
  closeSources();
  expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
  expect(screen.queryByText('Draft Schema: team/base · 1.0')).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Schema actions' }), { key: 'Enter' });
  expect(
    screen.queryByRole('menuitemcheckbox', { name: 'Schema sources' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: 'Discard all unsaved changes' })
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'View YAML' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit YAML…' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByLabelText('Schema definition YAML editor')).toBeVisible();
  expect(screen.queryByText('Definition details')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced editing')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save and review' })).toBeVisible();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('downloads the candidate as YAML without applying it', () => {
  mocks.workspaces = [boundWorkspace()];
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
  fireEvent.click(screen.getByRole('menuitem', { name: 'View checks and impact' }));
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
  expect(
    screen.queryByRole('checkbox', { name: 'Select Shared foundation 1.0' })
  ).not.toBeInTheDocument();
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
    screen.getByText(committed ? 'Committed · committed-he' : 'Draft saved · not committed', {
      exact: true,
    })
  ).toBeVisible();
  expect(screen.queryByText(/needs missing sources/)).not.toBeInTheDocument();
  if (committed) expect(screen.queryByText('Draft saved · not committed')).not.toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The branch moved. Review again.');
  expect(mocks.push).not.toHaveBeenCalled();
});

it('starts blank explicitly and saves the empty definition before Schema Review', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  const workspace = boundWorkspace();
  workspace.schemaBindings = [];
  mocks.workspaces = [workspace];
  mocks.draftView = { hasChanges: false, basis: { refHead: null } };
  mocks.data = {
    ...(mocks.data as object),
    report: { valid: true, issues: [] },
    modules: [],
    workspace: { id: workspace.id, revision: 2, binding: null, canBind: false, changes: [] },
  };
  mocks.previewResult = (input) =>
    (input as { workspaceId?: string }).workspaceId ? mocks.data : undefined;
  mocks.saveSchemaEdit.mockImplementation(async () => {
    mocks.schemaEditCandidate = {
      candidateId: 'blank-edit',
      revision: 1,
      baseSources: [],
      localContribution: {},
      origin: { channel: 'studio' },
    } as StudioSchemaEditCandidate;
    return { outcome: 'created', workspaceRevision: 2, candidate: mocks.schemaEditCandidate };
  });
  render(<SchemaStudioExperience projectId="p" />);
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Create schema' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  expect(mocks.saveSchemaEdit).toHaveBeenCalledWith(
    expect.objectContaining({
      candidateIds: [],
      schemaDefinition: expect.objectContaining({ nodes: {} }),
      baseSchemaHash: 'definition-hash',
    })
  );
  expect(mocks.contentPreview).toHaveBeenCalled();
  expect(mocks.prepareContent).toHaveBeenCalled();
});

it('keeps rejected Review status visible while hiding Schema Review navigation', () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.reviewStatus.latest = {
    snapshot_id: 'rejected-review',
    schema_review: { draft: { status: 'bound', schemaHash: 'definition-hash' }, draftContent: {} },
    snapshot: {
      review: { precondition: { workspaceRevision: 2, refName: 'main', refHead: null } },
      transition: {
        mode: 'transition',
        decision: { observation: 'supplied', outcome: 'rejected' },
      },
    },
  };
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByText('Changes rejected · draft kept')).toBeVisible();
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeDisabled();
  expect(screen.queryByRole('tab', { name: 'Review', exact: true })).not.toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.fullReview).not.toHaveBeenCalled();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
});

it.each([
  'loading',
  'error',
])('does not navigate to a no-Review empty state while status is %s', (status) => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.reviewStatus = {
    latest: null,
    loading: status === 'loading',
    error: status === 'error' ? 'Offline' : undefined,
  };
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeDisabled();
  expect(screen.queryByRole('tab', { name: 'Review', exact: true })).not.toBeInTheDocument();
  if (status === 'error')
    expect(screen.getByRole('button', { name: 'Retry Review status' })).toBeVisible();
});

it('does not treat a saved candidate reference as a pending net change', () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.draftView = { hasChanges: false, basis: { refName: 'main', refHead: null } };
  mocks.schemaEditCandidate = {
    candidateId: 'saved',
    revision: 1,
    localContribution: {},
    origin: { channel: 'studio' },
  };
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeDisabled();
  expect(screen.getByText('No changes to review')).toBeVisible();
});

it.each([
  'loading',
  'error',
])('waits for the saved Schema candidate before reviewing content when recovery is %s', (status) => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.schemaEditLoading = status === 'loading';
  mocks.schemaEditError = status === 'error' ? 'Candidate unavailable' : undefined;
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.click(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ }));
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeDisabled();
  expect(mocks.fullReview).not.toHaveBeenCalled();
});

it('shows a retry for unknown Draft changes instead of reporting a clean Draft', () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.draftView = undefined;
  mocks.draftError = 'Offline';
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('button', { name: /^(Review changes|Save and review)$/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Retry Draft status' })).toBeVisible();
  expect(screen.queryByText('No changes to review')).not.toBeInTheDocument();
});

it('groups Undo with Save and Review and opens global rules from More without field tabs', async () => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.data = {
    ...mocks.data,
    schema: { nodes: { task: { slots: { title: { type: 'string' } } } } },
    report: { valid: true, issues: [] },
    workspace: { id: 'workspace_branch:main', revision: 2, changes: [] },
  };
  render(<SchemaStudioExperience projectId="p" />);
  const group = screen.getByRole('group', { name: 'Schema save and review' });
  const undo = within(group).getByRole('button', { name: 'Undo and discard' });
  expect(undo).toBeDisabled();
  expect(within(group).getByRole('button', { name: 'Save draft' })).toBeVisible();
  expect(
    within(group).getByRole('button', { name: /^(Review changes|Save and review)$/ })
  ).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Undo and discard' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Relationships & rules…' })).not.toBeInTheDocument();
  fireEvent.focus(screen.getByLabelText('Name task/title'));
  fireEvent.change(screen.getByLabelText('Description for slot task/title'), {
    target: { value: 'Edited title' },
  });
  expect(undo).toBeEnabled();
  selectSchemaAction('Relationships & rules…');
  expect(screen.getByRole('complementary', { name: 'Schema relations and rules' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Properties', exact: true })).not.toBeInTheDocument();
  expect(screen.getByText('These settings apply to the entire schema.')).toBeVisible();
  fireEvent.keyDown(undo, { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Undo last change' }));
  fireEvent.focus(screen.getByLabelText('Name task/title'));
  expect(screen.getByLabelText('Description for slot task/title')).toHaveValue('');
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it.each([
  false,
  true,
])('keeps discard available in the Undo menu and restores saved content (invalid input: %s)', async (invalid) => {
  mocks.query = 'workspace=workspace_branch%3Amain';
  mocks.workspaces = [boundWorkspace()];
  mocks.data = {
    ...mocks.data,
    schema: { nodes: { task: { slots: { title: { type: 'string' } } } } },
    report: { valid: true, issues: [] },
    workspace: { id: 'workspace_branch:main', revision: 2, changes: [] },
  };
  render(<SchemaStudioExperience projectId="p" />);
  fireEvent.focus(screen.getByLabelText('Name task/title'));
  fireEvent.change(screen.getByLabelText('Description for slot task/title'), {
    target: { value: 'Unsaved description' },
  });
  fireEvent.change(screen.getByLabelText('Type task/title'), { target: { value: 'number' } });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Undo and discard' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Undo last change' }));
  expect(screen.getByLabelText('Type task/title')).toHaveValue('string');
  expect(screen.getByLabelText('Description for slot task/title')).toHaveValue(
    'Unsaved description'
  );
  if (invalid) {
    fireEvent.change(screen.getByLabelText('Add a setting'), { target: { value: 'default' } });
    fireEvent.change(screen.getByLabelText('Default value for slot task/title'), {
      target: { value: '{' },
    });
  }
  fireEvent.keyDown(screen.getByRole('button', { name: 'Undo and discard' }), { key: 'Enter' });
  if (invalid)
    expect(screen.getByRole('menuitem', { name: 'Undo last change' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  expect(screen.getByRole('menuitem', { name: 'Discard all unsaved changes' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Discard all unsaved changes' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Undo and discard' })).toBeDisabled()
  );
  fireEvent.focus(screen.getByLabelText('Name task/title'));
  expect(screen.getByLabelText('Description for slot task/title')).toHaveValue('');
  expect(screen.queryByLabelText('Default value for slot task/title')).not.toBeInTheDocument();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

function setupYamlDraft() {
  mocks.workspaces = [boundWorkspace()];
  mocks.data = {
    ...mocks.data,
    schema: {
      yschema: '0.1',
      name: 'checklist',
      strict: true,
      nodes: { checklist: { slots: { title: { type: 'string' } } } },
    },
    report: { valid: true, issues: [] },
    adoption: { allowed: true },
    impact: { status: 'safe', content: { ready: true } },
    workspace: { id: 'workspace_branch:main', revision: 3, changes: [] },
  };
  return render(<SchemaStudioExperience projectId="p" />);
}

it('carries unsaved fields into YAML, saves in place, and returns to the saved field definition', async () => {
  const { rerender } = setupYamlDraft();
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  openYaml();
  const editor = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  expect(load(editor.value)).toMatchObject({ nodes: { checklist: { requiredSlots: ['title'] } } });
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  const edited = editor.value.replace('type: string', 'type: number');
  fireEvent.change(editor, { target: { value: edited } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog', { name: 'Schema YAML editor' })).getByText(
        'Draft saved · not committed'
      )
    ).toBeVisible()
  );
  expect(mocks.saveSchemaEdit.mock.lastCall?.[0].schemaDefinition).toMatchObject({
    nodes: { checklist: { requiredSlots: ['title'], slots: { title: { type: 'number' } } } },
  });
  // Model the real hook publishing the just-saved candidate while the editor stays open.
  mocks.schemaEditCandidate = {
    candidateId: 'schema-edit',
    revision: 1,
    localContribution: {},
    origin: { channel: 'studio' },
  };
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('dialog', { name: 'Schema YAML editor' })).toBeVisible();
  expect(editor).toHaveValue(edited);
  fireEvent.change(editor, { target: { value: edited.replace('type: number', 'type: boolean') } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
  await waitFor(() => expect(mocks.saveSchemaEdit).toHaveBeenCalledTimes(2));
  expect(mocks.saveSchemaEdit.mock.lastCall?.[0]).toMatchObject({ ifRevision: 1 });
  expect(mocks.saveSchemaEdit.mock.lastCall?.[0].rebase).toBeUndefined();
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog', { name: 'Schema YAML editor' })).getByText(
        'Draft saved · not committed'
      )
    ).toBeVisible()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Type checklist/title')).toHaveValue('boolean');
  expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
});

it('discards only YAML changes when returning to an unsaved field draft', () => {
  setupYamlDraft();
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  openYaml();
  const editor = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: 'invalid: [' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard YAML edits' }));
  expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
});

it('saves the field draft before reviewing the exact new YAML candidate revision', async () => {
  setupYamlDraft();
  mocks.saveSchemaEdit.mockResolvedValue({
    candidate: { candidateId: 'new-yaml', revision: 7, localContribution: {} },
  });
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('reviewSnapshot=exact-review'))
  );
  expect(mocks.saveSchemaEdit).toHaveBeenCalledTimes(1);
  expect(mocks.livePreview).toHaveBeenCalledWith({
    workspaceId: 'workspace_branch:main',
    candidateIds: ['provider'],
    schemaEditCandidate: { candidateId: 'new-yaml', revision: 7 },
  });
  expect(mocks.fullReview).toHaveBeenCalledTimes(1);
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('dialog', { name: 'Save schema draft before leaving?' })
  ).not.toBeInTheDocument();
});

it('retains a saved YAML revision when Review fails and retries without saving again', async () => {
  setupYamlDraft();
  mocks.fullReview.mockRejectedValueOnce(new Error('Review unavailable'));
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saved. Could not open Review: Review unavailable'
    )
  );
  expect(screen.getByRole('dialog', { name: 'Schema YAML editor' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('reviewSnapshot=exact-review'))
  );
  expect(mocks.saveSchemaEdit).toHaveBeenCalledTimes(1);
});

it('sends blocked YAML candidates to Review diagnostics without applying them', async () => {
  setupYamlDraft();
  mocks.livePreview.mockResolvedValue({ ...mocks.data, report: { valid: false, issues: [] } });
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining('schemaDiagnostics=1'))
  );
  expect(mocks.fullReview).not.toHaveBeenCalled();
  expect(mocks.prepareContent).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('prepares content against the saved YAML candidate before entering Review', async () => {
  setupYamlDraft();
  mocks.livePreview.mockResolvedValue({
    ...mocks.data,
    workspace: { id: 'workspace_branch:main', revision: 4, binding: null, changes: [] },
  });
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
  await waitFor(() => expect(mocks.fullReview).toHaveBeenCalled());
  expect(mocks.prepareContent).toHaveBeenCalledWith(
    'workspace_branch:main',
    expect.objectContaining({
      target: expect.objectContaining({
        schemaEditCandidate: { candidateId: 'schema-edit', revision: 1 },
      }),
      ifRevision: 4,
      previewHash: 'checked',
    })
  );
  expect(mocks.prepareContent.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.fullReview.mock.invocationCallOrder[0]
  );
  expect(mocks.apply).not.toHaveBeenCalled();
});
