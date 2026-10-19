import moduleStyles from '@/components/schemas/AddModulesDialog.module.css';
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaStudioExperience } from '@/components/schemas/SchemaStudioExperience';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  publish: vi.fn(),
  data: undefined as unknown,
  pendingSchema: { status: 'none', pending: null } as unknown,
  query: 'candidate=provider',
  branches: [] as string[],
  refresh: vi.fn(),
  push: vi.fn(),
  saveDraft: vi.fn(),
  saveSchemaEdit: vi.fn(),
  schemaEditCandidate: null as null | {
    candidateId: string;
    revision: number;
    localContribution: Record<string, unknown>;
    origin: { channel: string };
  },
  previewInputs: [] as unknown[],
  workspaces: [] as Array<{
    id: string;
    revision?: number;
    status: string;
    targetBranch: string;
    title: string;
  }>,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({
    items: [
      {
        id: 'provider',
        available: true,
        title: 'Shared foundation',
        kind: 'module',
        source: { canonicalName: 'team/base', version: '1.0', hash: 'sha256:abc' },
      },
    ],
    loading: false,
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
    return { data: mocks.data, loading: false, refresh: vi.fn() };
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
  mocks.apply.mockReset();
  mocks.publish.mockReset();
  mocks.push.mockReset();
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
  expect(screen.getByRole('link', { name: 'Browse source releases' })).toHaveAttribute(
    'href',
    '/project/p?tab=schemas&schemaView=browse&branch=feature%2Frelease'
  );
});
it('does not review another Workspace when the deep-linked target is missing', () => {
  mocks.query = 'candidate=provider&workspace=missing';
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Workspace missing was not found in this project'
  );
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Browse source releases' })).toHaveAttribute(
    'href',
    '/project/p?tab=schemas&schemaView=browse&workspace=missing'
  );
});
it('keeps a required provider checked and locked while blocking a failed definition review', () => {
  render(<SchemaStudioExperience projectId="p" />);
  const controls = screen.getByRole('toolbar', { name: 'Studio controls' });
  const composition = screen.getByRole('main', { name: 'Studio composition' });
  const sources = screen.getByRole('complementary', { name: 'Studio sources' });
  expect(composition).toContainElement(controls);
  expect(composition).toContainElement(sources);
  expect(composition).toContainElement(screen.getByRole('region', { name: 'Composed structure' }));
  expect(composition).toContainElement(
    screen.getByRole('complementary', { name: 'Module details' })
  );
  expect(within(controls).getByRole('button', { name: 'Add modules' })).toBeVisible();
  expect(within(controls).getByRole('button', { name: 'Review changes' })).toBeDisabled();
  expect(screen.getByLabelText('Target Workspace')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Zoom out' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remove Shared foundation' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  fireEvent.click(screen.getByRole('tab', { name: 'Checks', exact: true }));
  expect(screen.getByText('Missing service capability')).toBeVisible();
  expect(screen.getByText('Composition dependencies')).toBeVisible();
  expect(screen.getByText('Failed')).toBeVisible();
  expect(screen.getByText('Changes require attention')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('checkbox', { name: 'Select Shared foundation 1.0' })).not.toBeChecked();
  expect(mocks.apply).not.toHaveBeenCalled();
});

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
  await waitFor(() =>
    expect(mocks.previewInputs).toContainEqual({
      candidateIds: ['provider'],
      workspaceId: 'workspace_branch:main',
      schemaEditCandidate: { candidateId: 'schema-edit', revision: 3 },
    })
  );
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
});

it('does not offer the selected candidate as its own comparison', () => {
  render(<SchemaStudioExperience projectId="p" />);
  expect(screen.queryByRole('option', { name: 'Shared foundation · 1.0' })).not.toBeInTheDocument();
  expect(screen.getByText('Create a Workspace to review and adopt this definition.')).toBeVisible();
});

it('opens the module workbench in a wide viewport-bounded dialog with a scrollable body', () => {
  render(
    <SchemaStudioExperience projectId="p">
      <div>Module workbench content</div>
    </SchemaStudioExperience>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add modules' }));
  const dialog = screen.getByRole('dialog', { name: 'Add modules' });
  expect(dialog).toHaveClass(moduleStyles.dialog);
  expect(
    within(dialog).getByText(/No separate Composition draft is created/).parentElement
  ).toHaveClass(moduleStyles.body);
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
  const select = screen.getByLabelText('Target Workspace');
  expect(select.querySelectorAll('option')).toHaveLength(1);
  expect(select).toHaveValue('workspace_branch:main');
  expect(select).toHaveTextContent('Main workspace');
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
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  const dialog = screen.getByRole('dialog', { name: 'Review Schema changes' });
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
  expect(screen.queryByRole('button', { name: 'Bind Schema' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  const dialog = screen.getByRole('dialog', { name: 'Apply exact definition' });
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish private Schema' }));
  expect(screen.getByRole('dialog', { name: 'Publish private Schema' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Publish private version' })).toBeEnabled();
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
  expect(screen.getByLabelText('Target Workspace')).toHaveValue('workspace_branch:main');
  await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
  expect(mocks.saveDraft).toHaveBeenCalledWith(
    'p',
    'workspace_branch:main',
    expect.objectContaining({ targetBranch: 'main', title: 'Main workspace', status: 'draft' })
  );
  expect(mocks.refresh).toHaveBeenCalled();
});
