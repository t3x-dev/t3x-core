// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioSchemaEditCandidate } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaStudioExperience } from '@/components/schemas/SchemaStudioExperience';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
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
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('button', { name: 'Adopt & return to Workspace' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
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
  const sources = screen.getByRole('region', { name: 'Schema details' });
  expect(composition).toContainElement(controls);
  expect(composition).toContainElement(sources);
  expect(composition).toContainElement(screen.getByRole('region', { name: 'Schema definition' }));
  expect(within(sources).getByRole('button', { name: 'Manage sources' })).toBeVisible();
  expect(within(controls).getByRole('button', { name: 'Review changes' })).toBeEnabled();
  expect(screen.getByLabelText('Target Workspace')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove Shared foundation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('button', { name: 'Adopt & return to Workspace' })).toBeDisabled();
  expect(screen.getByText('Missing service capability')).toBeVisible();
  expect(screen.getByText('Composition dependencies')).toBeVisible();
  expect(screen.getByText('Failed')).toBeVisible();
  expect(screen.getByText('Changes require attention')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it.each([
  '',
  'workspace=workspace_branch%3Amain&branch=main',
])('restores bound sources without applying again (query: %s)', async (query) => {
  mocks.query = query;
  mocks.workspaces = [boundWorkspace()];
  const { unmount } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSelection();
  unmount();
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  await expectBoundSelection();
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.saveDraft).not.toHaveBeenCalled();
});

it('waits for sources before restoring and does not undo an explicit clear', async () => {
  mocks.query = '';
  mocks.workspaces = [boundWorkspace()];
  mocks.candidatesLoading = true;
  const { rerender } = render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  mocks.candidatesLoading = false;
  rerender(<SchemaStudioExperience projectId="p" />);
  await expectBoundSelection();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
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
  await expectBoundSelection();
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
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
});

it('does not offer the selected candidate as its own comparison', () => {
  render(<SchemaStudioExperience projectId="p" />);
  openSources();
  expect(screen.queryByRole('option', { name: 'Shared foundation · 1.0' })).not.toBeInTheDocument();
  expect(screen.getByText('Create a Workspace to apply this definition.')).toBeVisible();
});

it('opens source composition without applying or discarding the current candidate', () => {
  render(
    <SchemaStudioExperience projectId="p">
      <div>Module workbench content</div>
    </SchemaStudioExperience>
  );
  openSources();
  fireEvent.click(screen.getByRole('button', { name: 'Manage sources' }));
  const dialog = screen.getByRole('dialog', { name: 'Combine Schema sources' });
  expect(
    within(dialog).getByRole('checkbox', { name: 'Combine Shared foundation @ 1.0' })
  ).toBeChecked();
  expect(within(dialog).queryByText('Module workbench content')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('opens the embedded definition workbench and saves one shared Structure/YAML candidate', async () => {
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
  const editDefinition = screen.getByRole('button', { name: 'Edit definition' });
  expect(editDefinition.closest('details')).toContainElement(
    screen.getByRole('button', { name: 'Download YAML' })
  );
  openYaml();
  fireEvent.click(screen.getByRole('button', { name: 'Edit definition' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit Schema definition' });
  expect(within(dialog).getByText('Base (immutable)')).toBeVisible();
  expect(within(dialog).getByText('Result preview')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add node' }));
  expect(within(dialog).getByLabelText('Node name new_node')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('tab', { name: 'YAML' }));
  expect(within(dialog).getByLabelText('Schema definition YAML editor')).toBeVisible();
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
  fireEvent.click(screen.getByRole('button', { name: 'Edit definition' }));
  expect(screen.getByLabelText('Slot type existing_local')).toHaveValue('string');
  fireEvent.change(screen.getByLabelText('Slot type owner'), { target: { value: 'number' } });
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
  fireEvent.click(screen.getByRole('button', { name: 'Edit definition' }));
  fireEvent.change(screen.getByLabelText('Slot type title'), { target: { value: 'number' } });
  expect(screen.getByLabelText('Slot type title')).toHaveValue('number');
  mocks.data = undefined;
  rerender(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByLabelText('Slot type title')).toHaveValue('number');
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
])('adopts a pending candidate and returns to the same Workspace (local edit: %s)', async (localEdit) => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.saveSchemaEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Adopt & return to Workspace' }));
  expect(mocks.apply).toHaveBeenCalledWith({
    candidateIds: ['provider'],
    workspaceId: 'workspace_branch:main',
    ifRevision: 3,
    reviewHash: 'review',
    ...(localEdit ? { schemaEditCandidate: { candidateId: 'saved-local', revision: 3 } } : {}),
  });
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      '/project/p?branch=main&tab=workspaces&workspace=workspace_branch%3Amain'
    )
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
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  const dialog = screen.getByRole('dialog', { name: 'Review changes' });
  expect(within(dialog).getByText('Map existing content before removing product.')).toBeVisible();
  expect(
    within(dialog).getByRole('button', { name: 'Adopt & return to Workspace' })
  ).toBeDisabled();
  expect(within(dialog).getByRole('region', { name: 'Schema definition changes' })).toBeVisible();
  expect(within(dialog).getByRole('region', { name: 'Schema content impact' })).toBeVisible();
  mocks.data = { ...preview, reviewHash: 'new-revision-review' };
  rerender(<SchemaStudioExperience projectId="p" />);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('reuses Confirm & apply for an empty first binding without opening content migration', async () => {
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  const dialog = screen.getByRole('dialog', { name: 'Review changes' });
  expect(
    within(dialog).queryByRole('button', { name: 'Prepare content & mappings' })
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm & apply' }));
  await waitFor(() =>
    expect(mocks.apply).toHaveBeenCalledWith({
      candidateIds: ['provider'],
      workspaceId: 'workspace_branch:main',
      ifRevision: 3,
      reviewHash: 'review',
    })
  );
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      expect.stringContaining('workspace=workspace_branch%3Amain')
    )
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish public Schema' }));
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
  expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByLabelText('Required checklist/title'));
  expect(screen.getByLabelText('Target Workspace')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('button', { name: 'Adopt & return to Workspace' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Publish public Schema' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  openSources();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  openYaml();
  expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
  fireEvent.click(screen.getByText(/^Sources/, { selector: 'summary' }));
  fireEvent.click(screen.getByText(/^YAML/, { selector: 'summary' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Fields' }));
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
  fireEvent.click(screen.getByRole('tab', { name: 'Visual' }));
  expect(screen.getByRole('region', { name: 'Schema visual editor' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Fields' }));
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

it('groups checks and changes in Review without replacing the editor view', () => {
  render(<SchemaStudioExperience projectId="p" />);
  expect(
    screen.queryByRole('button', { name: 'Schema checks', exact: true })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Definition changes', exact: true })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  const review = screen.getByRole('dialog', { name: 'Review changes' });
  expect(within(review).getByRole('region', { name: 'Schema checks' })).toBeVisible();
  expect(within(review).getByRole('region', { name: 'Schema definition changes' })).toBeVisible();
  expect(
    within(review).getByRole('button', { name: 'Adopt & return to Workspace' })
  ).toBeDisabled();
  fireEvent.click(within(review).getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');
  expect(mocks.apply).not.toHaveBeenCalled();
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
  fireEvent.keyDown(screen.getByRole('button', { name: 'More Schema actions' }), { key: 'Enter' });
  for (const name of ['Browse schemas', 'Back to source', 'Open Workspace']) {
    const url = new URL(
      screen.getByRole('menuitem', { name, exact: true }).getAttribute('href')!,
      'http://local'
    );
    expect(url.searchParams.get('workspace')).toBe('feature-draft');
    expect(url.searchParams.get('branch')).toBe('feature');
  }
  expect(screen.getByRole('menuitem', { name: 'Browse schemas', exact: true })).not.toHaveAttribute(
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

function openSources() {
  const summary = screen.getByText(/^Sources/, { selector: 'summary' });
  if (!summary.closest('details')!.open) fireEvent.click(summary);
}
function openYaml() {
  const summary = screen.getByText(/^YAML/, { selector: 'summary' });
  if (!summary.closest('details')!.open) fireEvent.click(summary);
}

it('keeps only Fields and Visual while sources and candidate YAML start collapsed', () => {
  mocks.workspaces = [boundWorkspace()];
  render(<SchemaStudioExperience projectId="p" />);
  const views = screen.getByRole('tablist', { name: 'Studio view' });
  expect(
    within(views)
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
  ).toEqual(['Fields', 'Visual']);
  expect(
    screen.getByText(/^Sources/, { selector: 'summary' }).closest('details')
  ).not.toHaveAttribute('open');
  expect(screen.getByText(/^YAML/, { selector: 'summary' }).closest('details')).not.toHaveAttribute(
    'open'
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'More Schema actions' }), { key: 'Enter' });
  expect(screen.getByText('In use: team/base · 1.0')).toBeVisible();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  openYaml();
  expect(screen.getByText(/yschema: '0.1'/, { selector: 'code' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');
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
