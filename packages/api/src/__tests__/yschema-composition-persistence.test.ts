/** biome-ignore-all lint/suspicious/noExplicitAny: route assertions inspect JSON response envelopes */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  closeDB: vi.fn(() => Promise.resolve()),
  getDB: vi.fn(() => Promise.resolve({})),
}));

const storageMock = vi.hoisted(() => {
  let workspaceState: Record<string, unknown> = {};
  let workspaceRevision = 4;

  const draft = () => ({
    id: 'draft_workspace_modules',
    project_id: 'proj_modules',
    workspace_id: 'workspace_modules',
    workspace_state: workspaceState,
    title: 'Module Workspace',
    status: 'editing',
    revision: workspaceRevision,
    nodes: [],
    constraints: [],
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  });

  return {
    reset() {
      workspaceState = {
        id: 'workspace_modules',
        projectId: 'proj_modules',
        title: 'Module Workspace',
        summary: 'Preserve this Workspace state.',
        targetBranch: 'main',
        status: 'schema_review',
        schemaBindings: [{ canonicalName: 't3x/prd', schemaName: 'PRD Schema', version: 'v2' }],
        schemaCandidate: { summary: 'Old candidate', fields: [{ path: 'summary.problem' }] },
        schemaReview: { verdict: 'ready', summary: 'Old review', gaps: [] },
        yopsDraft: { id: 'draft:old', operations: [{ id: 'op_old' }] },
        commitOverride: { kind: 'schema_review', reason: 'old', blockers: ['old'] },
      };
      workspaceRevision = 4;
    },
    findProjectById: vi.fn((_db, projectId: string) =>
      Promise.resolve({ projectId, ownerId: null })
    ),
    findWorkspaceDraft: vi.fn(() => Promise.resolve(draft())),
    upsertWorkspaceDraft: vi.fn(
      (_db, input: { workspace_state: Record<string, unknown> }, ifRevision?: number) => {
        if (ifRevision !== workspaceRevision) {
          return Promise.reject(new Error(`unexpected revision ${ifRevision}`));
        }
        workspaceState = input.workspace_state;
        workspaceRevision += 1;
        return Promise.resolve(draft());
      }
    ),
    saveYSchemaCompositionSnapshot: vi.fn((_db, input) => Promise.resolve(input)),
    publishYSchemaArtifactVersion: vi.fn((_db, input) =>
      Promise.resolve({ manifest: input.manifest_json })
    ),
    listProjectYSchemaVersionHistory: vi.fn(() => Promise.resolve([])),
    updateYSchemaArtifactIdentity: vi.fn((_db, input) =>
      Promise.resolve({
        artifactId: input.artifact_id,
        manifest: {
          apiVersion: 't3x.dev/yschema-blueprint/v1',
          canonicalName: 'projects/proj_modules/schema',
          version: '1.0.0',
          title: input.display_name ?? 'Module Workspace Schema',
        },
      })
    ),
    state: () => workspaceState,
  };
});

vi.mock('@t3x-dev/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t3x-dev/storage')>();
  return {
    ...actual,
    findProjectById: storageMock.findProjectById,
    findWorkspaceDraft: storageMock.findWorkspaceDraft,
    listProjectYSchemaVersionHistory: storageMock.listProjectYSchemaVersionHistory,
    publishYSchemaArtifactVersion: storageMock.publishYSchemaArtifactVersion,
    saveYSchemaCompositionSnapshot: storageMock.saveYSchemaCompositionSnapshot,
    upsertWorkspaceDraft: storageMock.upsertWorkspaceDraft,
    updateYSchemaArtifactIdentity: storageMock.updateYSchemaArtifactIdentity,
  };
});

vi.mock('../lib/yschema-artifact-registry', async () => {
  const { builtInPrdCoreArtifact, builtInPrdModules } = await import('@t3x-dev/yschema');
  return {
    artifactViewToManifest: (view: { manifest: Record<string, unknown> }) => view.manifest,
    ensureBuiltInYSchemaArtifacts: vi.fn(() => Promise.resolve()),
    resolveCompositionArtifacts: vi.fn(() =>
      Promise.resolve({ core: builtInPrdCoreArtifact, modules: builtInPrdModules })
    ),
    resolveCompositionArtifactsV2: vi.fn(() =>
      Promise.resolve([
        {
          apiVersion: 't3x.dev/yschema-module/v2',
          canonicalName: 'team/problem',
          version: '1.0.0',
          title: 'Problem',
          description: 'Problem contract',
          status: 'active',
          source: 'team',
          tags: ['type:product'],
          compatibility: { yschema: ['0.1'] },
          provides: [],
          imports: [],
          contribution: { nodes: { problem: { slots: { statement: { type: 'string' } } } } },
        },
      ])
    ),
  };
});

import { yschemaCompositionRoutes } from '../routes/yschema-composition.openapi';

function composition(revision = 0) {
  return {
    apiVersion: 't3x.dev/yschema-composition/v1',
    id: 'composition:workspace_modules',
    revision,
    family: 'prd',
    status: 'draft',
    core: { canonicalName: 't3x/prd-core', version: '1.1.0' },
    modules: [
      {
        canonicalName: 't3x/prd-technology-stack',
        version: '1.0.0',
        order: 20,
      },
      {
        canonicalName: 't3x/prd-system-architecture',
        version: '1.0.0',
        order: 5,
      },
    ],
  };
}

function openComposition(revision = 0) {
  return {
    apiVersion: 't3x.dev/yschema-composition/v2',
    id: 'composition:workspace_modules',
    revision,
    status: 'draft',
    modules: [
      {
        canonicalName: 'team/problem',
        version: '1.0.0',
        presentationOrder: 10,
      },
    ],
  };
}

describe('Workspace YSchema Composition persistence', () => {
  const app = new Hono();
  app.route('/', yschemaCompositionRoutes);

  beforeEach(() => {
    storageMock.reset();
    vi.clearAllMocks();
  });

  it('reads an empty Composition slot from an existing Workspace', async () => {
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition'
    );
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data).toEqual({ composition: null, workspaceRevision: 4 });
  });

  it('normalizes, versions, and saves the Manifest without replacing Workspace state', async () => {
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: composition(), if_revision: 4 }),
      }
    );
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data.workspaceRevision).toBe(5);
    expect(body.data.composition.revision).toBe(1);
    expect(body.data.composition.modules).toMatchObject([
      { canonicalName: 't3x/prd-system-architecture', order: 10, slot: 'technical-design' },
      { canonicalName: 't3x/prd-technology-stack', order: 20, slot: 'technical-design' },
    ]);
    expect(body.data.preview.report).toEqual({ valid: true, issues: [] });
    expect(storageMock.state()).toMatchObject({
      summary: 'Preserve this Workspace state.',
      schemaComposition: { revision: 1 },
    });
  });

  it('rejects a stale Composition revision before overwriting the draft', async () => {
    await app.request('/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition: composition(), if_revision: 4 }),
    });
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: composition(0), if_revision: 5 }),
      }
    );
    expect(response.status).toBe(409);
    const body: any = await response.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details.expectedRevision).toBe(1);
  });

  it('publishes a saved verified Composition as an immutable Schema version', async () => {
    const savedResponse = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: composition(), if_revision: 4 }),
      }
    );
    const saved: any = await savedResponse.json();
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition/publish',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composition_revision: 1,
          composition_hash: saved.data.preview.compositionHash,
          canonical_name: 'projects/proj_modules/prd',
          version: '1.0.0',
          title: 'Module Workspace PRD',
          release_notes: 'Initial composed version.',
        }),
      }
    );

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data).toMatchObject({
      apiVersion: 't3x.dev/yschema-core/v1',
      canonicalName: 'projects/proj_modules/prd',
      version: '1.0.0',
      title: 'Module Workspace PRD',
      status: 'active',
    });
    expect(storageMock.publishYSchemaArtifactVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        owner_project_id: 'proj_modules',
        visibility: 'private',
        version: '1.0.0',
        status: 'active',
      })
    );
  });

  it('publishes an open Composition as a Blueprint-backed Schema rather than a Module', async () => {
    const savedResponse = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: openComposition(), if_revision: 4 }),
      }
    );
    const saved: any = await savedResponse.json();
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition/publish',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composition_revision: 1,
          composition_hash: saved.data.preview.compositionHash,
          canonical_name: 'projects/proj_modules/product-schema',
          version: '1.0.0',
          title: 'Product Schema',
          tags: ['product', 'team'],
        }),
      }
    );

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data).toMatchObject({
      apiVersion: 't3x.dev/yschema-blueprint/v1',
      canonicalName: 'projects/proj_modules/product-schema',
      version: '1.0.0',
      tags: ['product', 'team'],
      blueprint: {
        compositionApiVersion: 't3x.dev/yschema-composition/v2',
        modules: [
          expect.objectContaining({
            canonicalName: 'team/problem',
            version: '1.0.0',
            hash: expect.stringMatching(/^sha256:/),
          }),
        ],
      },
    });
    expect(storageMock.publishYSchemaArtifactVersion).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'schema', family: 'open' })
    );
  });

  it('lists the project-owned immutable Schema version history', async () => {
    storageMock.listProjectYSchemaVersionHistory.mockResolvedValueOnce([
      {
        manifest: {
          apiVersion: 't3x.dev/yschema-core/v1',
          canonicalName: 'projects/proj_modules/prd',
          version: '1.0.0',
          status: 'active',
        },
      },
    ]);

    const response = await app.request('/v1/projects/proj_modules/yschema/versions?family=prd');

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data.items).toEqual([
      expect.objectContaining({ canonicalName: 'projects/proj_modules/prd', version: '1.0.0' }),
    ]);
    expect(storageMock.listProjectYSchemaVersionHistory).toHaveBeenCalledWith(expect.anything(), {
      project_id: 'proj_modules',
      family: 'prd',
      kind: 'core',
    });
  });

  it('updates mutable Schema identity metadata without publishing a new version', async () => {
    const response = await app.request('/v1/projects/proj_modules/yschemas/schema_product', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        if_revision: 3,
        display_name: 'Product delivery Schema',
        description: 'Shared contract for the product team.',
        tags: ['product', 'team:delivery'],
      }),
    });

    expect(response.status).toBe(200);
    expect(storageMock.updateYSchemaArtifactIdentity).toHaveBeenCalledWith(expect.anything(), {
      artifact_id: 'schema_product',
      project_id: 'proj_modules',
      if_revision: 3,
      display_name: 'Product delivery Schema',
      description: 'Shared contract for the product team.',
      tags: ['product', 'team:delivery'],
    });
    expect(storageMock.publishYSchemaArtifactVersion).not.toHaveBeenCalled();
  });

  it('archives a Schema identity while retaining its immutable version history', async () => {
    const response = await app.request(
      '/v1/projects/proj_modules/yschemas/schema_product/archive',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ if_revision: 4 }),
      }
    );

    expect(response.status).toBe(200);
    expect(storageMock.updateYSchemaArtifactIdentity).toHaveBeenCalledWith(expect.anything(), {
      artifact_id: 'schema_product',
      project_id: 'proj_modules',
      if_revision: 4,
      lifecycle_status: 'archived',
    });
    expect(storageMock.publishYSchemaArtifactVersion).not.toHaveBeenCalled();
  });

  it('rejects duplicate order values instead of normalizing ambiguous input', async () => {
    const duplicated = composition();
    duplicated.modules[1].order = duplicated.modules[0].order;
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: duplicated, if_revision: 4 }),
      }
    );
    expect(response.status).toBe(400);
    const body: any = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('assigned more than once');
  });

  it('applies the exact verified Composition and invalidates stale proposals', async () => {
    const saveResponse = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: composition(), if_revision: 4 }),
      }
    );
    const saved: any = await saveResponse.json();
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          if_revision: 5,
          composition_revision: 1,
          composition_hash: saved.data.preview.compositionHash,
        }),
      }
    );

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.data.workspaceRevision).toBe(6);
    expect(body.data.binding).toMatchObject({
      canonicalName: 't3x/prd',
      compositionId: 'composition:workspace_modules',
      compositionRevision: 1,
      compositionHash: saved.data.preview.compositionHash,
      schemaHash: saved.data.preview.compiledSchemaHash,
      mode: 'draft_override',
    });
    expect(storageMock.state()).toMatchObject({
      summary: 'Preserve this Workspace state.',
      status: 'draft',
      schemaBindings: [body.data.binding],
      schemaCandidate: { fields: [] },
      schemaReview: { verdict: 'needs_review' },
      yopsDraft: { id: 'draft:old', operations: [] },
    });
    expect(storageMock.state()).not.toHaveProperty('commitOverride');
  });

  it('rejects a stale preview hash without changing the applied binding', async () => {
    await app.request('/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition: composition(), if_revision: 4 }),
    });
    const response = await app.request(
      '/v1/projects/proj_modules/workspaces/workspace_modules/schema-composition/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          if_revision: 5,
          composition_revision: 1,
          composition_hash: `sha256:${'0'.repeat(64)}`,
        }),
      }
    );

    expect(response.status).toBe(409);
    const body: any = await response.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(storageMock.state().schemaBindings).toEqual([
      { canonicalName: 't3x/prd', schemaName: 'PRD Schema', version: 'v2' },
    ]);
  });
});
