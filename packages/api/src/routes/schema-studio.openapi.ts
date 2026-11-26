import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AddStudioCandidateSchema,
  RepositorySchemaStartupSchema,
  SaveStudioSchemaEditCandidateInputSchema,
  SchemaNodeProvenanceSchema,
  StudioAdoptResultSchema,
  StudioApplyInputSchema,
  StudioCandidateListSchema,
  StudioCandidateSchema,
  type StudioPreviewInput,
  StudioPreviewInputSchema,
  StudioPreviewSchema,
  StudioSchemaEditCandidateReadSchema,
  StudioSchemaEditCandidateSaveResultSchema,
  WorkspaceSchemaPendingViewSchema,
} from '@t3x-dev/api-client';
import {
  parseWorkspaceSchemaEditCandidate,
  resolveWorkspaceSchemaBindingMode,
  type WorkspaceSchemaEditOrigin,
} from '@t3x-dev/application';
import { WorkspaceSchemaYOpsError } from '@t3x-dev/core';
import {
  type AnyDB,
  addSchemaStudioCandidate,
  ConflictError,
  DraftAuthoringConflictError,
  findBranchByName,
  findSchemaStartupWorkspace,
  findWorkspaceDraft,
  findWorkspaceDraftForOwner,
  getRepositoryAddress,
  getTransitionRefHead,
  listSchemaStudioCandidates,
  listYSchemaCatalogReleases,
  removeSchemaStudioCandidate,
  resolveRepositoryProject,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, parseYSchema, sha256CompositionValue } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from '../lib/auth-config';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  assertProjectAccess,
  assertProjectReadWithEditPermission,
  getProjectAccessPrincipal,
  getUserId,
} from '../lib/project-access';
import { markRepositoryReadOutcome, timeRepositoryRead } from '../lib/repository-read-timing';
import { saveStudioEditCandidate } from '../lib/schema-edit-candidate-save';
import { readReleaseNodeProvenance } from '../lib/schema-node-provenance';
import { projectStudioCandidate, resolveStudioSource } from '../lib/schema-studio';
import {
  compileStudioSelection,
  previewStudio,
  readStudioCompositionSnapshot,
  StudioError,
  workspaceStudioSelection,
} from '../lib/schema-studio-preview';
import { workspaceAuthoringState } from '../lib/workspace-authoring';
import { resolveWorkspaceSchemaEditBasis } from '../lib/workspace-schema-edit-basis';
import {
  readPendingWorkspaceSchema,
  savePendingWorkspaceSchema,
} from '../lib/workspace-schema-pending';
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
import { workspaceOwnerFromContext } from '../middleware/workspace-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import type { AppEnv } from '../types';
import { schemaPreparationRoutes } from './schema-preparation.openapi';
import { schemaPublishRoutes } from './schema-publish.openapi';

const params = z.object({ projectId: z.string().min(1) });
const errors = {
  403: {
    description: 'Access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Unavailable source',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  409: {
    description: 'Version changed',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
const listRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/candidates',
  tags: ['YSchema'],
  request: { params },
  responses: {
    200: {
      description: 'Authorized candidate projections',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioCandidateListSchema) } },
    },
    ...errors,
  },
});
const addRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/candidates',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: AddStudioCandidateSchema } } },
  },
  responses: {
    200: {
      description: 'Exact candidate, including idempotent retries',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioCandidateSchema) } },
    },
    ...errors,
  },
});
const removeRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/schema-studio/candidates/{candidateId}',
  tags: ['YSchema'],
  request: { params: params.extend({ candidateId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'Candidate removed; source unchanged',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ removed: z.literal(true) })),
        },
      },
    },
    ...errors,
  },
});
const readSourceRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/source',
  tags: ['YSchema'],
  summary: 'Read the exact authorized release without adding a candidate',
  request: { params, query: AddStudioCandidateSchema },
  responses: {
    200: {
      description: 'Verified release reading',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              artifactHash: z.string(),
              readme: z.string().nullable(),
              manifest: z.record(z.string(), z.unknown()),
              nodeProvenance: SchemaNodeProvenanceSchema.optional(),
            })
          ),
        },
      },
    },
    ...errors,
  },
});
const schemaEditParams = params.extend({ workspaceId: z.string().min(1) });
const readSchemaEditCandidateRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/edit-candidates/{workspaceId}',
  tags: ['YSchema'],
  summary: 'Recover the server-managed Schema edit candidate for a Workspace',
  request: {
    params: schemaEditParams,
    query: z.object({
      previewWorkspaceRevision: z.coerce.number().int().nonnegative().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Persisted Schema edit candidate',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(StudioSchemaEditCandidateReadSchema),
        },
      },
    },
    ...errors,
  },
});
const saveSchemaEditCandidateRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{projectId}/schema-studio/edit-candidates/{workspaceId}',
  tags: ['YSchema'],
  summary: 'Create or edit one server-managed Schema candidate with CAS and retry recovery',
  request: {
    params: schemaEditParams,
    body: {
      content: { 'application/json': { schema: SaveStudioSchemaEditCandidateInputSchema } },
    },
  },
  responses: {
    200: {
      description: 'Created, updated, or idempotently recovered Schema edit candidate',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(StudioSchemaEditCandidateSaveResultSchema),
        },
      },
    },
    ...errors,
  },
});
export const schemaStudioRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
schemaStudioRoutes.route('/', schemaPreparationRoutes);
schemaStudioRoutes.route('/', schemaPublishRoutes);
schemaStudioRoutes.openapi(readSourceRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('query');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const view = await resolveStudioSource(c, db, {
    sourceProjectId: input.sourceProjectId ?? null,
    canonicalName: input.canonicalName,
    version: input.version,
    artifactHash: input.expectedHash,
  });
  if (!view)
    return errorResponse(
      c,
      'NOT_FOUND',
      'The selected release is unavailable or no longer authorized.'
    );
  c.header('Cache-Control', 'private, no-store');
  return c.json(
    {
      success: true as const,
      data: {
        artifactHash: view.artifactHash,
        readme: typeof view.manifest.readme === 'string' ? view.manifest.readme : null,
        manifest: view.manifest,
        nodeProvenance: await readReleaseNodeProvenance(c, db, view.manifest),
      },
    },
    200
  );
});

schemaStudioRoutes.openapi(listRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const rows = await listSchemaStudioCandidates(db, projectId);
  const items = await Promise.all(rows.map((row) => projectStudioCandidate(c, db, row)));
  return c.json({ success: true as const, data: { items } }, 200);
});
schemaStudioRoutes.openapi(addRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('json');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  if (input.sourceProjectId) {
    const sourceAccess = await assertProjectAccess(c, db, input.sourceProjectId, 'project:read');
    if (sourceAccess instanceof Response)
      return errorResponse(c, 'NOT_FOUND', 'Source release is unavailable or not authorized.');
  }
  let version = input.version;
  if (version === 'latest') {
    const latest = await listYSchemaCatalogReleases(db, {
      project_id: input.sourceProjectId,
      canonical_name: input.canonicalName,
      limit: 1,
    });
    if (!latest.items[0])
      return errorResponse(c, 'NOT_FOUND', 'No published release is available.');
    version = latest.items[0].release.version;
  }
  const source = {
    sourceProjectId: input.sourceProjectId ?? null,
    canonicalName: input.canonicalName,
    version,
  };
  const view = await resolveStudioSource(c, db, source);
  if (!view)
    return errorResponse(c, 'NOT_FOUND', 'Source release is unavailable or not authorized.');
  if (input.expectedHash && input.expectedHash !== view.artifactHash)
    return errorResponse(c, 'CONFLICT', 'Source release does not match the selected hash.');
  const id = `sc_${(await sha256CompositionValue({ projectId, artifactVersionId: view.artifactVersionId, hash: view.artifactHash })).slice(7)}`;
  const row = await addSchemaStudioCandidate(db, {
    id,
    projectId,
    ...source,
    artifactVersionId: view.artifactVersionId,
    artifactHash: view.artifactHash,
  });
  return c.json({ success: true as const, data: await projectStudioCandidate(c, db, row) }, 200);
});
schemaStudioRoutes.openapi(removeRoute, async (c) => {
  const db = await getDB();
  const { projectId, candidateId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  await removeSchemaStudioCandidate(db, projectId, candidateId);
  return c.json({ success: true as const, data: { removed: true as const } }, 200);
});

schemaStudioRoutes.openapi(readSchemaEditCandidateRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:read');
  if (access instanceof Response) return access;
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);
  try {
    const { previewWorkspaceRevision } = c.req.valid('query');
    const data = await readSchemaEditCandidate(c, db, projectId, draft, previewWorkspaceRevision);
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true as const, data }, 200);
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    throw error;
  }
});

async function readSchemaEditCandidate(
  c: Context,
  db: AnyDB,
  projectId: string,
  draft: Awaited<ReturnType<typeof findWorkspaceDraft>>,
  previewWorkspaceRevision?: number
) {
  const workspaceId = draft?.workspace_id ?? draft?.id;
  const stored = draft?.workspace_state?.schemaEditCandidate;
  if (!draft || !workspaceId || !stored)
    throw new StudioError('NOT_FOUND', 'No Schema edit candidate exists for this Workspace.');
  const candidate = parseWorkspaceSchemaEditCandidate(stored);
  if (previewWorkspaceRevision !== undefined && previewWorkspaceRevision !== draft.revision)
    throw new StudioError('CONFLICT', 'The Workspace changed. Refresh it before editing.');
  for (const source of candidate.baseSources) {
    const available = await resolveStudioSource(c, db, {
      sourceProjectId: source.projectId,
      canonicalName: source.canonicalName,
      version: source.version,
      artifactHash: source.hash,
    });
    if (!available)
      throw new StudioError('NOT_FOUND', 'A Schema edit source is no longer available.');
  }
  const authoredBase = candidate.authoringDraft?.base;
  const loadedComposition =
    authoredBase?.kind === 'composition'
      ? await readStudioCompositionSnapshot(db, projectId, authoredBase)
      : undefined;
  const baseDefinition = loadedComposition
    ? { ...normalizeYSchemaObject(loadedComposition.snapshot.schemaJson) }
    : undefined;
  const composition = loadedComposition?.composition;
  const binding = (
    draft.workspace_state?.schemaBindings as { schemaHash?: string }[] | undefined
  )?.[0];
  const bindingHash = binding?.schemaHash;
  const alreadyApplied = bindingHash && candidate.authoringDraft?.resultSchemaHash === bindingHash;
  let draftPreview: z.input<typeof StudioSchemaEditCandidateReadSchema>['draftPreview'];
  if (previewWorkspaceRevision !== undefined && !alreadyApplied) {
    const usesBinding =
      bindingHash &&
      authoredBase?.kind === 'composition' &&
      authoredBase.schemaHash === bindingHash;
    const rows =
      !usesBinding && candidate.baseSources.length
        ? await listSchemaStudioCandidates(db, projectId)
        : [];
    const candidateIds = usesBinding
      ? []
      : candidate.baseSources.map(
          (source) =>
            rows.find(
              (row) =>
                row.artifactVersionId === source.artifactVersionId &&
                row.artifactHash === source.hash &&
                row.sourceProjectId === source.projectId &&
                row.canonicalName === source.canonicalName &&
                row.version === source.version
            )?.id
        );
    if (candidateIds.every((id): id is string => Boolean(id))) {
      const input = { candidateIds, workspaceId, ...(candidateIds.length ? { composition } : {}) };
      const read = (options: StudioPreviewInput) =>
        timeRepositoryRead(c, 'schema_preview', () =>
          previewStudio(c, db, projectId, options, undefined, draft, loadedComposition)
        ).catch((error: unknown) => {
          if (!(error instanceof StudioError)) throw error;
          return undefined;
        });
      const [saved, base] = await Promise.all([
        read({
          ...input,
          schemaEditCandidate: { candidateId: candidate.candidateId, revision: candidate.revision },
        }),
        read(input),
      ]);
      if (saved) draftPreview = { candidateIds, base, saved };
    }
  }
  return StudioSchemaEditCandidateReadSchema.parse({
    ...candidate,
    baseDefinition,
    composition,
    draftPreview,
  });
}

const schemaStartupRoute = createRoute({
  method: 'get',
  path: '/v1/repositories/{owner}/{name}/schema-startup',
  tags: ['YSchema'],
  summary: 'Read the authorized initial editor for a repository branch',
  request: {
    params: z.object({ owner: z.string().min(1), name: z.string().min(1) }),
    query: z.object({ branch: z.string().min(1), workspace: z.string().min(1).optional() }),
  },
  responses: {
    200: {
      description: 'Authorized repository address and current Workspace Schema',
      content: {
        'application/json': { schema: SuccessResponseSchema(RepositorySchemaStartupSchema) },
      },
    },
    ...errors,
  },
});

schemaStudioRoutes.openapi(schemaStartupRoute, async (c) => {
  c.header('Cache-Control', 'private, no-store');
  const { owner, name } = c.req.valid('param');
  const { branch, workspace } = c.req.valid('query');
  const db = await getDB();
  const repository = await resolveRepositoryProject(db, owner, name);
  if (!repository) return errorResponse(c, 'NOT_FOUND', 'Repository not found');
  const access = await timeRepositoryRead(c, 'project_access', () =>
    assertProjectReadWithEditPermission(c, db, repository.projectId)
  );
  if (access instanceof Response) return access;
  const project = access.project;
  const workspaceOwner = workspaceOwnerFromContext(c);
  const [resolved, draft, selectedBranch] = await Promise.all([
    getRepositoryAddress(db, project),
    workspaceOwner || isAuthenticationDisabled()
      ? timeRepositoryRead(c, 'owned_workspace', () =>
          findSchemaStartupWorkspace(db, project.projectId, branch, workspace, workspaceOwner)
        )
      : null,
    findBranchByName(db, project.projectId, branch),
  ]);
  const address = {
    ...resolved,
    project_id: project.projectId,
    name: project.name,
    redirect: resolved.canonical_path !== null && resolved.canonical_path !== `/${owner}/${name}`,
  };
  const state =
    address.canonical_path && !address.redirect && selectedBranch && draft?.workspace_state;
  const target =
    draft && state && state.targetBranch === branch && state.status !== 'committed' ? draft : null;
  const [definition, pending] = await Promise.all([
    target ? readSchemaStartupDefinition(c, db, project.projectId, target) : undefined,
    target && state && state.schemaPending !== undefined
      ? timeRepositoryRead(c, 'pending_schema', () =>
          readPendingWorkspaceSchema(c, db, project.projectId, target)
        )
      : undefined,
  ]);
  const {
    assistantSchemaSettings: _settings,
    schemaEditCandidate: _candidate,
    schemaPending: _pending,
    ...workspaceState
  } = state || {};
  const data = RepositorySchemaStartupSchema.parse({
    userId: getUserId(c) ?? null,
    address,
    project: {
      ...address,
      created_at: project.createdAt.toISOString(),
      visibility: project.visibility ?? 'private',
      can_edit: access.canEdit === true,
    },
    branch: selectedBranch
      ? { name: selectedBranch.name, headCommitHash: selectedBranch.headCommitHash }
      : null,
    workspace:
      target && state
        ? {
            ...workspaceState,
            id: target.workspace_id,
            projectId: project.projectId,
            targetBranch: branch,
            revision: target.revision,
            schemaActivity: {
              hasEditCandidate: Boolean(state.schemaEditCandidate),
              hasPendingTask: state.schemaPending !== undefined,
            },
          }
        : null,
    ...definition,
    pending,
  });
  return c.json({ success: true as const, data }, 200);
});

async function readSchemaStartupDefinition(
  c: Context,
  db: AnyDB,
  projectId: string,
  draft: NonNullable<Awaited<ReturnType<typeof findWorkspaceDraft>>>
) {
  const state = draft.workspace_state;
  const workspaceId = draft.workspace_id;
  if (!state || !workspaceId) return;
  try {
    const candidate = state.schemaEditCandidate
      ? await readSchemaEditCandidate(c, db, projectId, draft, draft.revision)
      : undefined;
    const binding = Array.isArray(state.schemaBindings) ? state.schemaBindings[0] : undefined;
    const boundPreview =
      binding && (!candidate || candidate.authoringDraft?.resultSchemaHash === binding.schemaHash)
        ? await timeRepositoryRead(c, 'schema_preview', () =>
            previewStudio(c, db, projectId, { candidateIds: [], workspaceId }, undefined, draft)
          )
        : undefined;
    return { candidate, boundPreview };
  } catch (error) {
    if (!(error instanceof StudioError)) throw error;
    // Let the editor report unavailable sources or a changed draft through its existing reads.
  }
}

schemaStudioRoutes.openapi(saveSchemaEditCandidateRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const input = c.req.valid('json');
  if (input.workspaceId !== workspaceId)
    return errorResponse(c, 'INVALID_REQUEST', 'Workspace path and request body do not match.');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;

  try {
    let composition = input.composition;
    if (
      !input.candidateIds.length &&
      (!input.schemaDefinition ||
        input.composition ||
        Object.keys(input.localContribution ?? {}).length)
    )
      throw new StudioError(
        'INVALID_REQUEST',
        'Snapshot editing requires the complete Schema definition without a new source composition.'
      );
    if (!input.rebase && !composition) {
      const draft = await findWorkspaceDraft(db, projectId, workspaceId);
      const stored = draft?.workspace_state?.schemaEditCandidate;
      const base = stored
        ? parseWorkspaceSchemaEditCandidate(stored).authoringDraft?.base
        : undefined;
      if (base?.kind === 'composition')
        composition = (await readStudioCompositionSnapshot(db, projectId, base)).composition;
    }
    const boundDraft = !input.candidateIds.length
      ? await findWorkspaceDraft(db, projectId, workspaceId)
      : null;
    if (!input.candidateIds.length && !boundDraft?.workspace_state)
      throw new StudioError('NOT_FOUND', 'Target Workspace is unavailable.');
    const bound = boundDraft?.workspace_state
      ? await workspaceStudioSelection(c, db, projectId, boundDraft.workspace_state)
      : null;
    let selection =
      bound?.selection ??
      (await compileStudioSelection(
        c,
        db,
        projectId,
        input.candidateIds,
        undefined,
        undefined,
        composition
      ));
    const principal = getProjectAccessPrincipal(c);
    const origin: WorkspaceSchemaEditOrigin = principal
      ? {
          channel: input.origin,
          actor: {
            kind: principal.principalKind ?? 'human',
            id: principal.userId ?? principal.keyId ?? 'authenticated-principal',
          },
        }
      : { channel: input.origin, actor: { kind: 'local', id: 'auth-disabled-local' } };
    let guard: Parameters<typeof saveStudioEditCandidate>[5] = boundDraft?.workspace_state
      ? {
          workspaceRevision: boundDraft.revision,
          assistantSchemaSettings: boundDraft.workspace_state.assistantSchemaSettings,
        }
      : undefined;
    if (bound?.basis && input.baseSchemaHash === bound.basis.schemaHash)
      guard = {
        workspaceRevision: boundDraft!.revision,
        assistantSchemaSettings: boundDraft!.workspace_state!.assistantSchemaSettings,
        basis: bound.basis,
      };
    if (!input.rebase && input.schemaDefinition && input.baseSchemaHash !== selection.schemaHash) {
      const draft = await findWorkspaceDraft(db, projectId, workspaceId);
      if (!draft?.workspace_state)
        return errorResponse(c, 'NOT_FOUND', 'Target Workspace is unavailable.');
      const resolved = await resolveWorkspaceYSchema(draft.workspace_state, db, projectId);
      if (
        resolved.schema &&
        (await sha256CompositionValue(resolved.schema)) === input.baseSchemaHash
      ) {
        const basis = await resolveWorkspaceSchemaEditBasis(
          c,
          db,
          projectId,
          draft.workspace_state,
          resolved.schema
        );
        if (!composition && basis.composition)
          selection = await compileStudioSelection(
            c,
            db,
            projectId,
            input.candidateIds,
            undefined,
            undefined,
            basis.composition
          );
        if (basis.selectionHash !== selection.selectionHash)
          throw new StudioError('CONFLICT', 'The selected sources do not match the bound Schema.');
        guard = {
          workspaceRevision: draft.revision,
          assistantSchemaSettings: draft.workspace_state.assistantSchemaSettings,
          basis,
        };
      }
    }
    const result = await saveStudioEditCandidate(
      db,
      projectId,
      input,
      selection,
      origin,
      guard,
      (id) => compileStudioSelection(c, db, projectId, [id])
    );
    return c.json({ success: true as const, data: result }, 200);
  } catch (error) {
    if (error instanceof WorkspaceSchemaYOpsError)
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    if (error instanceof StudioError)
      return errorResponse(c, error.code, error.message, error.details);
    if (error instanceof ConflictError)
      return errorResponse(c, 'CONFLICT', 'The Workspace changed. Retry the Schema edit.');
    throw error;
  }
});

const previewRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/preview',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: StudioPreviewInputSchema } } },
  },
  responses: {
    200: {
      description: 'Read-only compiled selection and review preconditions',
      content: { 'application/json': { schema: SuccessResponseSchema(StudioPreviewSchema) } },
    },
    ...errors,
  },
});
const applyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/apply',
  tags: ['YSchema'],
  request: {
    params,
    body: { content: { 'application/json': { schema: StudioApplyInputSchema } } },
  },
  responses: {
    200: {
      description:
        'Empty unbound Workspace bound directly; otherwise adopted as pending preparation',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(StudioAdoptResultSchema),
        },
      },
    },
    ...errors,
  },
});
schemaStudioRoutes.openapi(previewRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  if ((c as Context<AppEnv>).get('repositoryReadAccess')?.projectId !== projectId) {
    const access = await timeRepositoryRead(c, 'project_access', () =>
      assertProjectAccess(c, db, projectId, 'project:read')
    );
    if (access instanceof Response) return access;
  }
  c.header('Cache-Control', 'private, no-store');
  try {
    const input = c.req.valid('json');
    const data = await timeRepositoryRead(c, 'schema_preview', () =>
      previewStudio(c, db, projectId, input)
    );
    return c.json({ success: true as const, data }, 200);
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    throw error;
  }
});
schemaStudioRoutes.openapi(applyRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('json');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  try {
    const preview = await previewStudio(c, db, projectId, input);
    if (!preview.adoption.allowed)
      throw new StudioError(
        'FORBIDDEN',
        preview.adoption.reason ?? 'Source redistribution not authorized.'
      );
    if (!preview.report.valid)
      return errorResponse(c, 'REVIEW_REQUIRED', 'Selected definitions have blocking issues.');
    if (!preview.impact?.canAdopt)
      return errorResponse(
        c,
        'REVIEW_REQUIRED',
        'Resolve the Schema content impact before applying.',
        {
          impact: preview.impact,
        }
      );
    if (preview.reviewHash !== input.reviewHash || preview.workspace?.revision !== input.ifRevision)
      throw new StudioError(
        'CONFLICT',
        'The selection or Workspace changed. Review it again before applying.'
      );
    const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
    if (!draft?.workspace_state || draft.revision !== input.ifRevision)
      throw new StudioError('CONFLICT', 'The target Workspace changed.');
    // Restore dev's direct Apply only for a first, empty binding. Never clear proposals or edits.
    if (preview.workspace.canBind) {
      const compositionHash = await sha256CompositionValue({
        selectionHash: preview.selectionHash,
        schemaHash: preview.schemaHash,
      });
      const compositionId = `studio:${compositionHash}`;
      const binding = {
        rootKey: 'candidate',
        canonicalName: compositionId,
        schemaName:
          preview.sources.length === 1 ? preview.sources[0]!.canonicalName : 'Studio selection',
        version: preview.sources.length === 1 ? preview.sources[0]!.version : '1',
        mode: resolveWorkspaceSchemaBindingMode({
          source:
            !preview.modules.length && !input.schemaEditCandidate
              ? 'published_schema'
              : 'workspace_schema',
        }),
        schemaHash: preview.schemaHash,
        compositionId,
        compositionRevision: 1,
        compositionHash,
        studioSources: preview.sources,
      };
      const saveSnapshot = (tx: AnyDB) =>
        saveYSchemaCompositionSnapshot(tx, {
          snapshot_id: `studio_${projectId}_${compositionHash.slice(7)}`,
          project_id: projectId,
          composition_id: compositionId,
          composition_revision: 1,
          composition_hash: compositionHash,
          compiled_schema_hash: preview.schemaHash,
          compiler_version: 'studio-selection@1',
          manifest_json: {
            apiVersion: 't3x.dev/studio-selection/v1',
            sources: preview.sources,
            selectionHash: preview.selectionHash,
            studioComposition: preview.composition,
            nodeProvenance: preview.nodeProvenance,
          },
          schema_json: preview.schema,
          render_plan_json: preview.renderPlan,
          origins_json: preview.origins,
        });
      const state = { ...draft.workspace_state, schemaBindings: [binding] };
      const saved = draft.workspace_state.authoringLedger
        ? (
            await transactWorkspaceAuthoring(
              db,
              { projectId, workspaceId: input.workspaceId, refName: draft.target_branch ?? 'main' },
              async (tx, current) => {
                if (current.revision !== input.ifRevision)
                  throw new ConflictError(current.id, input.ifRevision);
                const { basis } = workspaceAuthoringState(current.workspace_state!);
                const head = await getTransitionRefHead(tx, { projectId, refName: basis.refName });
                if (head.head !== basis.refHead || current.target_branch !== basis.refName)
                  throw new StudioError('CONFLICT', 'The branch changed. Review it again.');
                await saveSnapshot(tx);
                return { workspace: state, value: null };
              }
            )
          ).draft
        : await db.transaction(async (tx) => {
            await saveSnapshot(tx);
            return upsertWorkspaceDraft(
              tx,
              {
                project_id: projectId,
                workspace_id: input.workspaceId,
                title: draft.title,
                target_branch: draft.target_branch ?? 'main',
                workspace_state: state,
              },
              input.ifRevision
            );
          });
      return c.json(
        {
          success: true as const,
          data: { outcome: 'bound' as const, workspaceRevision: saved.revision, binding },
        },
        200
      );
    }
    const saved = await savePendingWorkspaceSchema(db, projectId, draft, {
      workspaceId: input.workspaceId,
      ifRevision: input.ifRevision,
      reviewHash: input.reviewHash,
      selectionHash: preview.selectionHash,
      schemaHash: preview.schemaHash,
      contentHash: preview.impact.content.hash,
      source: {
        kind: 'studio',
        candidateIds: input.candidateIds,
        ...(input.schemaEditCandidate ? { schemaEditCandidate: input.schemaEditCandidate } : {}),
      },
    });
    return c.json({ success: true as const, data: saved }, 200);
  } catch (error) {
    if (error instanceof StudioError) return errorResponse(c, error.code, error.message);
    if (error instanceof ConflictError || error instanceof DraftAuthoringConflictError)
      return errorResponse(c, 'CONFLICT', 'The Workspace changed. Review it again.');
    throw error;
  }
});

const readPendingRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/schema-studio/pending/{workspaceId}',
  tags: ['YSchema'],
  request: { params: schemaEditParams },
  responses: {
    200: {
      description: 'Live availability and freshness of the retained preparation task',
      content: {
        'application/json': { schema: SuccessResponseSchema(WorkspaceSchemaPendingViewSchema) },
      },
    },
    ...errors,
  },
});
schemaStudioRoutes.openapi(readPendingRoute, async (c) => {
  const db = await getDB();
  const { projectId, workspaceId } = c.req.valid('param');
  const request = c as Context<AppEnv>;
  if (request.get('repositoryReadAccess')?.projectId !== projectId) {
    const access = await timeRepositoryRead(c, 'project_access', () =>
      assertProjectAccess(c, db, projectId, 'project:read')
    );
    if (access instanceof Response) return access;
  }
  const owner = workspaceOwnerFromContext(c);
  const draft =
    request.get('pendingSchemaWorkspace') ??
    (await timeRepositoryRead(c, 'owned_workspace', () => {
      if (owner) return findWorkspaceDraftForOwner(db, projectId, workspaceId, owner);
      if (isAuthenticationDisabled()) return findWorkspaceDraft(db, projectId, workspaceId);
      return Promise.resolve(null);
    }));
  if (!draft?.workspace_state)
    return errorResponse(c, 'NOT_FOUND', 'Target Workspace is unavailable.');
  c.header('Cache-Control', 'private, no-store');
  const data = await timeRepositoryRead(c, 'pending_schema', () =>
    readPendingWorkspaceSchema(c, db, projectId, draft)
  );
  if (data.status === 'none') markRepositoryReadOutcome(c, 'empty');
  if (data.status === 'unavailable') markRepositoryReadOutcome(c, 'unavailable');
  return c.json({ success: true as const, data }, 200);
});

// Initial YAML binding is restricted to an empty Workspace; existing proposals use Studio review.
const initialSchemaRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/schema-studio/initial-schema',
  tags: ['YSchema'],
  request: {
    params,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({
              workspaceId: z.string().min(1),
              ifRevision: z.number().int().nonnegative(),
              filename: z.string().max(255),
              yaml: z
                .string()
                .min(1)
                .max(5 * 1024 * 1024),
            })
            .strict(),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Initial schema bound',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ workspaceRevision: z.number() })),
        },
      },
    },
    ...errors,
    400: {
      description: 'Invalid schema',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
schemaStudioRoutes.openapi(initialSchemaRoute, async (c) => {
  const db = await getDB();
  const { projectId } = c.req.valid('param');
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  const input = c.req.valid('json');
  let schema;
  try {
    schema = parseYSchema(input.yaml);
  } catch (error) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Invalid YSchema'
    );
  }
  const draft = await findWorkspaceDraft(db, projectId, input.workspaceId);
  if (!draft?.workspace_state)
    return errorResponse(c, 'CONFLICT', 'Workspace changed; reload before importing.');
  const state = draft.workspace_state;
  const hash = await sha256CompositionValue(schema);
  const existing = Array.isArray(state.schemaBindings)
    ? (state.schemaBindings[0] as Record<string, unknown> | undefined)
    : undefined;
  if (existing?.compositionId === `uploaded:${hash}`)
    return c.json({ success: true as const, data: { workspaceRevision: draft.revision } }, 200);
  if (draft.revision !== input.ifRevision)
    return errorResponse(c, 'CONFLICT', 'Workspace changed; reload before importing.');
  const yops = state.yopsDraft as { operations?: unknown[] } | undefined;
  if (
    state.baseCommitHash ||
    state.lastCommitHash ||
    (yops?.operations?.length ?? 0) > 0 ||
    (Array.isArray(state.schemaBindings) && state.schemaBindings.length > 0)
  )
    return errorResponse(c, 'CONFLICT', 'Initial schema requires an empty, unbound Workspace.');
  const compositionId = `uploaded:${hash}`;
  try {
    const saved = await db.transaction(async (tx) => {
      await saveYSchemaCompositionSnapshot(tx, {
        snapshot_id: `uploaded_${projectId}_${hash.slice(7)}`,
        project_id: projectId,
        composition_id: compositionId,
        composition_revision: 1,
        composition_hash: hash,
        compiled_schema_hash: hash,
        compiler_version: 'initial-schema@1',
        manifest_json: { filename: input.filename },
        schema_json: { ...schema },
        render_plan_json: [],
        origins_json: {},
      });
      return upsertWorkspaceDraft(
        tx,
        {
          project_id: projectId,
          workspace_id: input.workspaceId,
          title: String(state.title ?? 'Main workspace'),
          target_branch: String(state.targetBranch ?? 'main'),
          parent_commit_hash: null,
          workspace_state: {
            ...state,
            schemaBindings: [
              {
                rootKey: 'candidate',
                canonicalName: compositionId,
                schemaName: input.filename,
                version: '1',
                mode: resolveWorkspaceSchemaBindingMode({ source: 'workspace_schema' }),
                schemaHash: hash,
                compositionId,
                compositionRevision: 1,
                compositionHash: hash,
              },
            ],
          },
        },
        input.ifRevision
      );
    });
    return c.json({ success: true as const, data: { workspaceRevision: saved.revision } }, 200);
  } catch (error) {
    if (error instanceof ConflictError) return errorResponse(c, 'CONFLICT', error.message);
    throw error;
  }
});
