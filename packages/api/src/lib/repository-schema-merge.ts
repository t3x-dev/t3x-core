import type { WorkspaceSchemaDefinitionSnapshot } from '@t3x-dev/api-client';
import { createDraftActionLedger } from '@t3x-dev/application';
import {
  createYSchemaContextDescriptor,
  createYSchemaResourceDescriptor,
  describeCommitV2,
  describeTransitionObject,
  runRepositorySemanticYSchemaStatementProvider,
  type State,
} from '@t3x-dev/core';
import {
  type AnyDB,
  advanceCleanWorkspaceAfterMerge,
  findTransitionCommitReceipt,
  findYSchemaCompositionSnapshot,
  getRepositoryDecisionAuditByDigest,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  listWorkspaceDrafts,
  resolveTransitionProposalGraph,
  saveYSchemaCompositionSnapshot,
  type VerifiedTransitionCommitGraph,
} from '@t3x-dev/storage';
import {
  type CanonicalTimestamp,
  canonicalizeProtocolValue,
  type ProtocolValue,
} from '@t3x-dev/transition';
import {
  diffYSchemas,
  normalizeYSchemaObject,
  sha256CompositionValue,
  type YSchema,
} from '@t3x-dev/yschema';
import { schemaContentFromDocument } from './schema-evolution-impact';
import {
  frozenWorkspaceSchemaReview,
  recoverCommittedSchema,
  unboundWorkspaceSchema,
} from './workspace-schema-review';
import { schemaRootKeyFromBinding } from './yschema-registry';

export interface SchemaMergeConflict {
  path: string;
  base?: unknown;
  source?: unknown;
  target?: unknown;
}
const mapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (left: unknown, right: unknown) =>
  left === undefined || right === undefined
    ? left === right
    : canonicalizeProtocolValue(left as ProtocolValue) ===
      canonicalizeProtocolValue(right as ProtocolValue);

/** Application-level contract merge. Arrays/constraints are atomic; no inferred renames or relaxed unions. */
export function mergeSchemaDefinitions(
  base: YSchema | null,
  source: YSchema | null,
  target: YSchema | null
) {
  const conflicts: SchemaMergeConflict[] = [];
  function merge(before: unknown, incoming: unknown, current: unknown, path: string): unknown {
    if (equal(incoming, current)) return structuredClone(incoming);
    if (equal(incoming, before)) return structuredClone(current);
    if (equal(current, before)) return structuredClone(incoming);
    if ((before === undefined || mapping(before)) && mapping(incoming) && mapping(current)) {
      const keys = [
        ...new Set([
          ...Object.keys(mapping(before) ? before : {}),
          ...Object.keys(incoming),
          ...Object.keys(current),
        ]),
      ].sort();
      return Object.fromEntries(
        keys.flatMap((key) => {
          const value = merge(
            mapping(before) ? before[key] : undefined,
            incoming[key],
            current[key],
            path ? `${path}/${key}` : key
          );
          return value === undefined ? [] : [[key, value]];
        })
      );
    }
    conflicts.push({ path: path || '/', base: before, source: incoming, target: current });
    return undefined;
  }
  const value = merge(base ?? undefined, source ?? undefined, target ?? undefined, '');
  return {
    conflicts,
    definition: conflicts.length || value === undefined ? null : normalizeYSchemaObject(value),
  };
}

export class RepositorySchemaMergeError extends Error {}
interface CommittedSchema {
  schema: YSchema;
  rootKey: string;
  sources: Record<string, unknown>[];
}

/** Read only exact Commit evidence. Neither a live Draft nor the latest Studio candidate is an input. */
async function committedSchema(
  db: AnyDB,
  projectId: string,
  graph: VerifiedTransitionCommitGraph | null
): Promise<CommittedSchema | null> {
  if (!graph) return null;
  const digest = describeCommitV2(graph.commit).digest;
  const audit = await getRepositoryDecisionAuditByDigest(
    db,
    projectId,
    graph.commit.decision.digest
  );
  if (!audit)
    throw new RepositorySchemaMergeError(
      'Schema source Commit has no verified repository authority.'
    );
  const view = await getTransitionViewForCommit(db, {
    projectId,
    refName: audit.refName,
    commitId: digest,
  });
  const hashes = new Set<string>(
    view?.checks.validation.runs.map((run) => run.predicate.schemaResource.digest)
  );
  const receipt = await findTransitionCommitReceipt(db, projectId, digest);
  const prepared = receipt
    ? await resolveTransitionProposalGraph(db, projectId, receipt.transitionId)
    : null;
  if (
    prepared &&
    (prepared.membership.proposalDigest !== describeTransitionObject(graph.proposal).digest ||
      prepared.membership.effectDigest !== describeTransitionObject(graph.effect).digest)
  )
    throw new RepositorySchemaMergeError('Schema preparation does not match its exact Commit.');
  const frozen = prepared ? frozenWorkspaceSchemaReview(prepared)?.draft : undefined;
  if (!hashes.size) {
    if (frozen?.status === 'bound')
      throw new RepositorySchemaMergeError('Committed Schema validation evidence is missing.');
    return null;
  }
  if (hashes.size !== 1)
    throw new RepositorySchemaMergeError('Committed Schema validation evidence is ambiguous.');
  const snapshot: WorkspaceSchemaDefinitionSnapshot | null =
    frozen ??
    (await recoverCommittedSchema(db, projectId, audit.refName, digest, unboundWorkspaceSchema()));
  if (snapshot?.status !== 'bound' || !snapshot.definition || !hashes.has(snapshot.schemaHash!))
    throw new RepositorySchemaMergeError('The exact committed Schema snapshot is unavailable.');
  const schema = normalizeYSchemaObject(snapshot.definition);
  if ((await sha256CompositionValue(schema)) !== snapshot.schemaHash)
    throw new RepositorySchemaMergeError('The committed Schema snapshot failed hash verification.');
  const binding = snapshot.bindings[0];
  let sources = Array.isArray(binding?.studioSources)
    ? (binding.studioSources as Record<string, unknown>[])
    : [];
  if (
    typeof binding?.compositionId === 'string' &&
    typeof binding.compositionRevision === 'number'
  ) {
    const stored = await findYSchemaCompositionSnapshot(db, {
      project_id: projectId,
      composition_id: binding.compositionId,
      composition_revision: binding.compositionRevision,
      compiled_schema_hash: snapshot.schemaHash!,
    });
    if (
      !stored ||
      stored.compositionHash !== binding.compositionHash ||
      (await sha256CompositionValue(normalizeYSchemaObject(stored.schemaJson))) !==
        snapshot.schemaHash
    )
      throw new RepositorySchemaMergeError(
        'The committed Schema binding failed snapshot verification.'
      );
    if (!sources.length && Array.isArray(stored.manifestJson.sources))
      sources = stored.manifestJson.sources as Record<string, unknown>[];
  }
  return { schema, rootKey: schemaRootKeyFromBinding(binding), sources };
}

export async function hasRepositorySchemaChanges(
  db: AnyDB,
  projectId: string,
  sourceDigest: string,
  baseDigest: string | null
) {
  const [sourceGraph, baseGraph] = await Promise.all([
    getVerifiedTransitionCommitGraph(db, projectId, sourceDigest),
    baseDigest ? getVerifiedTransitionCommitGraph(db, projectId, baseDigest) : null,
  ]);
  if (!sourceGraph || (baseDigest && !baseGraph))
    throw new RepositorySchemaMergeError('Schema comparison Commit is unavailable.');
  const [source, base] = await Promise.all([
    committedSchema(db, projectId, sourceGraph),
    committedSchema(db, projectId, baseGraph),
  ]);
  return !equal(source?.schema, base?.schema) || source?.rootKey !== base?.rootKey;
}

export async function prepareRepositorySchemaMerge(input: {
  db: AnyDB;
  projectId: string;
  base: VerifiedTransitionCommitGraph | null;
  source: VerifiedTransitionCommitGraph;
  target: VerifiedTransitionCommitGraph;
}) {
  const [base, source, target] = await Promise.all([
    committedSchema(input.db, input.projectId, input.base),
    committedSchema(input.db, input.projectId, input.source),
    committedSchema(input.db, input.projectId, input.target),
  ]);
  if (!base && !source && !target) return null; // Explicitly unbound repositories retain their existing content-only path.
  if (base && (!source || !target))
    throw new RepositorySchemaMergeError(
      'Schema removal or missing branch contract requires an explicit migration before merging.'
    );
  const roots = new Set(
    [source, target].filter((item) => item !== null).map((item) => item.rootKey)
  );
  if (roots.size !== 1)
    throw new RepositorySchemaMergeError('Schema root bindings conflict between branches.');
  const merged = mergeSchemaDefinitions(
    base?.schema ?? null,
    source?.schema ?? null,
    target?.schema ?? null
  );
  if (merged.conflicts.length)
    throw new RepositorySchemaMergeError(
      `Schema conflicts require a branch revision: ${merged.conflicts.map((item) => item.path).join(', ')}`
    );
  if (!merged.definition) throw new RepositorySchemaMergeError('Merged Schema is unavailable.');
  const schemaHash = await sha256CompositionValue(merged.definition);
  const sources = [
    ...new Map(
      [...(source?.sources ?? []), ...(target?.sources ?? [])].map((item) => [
        canonicalizeProtocolValue(item as ProtocolValue),
        item,
      ])
    ).entries(),
  ]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value);
  const rootKey = [...roots][0]!;
  const compositionHash = await sha256CompositionValue({
    profile: 'repository-schema-merge/v1',
    schemaHash,
    rootKey,
    sources,
  });
  const compositionId = `studio:merge:${compositionHash}`;
  return {
    definition: merged.definition,
    changes: diffYSchemas(
      target?.schema ?? normalizeYSchemaObject({ yschema: '0.1', name: 'Unbound', nodes: {} }),
      merged.definition
    ),
    schemaHash,
    rootKey,
    sources,
    compositionId,
    compositionHash,
    resource: createYSchemaResourceDescriptor(
      `t3x://schemas/${encodeURIComponent(compositionId)}/r1`,
      merged.definition
    ),
  };
}
export type RepositoryMergedSchema = NonNullable<
  Awaited<ReturnType<typeof prepareRepositorySchemaMerge>>
>;
export const MERGE_SCHEMA_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-repository-merge-yschema',
});

export function validateRepositoryMergedSchema(
  state: State,
  contract: RepositoryMergedSchema,
  run: { id: string; recordedAt: CanonicalTimestamp }
) {
  const content = schemaContentFromDocument(
    state.value as Record<string, unknown>,
    contract.rootKey
  );
  const context = { rootKey: contract.rootKey, relations: content.relations };
  return runRepositorySemanticYSchemaStatementProvider({
    state,
    schema: contract.definition,
    schemaResource: contract.resource,
    context: {
      mode: 'bound',
      resource: createYSchemaContextDescriptor(
        `t3x://schemas/merge-context/${contract.schemaHash}`,
        context
      ),
    },
    environment: { mode: 'unspecified' },
    ...context,
    actor: MERGE_SCHEMA_ACTOR,
    tool: { name: '@t3x-dev/yschema', version: '1' },
    run,
  });
}

export async function persistRepositoryMergedSchema(
  db: AnyDB,
  projectId: string,
  contract: RepositoryMergedSchema
) {
  const selectionHash = await sha256CompositionValue({
    apiVersion: 't3x.dev/studio-selection/v1',
    projectId,
    sources: contract.sources,
  });
  return saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `schema-merge:${projectId}:${contract.compositionHash}`,
    project_id: projectId,
    composition_id: contract.compositionId,
    composition_revision: 1,
    composition_hash: contract.compositionHash,
    compiled_schema_hash: contract.schemaHash,
    compiler_version: 'repository-schema-merge@1',
    manifest_json: { rootKey: contract.rootKey, sources: contract.sources, selectionHash },
    schema_json: { ...contract.definition },
    render_plan_json: [],
    origins_json: {},
  });
}

export async function advanceMergedSchemaWorkspace(input: {
  db: AnyDB;
  projectId: string;
  refName: string;
  expectedHead: string;
  commitDigest: string;
  result: State;
  contract: RepositoryMergedSchema;
}) {
  const drafts = await listWorkspaceDrafts(input.db, input.projectId);
  for (const draft of drafts.filter(
    (item) => item.status === 'editing' && item.target_branch === input.refName
  )) {
    const workspace = draft.workspace_state ?? {};
    const ledger = workspace.authoringLedger as
      | { actions?: unknown[]; compositionRevision?: number }
      | undefined;
    const basis = workspace.authoringBasis as { refHead?: string } | undefined;
    const cached = workspace.workspaceSchemaBase as
      | { snapshot?: { schemaHash?: string | null; bindings?: unknown[] } }
      | undefined;
    const bindings = workspace.schemaBindings as Array<{ schemaHash?: string }> | undefined;
    if (
      !ledger ||
      ledger.actions?.length !== 0 ||
      ledger.compositionRevision !== 0 ||
      basis?.refHead !== input.expectedHead ||
      workspace.schemaPending ||
      bindings?.[0]?.schemaHash !== cached?.snapshot?.schemaHash ||
      !equal(bindings, cached?.snapshot?.bindings)
    )
      continue;
    const { contract } = input;
    const snapshot: WorkspaceSchemaDefinitionSnapshot = {
      status: 'bound',
      schemaHash: contract.schemaHash,
      definition: { ...contract.definition },
      bindings: [
        {
          canonicalName: contract.compositionId,
          schemaName: contract.definition.name,
          version: 'r1',
          mode: 'composition',
          rootKey: contract.rootKey,
          compositionId: contract.compositionId,
          compositionRevision: 1,
          compositionHash: contract.compositionHash,
          schemaHash: contract.schemaHash,
          ...(contract.sources.length ? { studioSources: contract.sources } : {}),
        },
      ],
    };
    await advanceCleanWorkspaceAfterMerge(input.db, {
      draft,
      expectedHead: input.expectedHead,
      commitDigest: input.commitDigest,
      result: input.result.value,
      workspace: {
        ...workspace,
        baseCommitHash: input.commitDigest,
        lastCommitHash: input.commitDigest,
        updatedAt: new Date().toISOString(),
        authoringLedger: createDraftActionLedger(input.result.value as never),
        authoringBasis: {
          ...(workspace.authoringBasis as Record<string, unknown>),
          refHead: input.commitDigest,
          baseDigest: describeTransitionObject(input.result).digest,
          initialization: {
            requestId: `merge:${input.commitDigest}`,
            facts: canonicalizeProtocolValue({ mergeCommit: input.commitDigest }),
          },
        },
        schemaBindings: snapshot.bindings,
        workspaceSchemaBase: { refHead: input.commitDigest, snapshot },
      },
    });
  }
}
