import { ConflictError } from '@t3x-dev/storage';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  closeDB: vi.fn(() => Promise.resolve()),
  getDB: vi.fn(() => Promise.resolve({})),
}));

const storageMock = vi.hoisted(() => {
  let workspaceDraft: Record<string, unknown> | null = null;
  const commitRecord = (hash: string, overrides: Record<string, unknown> = {}) => ({
    hash,
    schema: 't3x/commit',
    parents: [],
    author: { type: 'human', name: 'api' },
    committed_at: '2026-07-03T00:00:00.000Z',
    content: { trees: [], relations: [] },
    project_id: 'proj_sources',
    message: 'Existing commit',
    branch: 'main',
    provenance: { method: 'human_curation' },
    ...overrides,
  });

  return {
    reset: () => {
      workspaceDraft = null;
    },
    findMaterialsByProject: vi.fn(() => Promise.resolve([])),
    findProjectById: vi.fn((_db, projectId: string) =>
      Promise.resolve({ projectId, ownerId: null })
    ),
    findBranchByName: vi.fn((_db, _projectId: string, name: string) =>
      Promise.resolve({ name, parentBranch: name === 'main' ? null : 'main' })
    ),
    findWorkspaceDraft: vi.fn((_db, projectId: string, workspaceId: string) =>
      Promise.resolve(
        workspaceDraft
          ? {
              id: 'draft_workspace',
              project_id: projectId,
              workspace_id: workspaceId,
              workspace_state: workspaceDraft,
              title: 'PRD audience handoff',
              status: 'editing',
              revision: 1,
              nodes: [],
              constraints: [],
              created_at: '2026-07-03T00:00:00.000Z',
              updated_at: '2026-07-03T00:00:00.000Z',
            }
          : null
      )
    ),
    listWorkspaceDrafts: vi.fn((_db, projectId: string) =>
      Promise.resolve(
        workspaceDraft
          ? [
              {
                id: 'draft_workspace',
                project_id: projectId,
                workspace_id: 'workspace_prd_handoff',
                workspace_state: workspaceDraft,
                title: 'PRD audience handoff',
                status: 'editing',
                revision: 1,
                nodes: [],
                constraints: [],
                created_at: '2026-07-03T00:00:00.000Z',
                updated_at: '2026-07-03T00:00:00.000Z',
              },
            ]
          : []
      )
    ),
    upsertWorkspaceDraft: vi.fn(
      (
        _db,
        input: { workspace_id: string; workspace_state: Record<string, unknown> },
        _ifRevision?: number
      ) => {
        workspaceDraft = input.workspace_state;
        return Promise.resolve({
          id: 'draft_workspace',
          project_id: 'proj_sources',
          workspace_id: input.workspace_id,
          workspace_state: workspaceDraft,
          title: 'PRD audience handoff',
          status: 'editing',
          revision: 1,
          nodes: [],
          constraints: [],
          created_at: '2026-07-03T00:00:00.000Z',
          updated_at: '2026-07-03T00:00:00.000Z',
        });
      }
    ),
    createCommit: vi.fn(() =>
      Promise.resolve({
        hash: 'sha256:workspace-commit',
        schema: 't3x/commit',
        parents: ['sha256:review-base'],
        author: { type: 'human', name: 'api' },
        committed_at: '2026-07-03T00:00:00.000Z',
        content: { trees: [], relations: [] },
        project_id: 'proj_sources',
        message: 'Workspace commit: PRD audience handoff',
        branch: 'feature/reviewed-prd',
        provenance: { method: 'human_curation' },
      })
    ),
    getCommit: vi.fn((_db, hash: string) =>
      Promise.resolve(
        hash === 'sha256:review-base' || hash === 'sha256:base' ? commitRecord(hash) : null
      )
    ),
    getLatestCommit: vi.fn(() => Promise.resolve(null)),
    updateBranchHead: vi.fn(() => Promise.resolve({ name: 'feature/reviewed-prd' })),
    insertYOpsLogEntry: vi.fn(() =>
      Promise.resolve({
        id: 'yl_workspace',
        projectId: 'proj_sources',
        conversationId: 'conv_prd',
        source: 'workspace_draft',
        turnHash: null,
        yops: [],
        createdAt: '2026-07-03T00:00:00.000Z',
      })
    ),
  };
});

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    findMaterialsByProject: storageMock.findMaterialsByProject,
    findProjectById: storageMock.findProjectById,
    findBranchByName: storageMock.findBranchByName,
    findWorkspaceDraft: storageMock.findWorkspaceDraft,
    getCommit: storageMock.getCommit,
    getLatestCommit: storageMock.getLatestCommit,
    updateBranchHead: storageMock.updateBranchHead,
    createCommit: storageMock.createCommit,
    insertYOpsLogEntry: storageMock.insertYOpsLogEntry,
    listWorkspaceDrafts: storageMock.listWorkspaceDrafts,
    upsertWorkspaceDraft: storageMock.upsertWorkspaceDraft,
  };
});

import { workspaceRoutes } from '../routes/workspaces.openapi';

// biome-ignore lint/suspicious/noExplicitAny: route responses are intentionally schema-flexible here.
type ApiResponse = any;

describe('Workspace routes', () => {
  const app = new Hono();
  const esphomeDeviceSchemaHash =
    'sha256:4dadbf6d65b4bd1f0310be317b9b0cfb90edfbcf293fe1d8bc60a0b07f05675d';
  const esphomeYamlSource = {
    id: 'src_yaml',
    type: 'document',
    title: 'Device YAML',
    previewText: [
      'esphome:',
      '  name: office-lunch-demo',
      'esp32:',
      '  board: esp32dev',
      'logger: {}',
      'api: {}',
      'sensor:',
      '  - platform: uptime',
      '    name: Office Lunch Demo Uptime',
    ].join('\n'),
  };

  app.route('/', workspaceRoutes);

  beforeEach(() => {
    storageMock.reset();
    storageMock.findMaterialsByProject.mockClear();
    storageMock.findProjectById.mockClear();
    storageMock.findBranchByName.mockClear();
    storageMock.findWorkspaceDraft.mockClear();
    storageMock.createCommit.mockClear();
    storageMock.updateBranchHead.mockClear();
    storageMock.getCommit.mockClear();
    storageMock.getLatestCommit.mockClear();
    storageMock.insertYOpsLogEntry.mockClear();
    storageMock.listWorkspaceDrafts.mockClear();
    storageMock.upsertWorkspaceDraft.mockClear();
  });

  it('rejects client-supplied trust facts on Transition review requests', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/transition/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { trees: [], relations: [] },
          actor: { kind: 'human', id: 'attacker-controlled' },
        }),
      }
    );

    expect(res.status).toBe(400);
    expect(storageMock.findWorkspaceDraft).not.toHaveBeenCalled();
  });

  it('extracts schema candidates from each source instead of a single merged text blob', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [
            {
              id: 'src_old',
              type: 'document',
              title: 'Old PRD',
              previewText: [
                'Problem: Old problem',
                'Audience: Old reviewers',
                'Outcome: Old outcome',
                'Requirement: Old requirement',
                'Priority: should',
                'Acceptance: Old acceptance',
              ].join('\n'),
            },
            {
              id: 'src_new',
              type: 'document',
              title: 'New PRD',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: must',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);

    const fields = body.data.workspace.schemaCandidate.fields;
    const summary = fields.find((field: ApiResponse) => field.path === 'summary');
    const problem = summary.children.find((field: ApiResponse) => field.path === 'summary.problem');
    const audience = summary.children.find(
      (field: ApiResponse) => field.path === 'summary.audience'
    );
    expect(problem.value).toBe('New problem');
    expect(audience.evidence).toBe('New PRD: New reviewers');

    const requirements = fields.find((field: ApiResponse) => field.path === 'requirements');
    expect(requirements.children).toHaveLength(2);
    expect(requirements.children.map((field: ApiResponse) => field.path)).toEqual([
      'requirements.old_requirement',
      'requirements.new_requirement',
    ]);
    expect(requirements.children[1].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requirements.new_requirement.priority',
          value: 'must',
          evidence: 'New PRD: must',
        }),
      ])
    );
  });

  it('rejects a bound built-in Schema version that is unavailable at runtime', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_version_mismatch/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_version_mismatch',
            projectId: 'proj_sources',
            schemaBindings: [
              {
                canonicalName: 't3x/skill',
                schemaName: 'Skill Schema',
                version: 'v999',
                mode: 'pinned',
              },
            ],
            sourceBundle: [],
          },
          sources: [],
        }),
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('t3x/skill v999'),
      },
    });
  });

  it('does not run ESPHome Device extraction for unsupported release versions', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_esphome_version_mismatch/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_esphome_version_mismatch',
            projectId: 'proj_sources',
            schemaBindings: [
              {
                canonicalName: 't3x/esphome-device',
                schemaHash: esphomeDeviceSchemaHash,
                schemaName: 'ESPHome Device',
                version: 'v999',
                mode: 'pinned',
              },
            ],
            sourceBundle: [],
          },
          sources: [esphomeYamlSource],
        }),
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('t3x/esphome-device v999'),
      },
    });
  });

  it('does not run ESPHome Device extraction for mismatched schema hashes', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_esphome_hash_mismatch/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_esphome_hash_mismatch',
            projectId: 'proj_sources',
            schemaBindings: [
              {
                canonicalName: 't3x/esphome-device',
                schemaHash: `sha256:${'0'.repeat(64)}`,
                schemaName: 'ESPHome Device',
                version: 'v1',
                mode: 'pinned',
              },
            ],
            sourceBundle: [],
          },
          sources: [esphomeYamlSource],
        }),
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('t3x/esphome-device v1'),
      },
    });
  });

  it('materializes ESPHome Device YAML source into device state and object-valued YOps', async () => {
    const binding = {
      canonicalName: 't3x/esphome-device',
      schemaHash: esphomeDeviceSchemaHash,
      schemaName: 'ESPHome Device',
      version: 'v1',
      mode: 'pinned',
    };
    const device = {
      esphome: { name: 'office-lunch-demo' },
      esp32: { board: 'esp32dev' },
      logger: {},
      api: {},
      sensor: [{ platform: 'uptime', name: 'Office Lunch Demo Uptime' }],
    };
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_esphome_device/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_esphome_device',
            projectId: 'proj_sources',
            title: 'ESPHome workspace',
            targetBranch: 'main',
            schemaBindings: [binding],
            sourceBundle: [],
          },
          sources: [
            esphomeYamlSource,
            {
              id: 'src_notes',
              type: 'text',
              title: 'Notes',
              previewText: 'This source is ordinary prose and should not replace the YAML device.',
            },
          ],
        }),
      }
    );

    expect(extractRes.status).toBe(200);
    const extractBody: ApiResponse = await extractRes.json();
    expect(extractBody.data.workspace.device).toEqual(device);
    expect(extractBody.data.workspace.schemaReview).toEqual(
      expect.objectContaining({ verdict: 'ready', gaps: [] })
    );
    expect(extractBody.data.workspace.yopsDraft.operations).toEqual([
      expect.objectContaining({
        op: 'set',
        path: 'device',
        afterValue: device,
        sourceRefs: ['src_yaml'],
      }),
    ]);
    expect(storageMock.upsertWorkspaceDraft.mock.calls.at(-1)?.[1].workspace_state.device).toEqual(
      device
    );

    const yopsRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_esphome_device/yops-draft',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: { id: 'workspace_esphome_device' },
          if_revision: extractBody.data.workspace.revision,
        }),
      }
    );

    expect(yopsRes.status).toBe(200);
    const yopsBody: ApiResponse = await yopsRes.json();
    expect(yopsBody.data.workspace.yopsDraft.operations).toEqual([
      expect.objectContaining({
        op: 'set',
        path: 'device',
        afterValue: device,
      }),
    ]);
  });

  it('rejects ESPHome Device YAML without esphome.name', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_esphome_invalid/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_esphome_invalid',
            projectId: 'proj_sources',
            schemaBindings: [
              {
                schemaName: 'ESPHome Device',
                mode: 'pinned',
              },
            ],
            sourceBundle: [],
          },
          sources: [
            {
              id: 'src_invalid_yaml',
              type: 'document',
              title: 'Missing name',
              previewText: ['esp32:', '  board: esp32dev'].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'ESPHome Device requires esphome.name.',
      },
    });
  });

  it('persists a complete Prompt binding and regenerates YOps under the Prompt root', async () => {
    const promptSchemaHash =
      'sha256:1d05f6c4ae0aeef34f15714e166377e4fd4c08644c885a2ddc7c2e50bf39f930';
    const binding = {
      canonicalName: 't3x/prompt',
      schemaHash: promptSchemaHash,
      schemaName: 'Prompt Schema',
      version: 'v1',
      mode: 'pinned',
    };
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'Prompt workspace',
            targetBranch: 'main',
            schemaBindings: [binding],
            sourceBundle: [],
            schemaReview: {
              verdict: 'needs_review',
              summary: 'Regenerate against Prompt Schema.',
              gaps: ['Prompt candidate is stale.'],
            },
            yopsDraft: {
              id: 'draft:stale-prompt',
              operations: [{ id: 'old-op', op: 'set', path: 'skill/manifest/name' }],
            },
          },
          sources: [
            {
              id: 'src_prompt',
              type: 'document',
              title: 'Prompt definition',
              previewText: [
                'name: source-backed-summary',
                'summary: Summarize supplied source evidence.',
                'goal: Produce a concise source-backed summary.',
                'inputs: Source material',
                'outputs: Markdown summary',
                'non goals: Invent unsupported claims',
                'truth policy: evidence_only',
                'sequence: 1',
                'role: user',
                'template: Summarize {{source_material}}',
                'purpose: Request a grounded summary',
                'optional: false',
                'on missing variable: report_and_stop',
                'mode: chat',
                'response format: markdown',
                'streaming: false',
                'tool policy: none',
                'format: markdown',
                'strict: true',
                'on parse failure: report_and_stop',
                'kind: template_compile',
                'run when: pre_compile',
                'blocking: true',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(extractRes.status).toBe(200);
    const extractBody: ApiResponse = await extractRes.json();
    expect(extractBody.data.workspace.schemaBindings).toEqual([binding]);
    expect(extractBody.data.workspace.schemaCandidate.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'manifest' }),
        expect.objectContaining({ path: 'messages' }),
        expect.objectContaining({ path: 'runtime' }),
        expect.objectContaining({ path: 'output' }),
      ])
    );

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.schemaBindings).toEqual([binding]);

    const yopsRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/yops-draft',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: { id: 'workspace_prd_handoff' },
          if_revision: extractBody.data.workspace.revision,
        }),
      }
    );

    expect(yopsRes.status).toBe(200);
    const yopsBody: ApiResponse = await yopsRes.json();
    expect(yopsBody.data.workspace.yopsDraft.operations.length).toBeGreaterThan(0);
    expect(
      yopsBody.data.workspace.yopsDraft.operations.every((operation: ApiResponse) =>
        operation.path.startsWith('prompt/')
      )
    ).toBe(true);
    expect(storageMock.createCommit).not.toHaveBeenCalled();
  });

  it('merges complementary evidence for the same repeated requirement', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [
            {
              id: 'src_requirement',
              type: 'document',
              title: 'Requirement source',
              previewText: [
                'Problem: Users cannot recover failed checkouts',
                'Audience: Checkout customers',
                'Outcome: More customers complete checkout',
                'Requirement: Retry eligible failed payments',
                'Priority: must',
              ].join('\n'),
            },
            {
              id: 'src_acceptance',
              type: 'document',
              title: 'Acceptance source',
              previewText: [
                'Requirement: Retry eligible failed payments',
                'Acceptance: An eligible failed payment is retried exactly once after 30 minutes',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    const requirements = body.data.workspace.schemaCandidate.fields.find(
      (field: ApiResponse) => field.path === 'requirements'
    );

    expect(requirements.children).toHaveLength(1);
    expect(requirements.children[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requirements.retry_eligible_failed_payments.priority',
          value: 'must',
          evidence: 'Requirement source: must',
        }),
        expect.objectContaining({
          path: 'requirements.retry_eligible_failed_payments.acceptance',
          value: 'An eligible failed payment is retried exactly once after 30 minutes',
          evidence:
            'Acceptance source: An eligible failed payment is retried exactly once after 30 minutes',
        }),
      ])
    );
    expect(body.data.workspace.schemaReview).toEqual(
      expect.objectContaining({ verdict: 'ready', gaps: [] })
    );
  });

  it('persists extract state and builds YOps from stored workspace state', async () => {
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'PRD audience handoff',
            targetBranch: 'feature/prd-audience',
            baseCommitHash: 'sha256:base',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
            yopsDraft: { id: 'draft_empty', operations: [] },
          },
          sources: [
            {
              id: 'src_new',
              type: 'document',
              title: 'New PRD',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: must',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(extractRes.status).toBe(200);
    const extractBody: ApiResponse = await extractRes.json();
    expect(extractBody.data.workspace.revision).toBe(1);
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        title: 'PRD audience handoff',
        parent_commit_hash: 'sha256:base',
        target_branch: 'feature/prd-audience',
      }),
      undefined
    );

    const yopsRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/yops-draft',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: { id: 'workspace_prd_handoff' },
          if_revision: extractBody.data.workspace.revision,
        }),
      }
    );

    expect(yopsRes.status).toBe(200);
    const yopsBody: ApiResponse = await yopsRes.json();
    expect(yopsBody.data.workspace.schemaCandidate.fields.length).toBeGreaterThan(0);
    expect(yopsBody.data.workspace.yopsDraft.operations.length).toBeGreaterThan(0);
    expect(yopsBody.data.workspace.backendCandidateId).toBe(extractBody.data.candidate_id);
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      1
    );
  });

  it('lists and reads persisted workspace state', async () => {
    await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'PRD audience handoff',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [],
        }),
      }
    );

    const listRes = await app.request('/v1/projects/proj_sources/workspaces');
    expect(listRes.status).toBe(200);
    const listBody: ApiResponse = await listRes.json();
    expect(listBody.data.workspaces[0].id).toBe('workspace_prd_handoff');
    expect(listBody.data.workspaces[0].revision).toBe(1);

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.id).toBe('workspace_prd_handoff');
    expect(getBody.data.workspace.revision).toBe(1);
  });

  it('saves reviewed workspace draft state for later recovery', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'client_side_id_is_ignored',
          projectId: 'client_project_is_ignored',
          revision: 999,
          title: 'Reviewed PRD workspace',
          status: 'schema_review',
          updatedAt: '2026-01-01T00:00:00.000Z',
          targetBranch: 'feature/reviewed-prd',
          baseCommitHash: 'sha256:review-base',
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          schemaCandidate: {
            summary: 'User reviewed candidate.',
            fields: [],
          },
          schemaReview: {
            verdict: 'ready',
            summary: 'Ready after user review.',
            gaps: [],
          },
          yopsDraft: {
            id: 'draft:reviewed',
            operations: [],
          },
          outputTargets: [],
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        id: 'workspace_prd_handoff',
        projectId: 'proj_sources',
        title: 'Reviewed PRD workspace',
        status: 'schema_review',
        revision: 1,
      })
    );
    expect(body.data.workspace.updatedAt).toEqual(expect.any(String));
    expect(body.data.workspace.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(body.data.workspace.updatedAt))).toBe(false);
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        title: 'Reviewed PRD workspace',
        parent_commit_hash: 'sha256:review-base',
        target_branch: 'feature/reviewed-prd',
      }),
      undefined
    );
    expect(
      storageMock.upsertWorkspaceDraft.mock.calls.at(-1)?.[1].workspace_state
    ).not.toHaveProperty('revision');

    const getRes = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff');
    expect(getRes.status).toBe(200);
    const getBody: ApiResponse = await getRes.json();
    expect(getBody.data.workspace.schemaCandidate.summary).toBe('User reviewed candidate.');
  });

  it('maps workspace write conflicts to 409', async () => {
    const conflicts = [
      {
        error: Object.assign(new Error('duplicate open workspace'), {
          code: '23505',
          constraint: 'idx_drafts_open_workspace_branch',
        }),
        code: 'CONFLICT',
      },
      {
        error: new ConflictError('draft_workspace', 1),
        code: 'CONFLICT',
      },
      {
        error: Object.assign(new Error('duplicate workspace id'), {
          code: '23505',
          constraint_name: 'idx_drafts_workspace',
        }),
        code: 'CONFLICT',
      },
    ];

    for (const conflict of conflicts) {
      storageMock.upsertWorkspaceDraft.mockRejectedValueOnce(conflict.error);

      const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_conflict', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_conflict',
            projectId: 'proj_sources',
            status: 'draft',
            targetBranch: 'main',
          },
        }),
      });

      expect(res.status).toBe(409);
      const body: ApiResponse = await res.json();
      expect(body.error.code).toBe(conflict.code);
    }
  });

  it('rejects workspace state for a branch that is not registered', async () => {
    storageMock.findBranchByName.mockResolvedValueOnce(null);

    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_phantom', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_phantom',
          projectId: 'proj_sources',
          status: 'draft',
          targetBranch: 'feature/prd-audience',
        },
      }),
    });

    expect(res.status).toBe(404);
    const body: ApiResponse = await res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Target branch not found: feature/prd-audience',
      },
    });
    expect(storageMock.upsertWorkspaceDraft).not.toHaveBeenCalled();
  });

  it('preserves backend workspace metadata when saving reviewed state', async () => {
    const extractRes = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'Backend extracted workspace',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
            yopsDraft: { id: 'draft:stable-extracted', operations: [] },
          },
          sources: [
            {
              id: 'src_backend',
              type: 'document',
              title: 'Backend source',
              previewText: 'Problem: Backend extracted problem',
            },
          ],
        }),
      }
    );
    const extractBody: ApiResponse = await extractRes.json();
    const extractedCandidateId = extractBody.data.candidate_id;

    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Reviewed without backend fields',
          backendCandidateId: 'candidate:client-forged',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:stable-extracted', operations: [] },
        },
        if_revision: extractBody.data.workspace.revision,
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.candidate_id).toBe(extractedCandidateId);
    expect(body.data.workspace.backendCandidateId).toBe(extractedCandidateId);
  });

  it('does not let review saves mark the workspace committed', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Reviewed but not committed',
          status: 'committed',
          lastCommitHash: 'sha256:client-forged-commit',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:review-save', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('schema_review');
    expect(body.data.workspace.lastCommitHash).toBeUndefined();
  });

  it('reopens a committed workspace when regenerating a YOps draft', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/yops-draft',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'Committed PRD workspace',
            status: 'committed',
            lastCommitHash: 'sha256:committed-workspace',
            baseCommitHash: 'sha256:old-base',
            targetBranch: 'feature/reviewed-prd',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
            schemaCandidate: {
              fields: [
                {
                  id: 'field_summary',
                  path: 'summary',
                  status: 'covered',
                  children: [
                    {
                      id: 'field_summary_problem',
                      path: 'summary.problem',
                      status: 'covered',
                      type: 'string',
                      value: 'Committed problem',
                    },
                  ],
                },
              ],
            },
            yopsDraft: { id: 'draft:committed', operations: [] },
          },
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('schema_review');
    expect(body.data.workspace.lastCommitHash).toBeUndefined();
    expect(body.data.workspace.baseCommitHash).toBe('sha256:committed-workspace');
    expect(body.data.workspace.yopsDraft.operations).toEqual([
      expect.objectContaining({
        op: 'set',
        path: 'prd/summary/problem',
        afterValue: 'Committed problem',
      }),
    ]);
  });

  it('reopens a committed workspace when extracting a fresh candidate', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            title: 'Committed PRD workspace',
            status: 'committed',
            lastCommitHash: 'sha256:committed-workspace',
            baseCommitHash: 'sha256:old-base',
            targetBranch: 'feature/reviewed-prd',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
            yopsDraft: { id: 'draft:committed', operations: [] },
          },
          sources: [
            {
              id: 'src_new',
              type: 'document',
              title: 'New source',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: should',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('schema_review');
    expect(body.data.workspace.lastCommitHash).toBeUndefined();
    expect(body.data.workspace.baseCommitHash).toBe('sha256:committed-workspace');
    expect(body.data.workspace.schemaCandidate.fields.length).toBeGreaterThan(0);
  });

  it('normalizes invalid review save statuses before persisting', async () => {
    const res = await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Invalid status workspace',
          status: 'not_a_real_workspace_status',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [],
          yopsDraft: { id: 'draft:invalid-status', operations: [] },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.workspace.status).toBe('draft');
  });

  it('creates a commit and marks the workspace staged state committed', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:review-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [
            {
              conversationId: 'conv_prd',
              id: 'source_chat:conv_prd',
              type: 'chat',
              title: 'Reviewed source',
            },
          ],
          yopsDraft: {
            id: 'draft:reviewed',
            operations: [
              {
                afterValue: 'PRD audience handoff',
                id: 'op_backend_1',
                op: 'set',
                path: 'prd/title',
                summary: 'Set title',
              },
            ],
          },
        },
      }),
    });

    const commitPath = '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit';
    const content = {
      trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
      relations: [],
    };
    const stale = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 999 }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'CONFLICT' }) })
    );
    expect(storageMock.insertYOpsLogEntry).not.toHaveBeenCalled();
    expect(storageMock.createCommit).not.toHaveBeenCalled();
    expect(storageMock.updateBranchHead).not.toHaveBeenCalled();

    const res = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 1 }),
    });

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.commit.hash).toBe('sha256:workspace-commit');
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        id: 'workspace_prd_handoff',
        projectId: 'proj_sources',
        status: 'committed',
        lastCommitHash: 'sha256:workspace-commit',
      })
    );
    expect(storageMock.insertYOpsLogEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId: 'conv_prd',
        projectId: 'proj_sources',
        source: 'workspace_draft',
        yops: [
          expect.objectContaining({
            set: { path: 'prd/title', value: 'PRD audience handoff' },
          }),
        ],
      })
    );
    expect(storageMock.createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        author: { name: 'api', type: 'human' },
        branch: 'feature/reviewed-prd',
        content: {
          trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
          relations: [],
        },
        enforceBranchLinearity: true,
        message: 'Workspace commit: PRD audience handoff',
        parents: ['sha256:review-base'],
        project_id: 'proj_sources',
        provenance: { method: 'human_curation', schema_ref: { name: 't3x/prd' } },
        sources: [{ id: 'conv_prd', title: 'Reviewed source', type: 'conversation' }],
        yops_log_ids: ['yl_workspace'],
      })
    );
    expect(storageMock.updateBranchHead).toHaveBeenCalledWith(
      expect.anything(),
      'proj_sources',
      'feature/reviewed-prd',
      'sha256:workspace-commit'
    );
    expect(storageMock.upsertWorkspaceDraft).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        project_id: 'proj_sources',
        workspace_id: 'workspace_prd_handoff',
        workspace_state: expect.objectContaining({
          status: 'committed',
          lastCommitHash: 'sha256:workspace-commit',
        }),
      }),
      1
    );
  });

  it('requires explicit confirmation for schema review gaps and audits the override', async () => {
    const blocker = 'Schema review gap: requirements.trip.acceptance';
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'Trip PRD with a review gap',
          status: 'schema_review',
          targetBranch: 'feature/trip-prd',
          sourceBundle: [{ id: 'source_chat:conv_prd', type: 'chat', title: 'Trip source' }],
          schemaReview: {
            verdict: 'needs_review',
            summary: 'Acceptance criteria are incomplete.',
            gaps: ['requirements.trip.acceptance'],
          },
          yopsDraft: { id: 'draft:trip', operations: [] },
        },
      }),
    });
    const content = {
      trees: [
        {
          key: 'prd',
          slots: { title: 'Trip PRD' },
          children: [
            {
              key: 'requirements',
              slots: {},
              children: [{ key: 'trip', slots: {}, children: [] }],
            },
          ],
        },
      ],
      relations: [],
    };
    const commitPath = '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit';

    const blocked = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, if_revision: 1 }),
    });

    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'REVIEW_REQUIRED',
          details: { blockers: [blocker] },
        }),
      })
    );
    expect(storageMock.createCommit).not.toHaveBeenCalled();

    const validationOverride = {
      kind: 'schema_review',
      reason: 'User explicitly confirmed unresolved schema review gaps.',
      blockers: [blocker],
    };
    const committed = await app.request(commitPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, validationOverride, if_revision: 1 }),
    });

    expect(committed.status).toBe(200);
    const body: ApiResponse = await committed.json();
    expect(body.data.workspace.commitOverride).toEqual(expect.objectContaining(validationOverride));
    expect(storageMock.createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provenance: {
          method: 'human_curation',
          validation_override: validationOverride,
        },
      })
    );
  });

  it('rejects a feature workspace base when committing to an empty main branch', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:feature-base',
          targetBranch: 'main',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    storageMock.getCommit.mockResolvedValueOnce({
      hash: 'sha256:feature-base',
      schema: 't3x/commit',
      parents: [],
      author: { type: 'human', name: 'api' },
      committed_at: '2026-07-03T00:00:00.000Z',
      content: { trees: [], relations: [] },
      project_id: 'proj_sources',
      message: 'Feature commit',
      branch: 'feature/prd-audience',
      provenance: { method: 'human_curation' },
      yops_log_ids: [],
    });

    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
            relations: [],
          },
          if_revision: 1,
        }),
      }
    );

    expect(res.status).toBe(409);
    const body: ApiResponse = await res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'WORKSPACE_BASE_BRANCH_MISMATCH',
        message:
          'Workspace base commit sha256:feature-base belongs to feature/prd-audience, but the commit target is main. Rebuild the workspace from main before committing.',
        details: {
          base_branch: 'feature/prd-audience',
          base_commit_hash: 'sha256:feature-base',
          target_branch: 'main',
        },
      },
    });
    expect(storageMock.createCommit).not.toHaveBeenCalled();
  });

  it('uses the current branch head instead of a stale workspace base commit', async () => {
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:stale-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    storageMock.getLatestCommit.mockImplementation((_db, projectId: string, branch: string) =>
      Promise.resolve(
        projectId === 'proj_sources' && branch === 'feature/reviewed-prd'
          ? {
              hash: 'sha256:feature-head',
              schema: 't3x/commit',
              parents: ['sha256:review-base'],
              author: { type: 'human', name: 'api' },
              committed_at: '2026-07-03T00:00:00.000Z',
              content: { trees: [{ key: 'old-prd' }], relations: [] },
              project_id: 'proj_sources',
              message: 'Previous workspace commit',
              branch: 'feature/reviewed-prd',
              provenance: { method: 'human_curation' },
            }
          : null
      )
    );

    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
            relations: [],
          },
          if_revision: 1,
        }),
      }
    );

    expect(res.status).toBe(200);
    expect(storageMock.createCommit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        branch: 'feature/reviewed-prd',
        parents: ['sha256:feature-head'],
      })
    );
  });

  it('marks an already materialized branch head committed without creating another commit', async () => {
    const committedContent = {
      trees: [{ key: 'prd', slots: { title: 'PRD audience handoff' }, children: [] }],
      relations: [],
    };
    await app.request('/v1/projects/proj_sources/workspaces/workspace_prd_handoff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: {
          id: 'workspace_prd_handoff',
          projectId: 'proj_sources',
          title: 'PRD audience handoff',
          status: 'schema_review',
          baseCommitHash: 'sha256:stale-base',
          targetBranch: 'feature/reviewed-prd',
          schemaBindings: [{ schemaName: 'PRD Schema v2' }],
          sourceBundle: [{ id: 'src_1', type: 'document', title: 'Reviewed source' }],
          yopsDraft: { id: 'draft:reviewed', operations: [] },
        },
      }),
    });
    storageMock.createCommit.mockClear();
    storageMock.getLatestCommit.mockImplementation((_db, projectId: string, branch: string) =>
      Promise.resolve(
        projectId === 'proj_sources' && branch === 'feature/reviewed-prd'
          ? {
              hash: 'sha256:feature-head',
              schema: 't3x/commit',
              parents: ['sha256:review-base'],
              author: { type: 'human', name: 'api' },
              committed_at: '2026-07-03T00:00:00.000Z',
              content: committedContent,
              project_id: 'proj_sources',
              message: 'Previous workspace commit',
              branch: 'feature/reviewed-prd',
              provenance: { method: 'human_curation' },
            }
          : null
      )
    );

    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: committedContent, if_revision: 1 }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.data.commit.hash).toBe('sha256:feature-head');
    expect(body.data.workspace).toEqual(
      expect.objectContaining({
        status: 'committed',
        lastCommitHash: 'sha256:feature-head',
      })
    );
    expect(storageMock.createCommit).not.toHaveBeenCalled();
    expect(storageMock.updateBranchHead).toHaveBeenCalledWith(
      expect.anything(),
      'proj_sources',
      'feature/reviewed-prd',
      'sha256:feature-head'
    );
  });
});
