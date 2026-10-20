import {
  type StudioPreviewInput,
  type StudioSample,
  StudioSampleValueSchema,
} from '@t3x-dev/api-client';
import {
  parseWorkspaceSchemaEditCandidate,
  type WorkspaceSchemaEditCandidate,
} from '@t3x-dev/application';
import {
  applyWorkspaceSchemaYOps,
  compileWorkspaceSchemaDefinition,
  WorkspaceSchemaYOpsError,
} from '@t3x-dev/core';
import { type AnyDB, findSchemaStudioCandidate, findWorkspaceDraft } from '@t3x-dev/storage';
import {
  compileYSchemaCompositionV2,
  diffYSchemas,
  normalizeYSchemaObject,
  sha256CompositionValue,
  validateTree,
  type YSchema,
  type YSchemaLocalContributionV2,
} from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { assessWorkspaceSchemaImpact, workspaceContent } from './schema-evolution-impact';
import { resolveStudioSource, schemaSourceAdoptionReason } from './schema-studio';
import { workspaceAuthoringState } from './workspace-authoring';
import { resolveWorkspaceYSchema } from './workspace-yschema';
import { artifactViewToOpenModule } from './yschema-artifact-registry';
export class StudioError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INVALID_REQUEST' | 'CONFLICT' | 'FORBIDDEN' | 'REVIEW_REQUIRED',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}
function samplePreview(
  value: unknown,
  schema: YSchema,
  compiled: boolean,
  id: string,
  source: StudioSample['source']
): StudioSample {
  const parsed = StudioSampleValueSchema.safeParse(value);
  if (!parsed.success)
    return {
      id,
      source,
      value: null,
      valid: false,
      ready: false,
      issues: [
        {
          code: 'INVALID_SAMPLE',
          path: '$',
          message: 'Author sample exceeds the supported JSON preview limits.',
        },
      ],
    };
  const result = validateTree({
    schema,
    tree: parsed.data as Parameters<typeof validateTree>[0]['tree'],
  });
  return {
    id,
    source,
    value: parsed.data,
    valid: compiled && result.valid,
    ready: compiled && result.valid && result.ready,
    issues: [
      ...result.errors,
      ...result.gaps,
      ...(!compiled
        ? [
            {
              code: 'INVALID_SELECTION',
              path: '$',
              message: 'Resolve the selected definition before validating a sample.',
            },
          ]
        : []),
    ].map(({ code, path, message }) => ({ code, path, message })),
  };
}
export async function compileStudioSelection(
  c: Context,
  db: AnyDB,
  projectId: string,
  candidateIds: string[],
  rawLocalContribution?: Record<string, unknown>,
  localIdentity?: { id: string; revision: number }
) {
  const entries = await Promise.all(
    candidateIds.map(async (id) => {
      const row = await findSchemaStudioCandidate(db, projectId, id);
      const view = row ? await resolveStudioSource(c, db, row) : null;
      if (!row || !view)
        throw new StudioError(
          'NOT_FOUND',
          'A selected source is unavailable or no longer authorized.'
        );
      return { row, view };
    })
  );
  const sources = entries.map(({ row }) => ({
    projectId: row.sourceProjectId,
    canonicalName: row.canonicalName,
    version: row.version,
    hash: row.artifactHash,
    artifactVersionId: row.artifactVersionId,
  }));
  const samplesFor = (schema: YSchema, valid: boolean) =>
    entries.flatMap(({ row, view }, index) =>
      Object.hasOwn(view.manifest, 'starter')
        ? [samplePreview(view.manifest.starter, schema, valid, row.id, sources[index]!)]
        : []
    );
  const selectionHash = await sha256CompositionValue({
    apiVersion: 't3x.dev/studio-selection/v1',
    projectId,
    sources,
  });
  const localContribution = studioLocalContribution(
    rawLocalContribution,
    selectionHash,
    localIdentity
  );
  let adoptionReason: string | null = null;
  for (const { view } of entries) {
    adoptionReason = (await schemaSourceAdoptionReason(c, db, projectId, view)) ?? adoptionReason;
  }
  const whole = entries.filter(({ view }) => view.kind === 'schema');
  if (whole.length && entries.length !== 1)
    throw new StudioError(
      'INVALID_REQUEST',
      'A published Schema is adopted whole. Select it alone or compose declared Modules separately.'
    );
  if (whole.length) {
    const view = whole[0]!.view;
    if (view.manifest.apiVersion !== 't3x.dev/yschema-blueprint/v1')
      throw new StudioError('INVALID_REQUEST', 'Unsupported published Schema definition.');
    const schema = normalizeYSchemaObject(view.manifest.schema);
    const schemaHash = await sha256CompositionValue(schema);
    const registry = view.manifest.registry as Record<string, unknown> | undefined;
    // Publication assigns release name/version before recording registry.schemaHash.
    // compiledSchemaHash identifies the earlier compiler output (see publish route).
    // resolveStudioSource independently verifies the entire pinned manifest hash.
    if (registry?.schemaHash !== schemaHash)
      throw new StudioError(
        'CONFLICT',
        'Published Schema integrity does not match its compiled definition.'
      );
    if (!localContribution)
      return {
        schema,
        samples: samplesFor(schema, true),
        schemaHash,
        selectionHash,
        sources,
        report: { valid: true, issues: [] },
        renderPlan: (registry.renderPlan ?? []) as Record<string, unknown>[],
        origins: (registry.originsByPath ?? {}) as Record<string, unknown>,
        modules: [],
        adoption: { allowed: !adoptionReason, reason: adoptionReason },
      };
  }
  const modules = entries.map(({ view }) => artifactViewToOpenModule(view));
  const compiled = await compileYSchemaCompositionV2({
    composition: {
      apiVersion: 't3x.dev/yschema-composition/v2',
      id: `studio:${selectionHash}`,
      revision: 1,
      status: 'draft',
      modules: entries.map(({ view }, index) => ({
        canonicalName: view.canonicalName,
        version: view.version,
        presentationOrder: index * 10,
      })),
    },
    modules,
    ...(localContribution ? { localContribution } : {}),
  });
  // Whole-Schema bases retain root semantics; Modules alone do not carry strict/name metadata.
  if (whole.length) {
    const base = normalizeYSchemaObject(whole[0]!.view.manifest.schema);
    const derived = {
      ...base,
      nodes: compiled.schema.nodes,
      relationTypes: compiled.schema.relationTypes,
      rules: compiled.schema.rules,
    };
    compiled.schema = compiled.report.valid ? normalizeYSchemaObject(derived) : derived;
    compiled.compiledSchemaHash = await sha256CompositionValue(compiled.schema);
  }
  return {
    samples: samplesFor(compiled.schema, compiled.report.valid),
    schema: compiled.schema,
    schemaHash: compiled.compiledSchemaHash,
    selectionHash,
    sources,
    report: compiled.report,
    renderPlan: compiled.renderPlan,
    origins: compiled.originsByPath,
    // A presentation projection of declared required imports. The compiler remains
    // the authority for validity; only the last matching provider is locked.
    modules: modules.map((provider, index) => ({
      candidateId: entries[index]!.row.id,
      requiredBy: modules
        .filter(
          (consumer) =>
            consumer !== provider &&
            consumer.imports.some((imported) => {
              if (imported.mode !== 'required') return false;
              const matching = modules.filter(
                (candidate) =>
                  (!imported.provider || candidate.canonicalName === imported.provider) &&
                  candidate.provides.some(
                    (capability) =>
                      capability.capability === imported.capability &&
                      capability.version === imported.version
                  )
              );
              return matching.length === 1 && matching[0] === provider;
            })
        )
        .map((consumer) => consumer.canonicalName),
    })),
    adoption: { allowed: !adoptionReason, reason: adoptionReason },
  };
}
export async function previewStudio(
  c: Context,
  db: AnyDB,
  projectId: string,
  input: StudioPreviewInput
) {
  let draft = input.workspaceId ? await findWorkspaceDraft(db, projectId, input.workspaceId) : null;
  let editCandidate: WorkspaceSchemaEditCandidate | null = null;
  if (input.schemaEditCandidate) {
    if (!input.workspaceId)
      throw new StudioError(
        'INVALID_REQUEST',
        'A saved Schema edit candidate must be previewed in its Workspace.'
      );
    if (!draft?.workspace_state)
      throw new StudioError('NOT_FOUND', 'Target Workspace is unavailable.');
    const stored = draft.workspace_state.schemaEditCandidate;
    if (!stored)
      throw new StudioError('CONFLICT', 'The saved Schema edit candidate no longer exists.');
    try {
      editCandidate = parseWorkspaceSchemaEditCandidate(stored);
    } catch {
      throw new StudioError('CONFLICT', 'The saved Schema edit candidate is invalid.');
    }
    if (
      editCandidate.candidateId !== input.schemaEditCandidate.candidateId ||
      editCandidate.revision !== input.schemaEditCandidate.revision ||
      editCandidate.workspaceId !== input.workspaceId
    )
      throw new StudioError(
        'CONFLICT',
        'The Schema edit candidate changed. Refresh it before checking again.'
      );
  }
  let selected = await compileStudioSelection(
    c,
    db,
    projectId,
    input.candidateIds,
    (editCandidate?.localContribution ?? input.localContribution) as
      | Record<string, unknown>
      | undefined,
    editCandidate ? { id: editCandidate.candidateId, revision: editCandidate.revision } : undefined
  );
  if (editCandidate && !sameStudioSources(editCandidate.baseSources, selected.sources))
    throw new StudioError(
      'CONFLICT',
      'The selected base sources changed after this Schema edit candidate was saved.'
    );
  if (editCandidate?.authoringDraft || input.schemaDefinition) {
    if (!selected.report.valid)
      throw new StudioError(
        'REVIEW_REQUIRED',
        'Resolve the Base definition checks before editing it.'
      );
    try {
      const authoring = editCandidate?.authoringDraft;
      const expected = authoring?.base.schemaHash ?? input.baseSchemaHash;
      if (!expected || expected !== selected.schemaHash)
        throw new StudioError(
          'CONFLICT',
          'The exact Base Schema changed. Reload it before editing.'
        );
      const applied = authoring
        ? await applyWorkspaceSchemaYOps(selected.schema, authoring.effect.operations)
        : await compileWorkspaceSchemaDefinition(selected.schema, input.schemaDefinition);
      if (authoring?.resultSchemaHash && authoring.resultSchemaHash !== applied.schemaHash)
        throw new StudioError(
          'CONFLICT',
          'The saved Schema Effect does not replay to its frozen result.'
        );
      const localOrigin = {
        kind: 'local' as const,
        contributionId: editCandidate?.candidateId ?? 'studio-unsaved-effect',
        revision: editCandidate?.revision ?? 0,
      };
      const origins: Record<string, unknown> = {};
      const recordOrigins = (nodes: YSchema['nodes'], before: YSchema['nodes'], prefix = '') => {
        for (const [key, node] of Object.entries(nodes)) {
          const path = prefix ? `${prefix}/${key}` : key;
          const previous = before[key];
          const source = selected.origins[path as keyof typeof selected.origins];
          origins[path] =
            previous && JSON.stringify(previous) === JSON.stringify(node)
              ? (source ?? localOrigin)
              : source
                ? {
                    kind: 'derived',
                    sources: [
                      ...(typeof source === 'object' &&
                      source !== null &&
                      'kind' in source &&
                      source.kind === 'derived' &&
                      'sources' in source &&
                      Array.isArray(source.sources)
                        ? source.sources
                        : [source]),
                      localOrigin,
                    ],
                  }
                : localOrigin;
          for (const [slot, definition] of Object.entries(node.slots ?? {})) {
            const slotPath = `${path}/${slot}`;
            origins[slotPath] =
              previous?.slots?.[slot] &&
              JSON.stringify(previous.slots[slot]) === JSON.stringify(definition)
                ? (selected.origins[slotPath as keyof typeof selected.origins] ?? localOrigin)
                : localOrigin;
          }
          if (node.children && node.children !== 'any')
            recordOrigins(
              node.children,
              previous?.children && previous.children !== 'any' ? previous.children : {},
              path
            );
        }
      };
      recordOrigins(applied.schema.nodes, selected.schema.nodes);
      selected = {
        ...selected,
        schema: applied.schema,
        schemaHash: applied.schemaHash,
        origins,
      } as typeof selected;
    } catch (error) {
      if (error instanceof WorkspaceSchemaYOpsError)
        throw new StudioError('INVALID_REQUEST', error.message);
      throw error;
    }
  }
  let workspace: {
    id: string;
    revision: number;
    binding: Record<string, unknown> | null;
    canBind: boolean;
    changes: ReturnType<typeof diffYSchemas>;
  } | null = null;
  let impact: Awaited<ReturnType<typeof assessWorkspaceSchemaImpact>> | null = null;
  let baseSchemaHash: string | null = null;
  if (input.workspaceId) {
    draft ??= await findWorkspaceDraft(db, projectId, input.workspaceId);
    if (!draft?.workspace_state)
      throw new StudioError('NOT_FOUND', 'Target Workspace is unavailable.');
    const resolved = await resolveWorkspaceYSchema(draft.workspace_state, db, projectId);
    const bindings = draft.workspace_state.schemaBindings;
    if (Array.isArray(bindings) && bindings.length && !resolved.schema)
      throw new StudioError(
        'CONFLICT',
        'The current Workspace binding cannot be resolved. Repair it before replacing it.'
      );
    const base =
      resolved.schema ??
      normalizeYSchemaObject({
        yschema: '0.1',
        name: 'Unbound Workspace',
        version: '1',
        nodes: {},
      });
    baseSchemaHash = await sha256CompositionValue(base);
    workspace = {
      id: input.workspaceId,
      revision: draft.revision,
      canBind: (() => {
        const state = draft.workspace_state!;
        const operations = (state.yopsDraft as { operations?: unknown[] } | undefined)?.operations;
        if (
          (Array.isArray(bindings) && bindings.length) ||
          state.schemaPending ||
          state.baseCommitHash ||
          state.lastCommitHash ||
          draft.parent_commit_hash ||
          operations?.length ||
          state.extractionProposal ||
          draft.nodes?.length ||
          draft.semantic_points?.length
        )
          return false;
        try {
          const content = workspaceContent(state);
          if (state.authoringLedger) {
            const { ledger, basis } = workspaceAuthoringState(state);
            if (ledger.actions.length || basis.refHead) return false;
          }
          return Object.keys(content.tree).length === 0 && content.relations.length === 0;
        } catch {
          return false;
        }
      })(),
      binding: Array.isArray(bindings)
        ? ((bindings[0] ?? null) as Record<string, unknown> | null)
        : null,
      changes: diffYSchemas(base, selected.schema),
    };
    impact = await assessWorkspaceSchemaImpact(
      db,
      projectId,
      draft.workspace_state,
      selected.schema,
      selected.report.valid
    );
    if (!selected.adoption.allowed) {
      impact.status = 'blocked';
      impact.canAdopt = false;
      impact.canPublish = false;
      impact.items.push({
        kind: 'blocked',
        code: 'SOURCE_ADOPTION_NOT_ALLOWED',
        path: '$sources',
        message: selected.adoption.reason ?? 'Source adoption is not authorized.',
        affectedPaths: [],
      });
    }
  }
  let comparison = null;
  if (input.compareToCandidateIds) {
    const previous = await compileStudioSelection(c, db, projectId, input.compareToCandidateIds);
    if (!previous.report.valid)
      throw new StudioError(
        'INVALID_REQUEST',
        'The comparison selection has blocking definition issues.'
      );
    comparison = {
      schemaHash: previous.schemaHash,
      changes: diffYSchemas(previous.schema, selected.schema),
    };
  }
  const reviewHash = await sha256CompositionValue({
    selectionHash: selected.selectionHash,
    schemaHash: selected.schemaHash,
    workspaceId: input.workspaceId ?? null,
    workspaceRevision: workspace?.revision ?? null,
    baseSchemaHash,
    contentHash: impact?.content.hash ?? null,
    schemaEditCandidate: editCandidate
      ? {
          candidateId: editCandidate.candidateId,
          revision: editCandidate.revision,
          requestDigest: editCandidate.requestDigest,
        }
      : null,
  });
  const report = studioLayeredReport(
    selected.report,
    selected.adoption,
    workspace,
    impact?.content.source !== 'unavailable' && impact?.content.valid != null,
    impact?.content.issues.map((issue) => ({
      ...issue,
      code: `WORKSPACE_${issue.code}`,
      blocking: !issue.code.startsWith('REQUIRED_'),
    })) ?? [],
    editCandidate
  );
  return {
    ...selected,
    localSample:
      input.sample === undefined
        ? null
        : samplePreview(input.sample, selected.schema, selected.report.valid, 'local', null),
    schema: selected.schema as unknown as Record<string, unknown>,
    renderPlan: selected.renderPlan as unknown as Record<string, unknown>[],
    origins: selected.origins as unknown as Record<string, unknown>,
    report,
    impact,
    reviewHash,
    workspace,
    comparison,
    freshness: {
      candidateId: editCandidate?.candidateId ?? null,
      candidateRevision: editCandidate?.revision ?? null,
      candidateRequestDigest: editCandidate?.requestDigest ?? null,
      workspaceRevision: workspace?.revision ?? null,
      schemaHash: selected.schemaHash,
    },
  };
}

function studioLocalContribution(
  value: Record<string, unknown> | undefined,
  selectionHash: string,
  identity?: { id: string; revision: number }
): YSchemaLocalContributionV2 | undefined {
  if (!value || Object.keys(value).length === 0) return undefined;
  const allowed = new Set(['nodes', 'relationTypes', 'rules']);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length)
    throw new StudioError(
      'INVALID_REQUEST',
      `Local Schema contribution contains unsupported fields: ${unsupported.join(', ')}.`
    );
  for (const key of ['nodes', 'relationTypes'] as const) {
    const item = value[key];
    if (item !== undefined && (!item || typeof item !== 'object' || Array.isArray(item)))
      throw new StudioError('INVALID_REQUEST', `Local contribution ${key} must be a mapping.`);
  }
  if (value.rules !== undefined && !Array.isArray(value.rules))
    throw new StudioError('INVALID_REQUEST', 'Local contribution rules must be a list.');
  return {
    apiVersion: 't3x.dev/yschema-local-contribution/v2',
    id: identity?.id ?? `studio-local:${selectionHash}`,
    revision: identity?.revision ?? 0,
    contribution: value as YSchemaLocalContributionV2['contribution'],
  };
}

type StudioIssue = {
  code: string;
  message: string;
  blocking: boolean;
  path?: string;
};

const DEFINITION_ISSUES = new Set([
  'ARTIFACT_HASH_MISMATCH',
  'INVALID_COMPILED_SCHEMA',
  'INVALID_LOCAL_CONTRIBUTION',
  'MODULE_NOT_FOUND',
  'UNSUPPORTED_YSCHEMA_VERSION',
]);

function studioLayeredReport(
  report: { valid: boolean; issues: StudioIssue[] },
  adoption: { allowed: boolean; reason: string | null },
  workspace: { changes: Array<{ kind: string }> } | null,
  workspaceContentChecked: boolean,
  workspaceContentIssues: StudioIssue[],
  editCandidate: WorkspaceSchemaEditCandidate | null
) {
  const definitionIssues = report.issues.filter((issue) => DEFINITION_ISSUES.has(issue.code));
  const compositionIssues = report.issues.filter((issue) => !DEFINITION_ISSUES.has(issue.code));
  const provenanceIssues: StudioIssue[] = adoption.allowed
    ? []
    : [
        {
          code: 'SOURCE_ADOPTION_NOT_ALLOWED',
          message: adoption.reason ?? 'A selected source cannot be adopted.',
          blocking: true,
        },
      ];
  const statusFor = (issues: StudioIssue[]) =>
    issues.some((issue) => issue.blocking)
      ? ('failed' as const)
      : issues.length
        ? ('warning' as const)
        : ('passed' as const);
  return {
    ...report,
    layers: [
      {
        id: 'definition' as const,
        label: 'Definition validity',
        status: statusFor(definitionIssues),
        issues: definitionIssues,
      },
      {
        id: 'composition' as const,
        label: 'Composition dependencies',
        status: statusFor(compositionIssues),
        issues: compositionIssues,
      },
      {
        id: 'provenance' as const,
        label: 'Source authorization',
        status: statusFor(provenanceIssues),
        issues: provenanceIssues,
      },
      {
        id: 'workspace' as const,
        label: 'Workspace content compatibility',
        status: workspaceContentChecked ? statusFor(workspaceContentIssues) : ('not_run' as const),
        issues: workspaceContentIssues,
        summary: workspace
          ? `${workspace.changes.length} definition change${workspace.changes.length === 1 ? '' : 's'}${workspaceContentChecked ? ' checked against the current candidate' : '; no candidate content to validate'}`
          : 'Select a Workspace to calculate impact',
      },
      {
        id: 'freshness' as const,
        label: 'Review freshness',
        status: 'passed' as const,
        issues: [],
        summary: editCandidate
          ? `Candidate revision ${editCandidate.revision} is current`
          : 'Preview is bound to the current selection',
      },
    ],
  };
}

function sameStudioSources(
  expected: readonly {
    projectId: string | null;
    canonicalName: string;
    version: string;
    artifactVersionId: string;
    hash: string;
  }[],
  actual: readonly {
    projectId: string | null;
    canonicalName: string;
    version: string;
    artifactVersionId: string;
    hash: string;
  }[]
) {
  return (
    expected.length === actual.length &&
    expected.every((source, index) => {
      const value = actual[index];
      return (
        value?.projectId === source.projectId &&
        value.canonicalName === source.canonicalName &&
        value.version === source.version &&
        value.artifactVersionId === source.artifactVersionId &&
        value.hash === source.hash
      );
    })
  );
}
