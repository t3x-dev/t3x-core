import { StudioSourceSchema } from '@t3x-dev/api-client';
import { type ApiKeyPrincipalKind, describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  type CreateBranchInput,
  DraftAuthoringConflictError,
  findBranchByName,
  findTransitionCommitReceipt,
  findWorkspaceDraft,
  findYSchemaCompositionSnapshot,
  getRepositoryDecisionAuditByDigest,
  getTransitionPolicyBinding,
  getTransitionRefHead,
  getTransitionViewForCommit,
  getVerifiedTransitionCommitGraph,
  insertBranch,
  NotFoundError,
  resolveTransitionProposalGraph,
  upsertWorkspaceDraft,
  type WorkspaceOwner,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { initializeWorkspaceAuthoring } from './workspace-authoring';
import { isSchemaOnlyWorkspaceReview } from './workspace-schema-content';
import {
  frozenWorkspaceSchemaReview,
  hasSchemaReviewEvidence,
  recoverCommittedSchema,
  unboundWorkspaceSchema,
} from './workspace-schema-review';
import { resolveWorkspaceYSchema } from './workspace-yschema';

interface CreateBranchWorkspaceInput extends CreateBranchInput {
  actor?: { kind: ApiKeyPrincipalKind; id: string };
  owner?: WorkspaceOwner;
}

/** Content and Schema are pinned to one inherited Commit. No mutable parent Draft is consulted. */
export async function createBranchWorkspace(db: AnyDB, input: CreateBranchWorkspaceInput) {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    const parent = input.parentBranch
      ? await findBranchByName(tx, input.projectId, input.parentBranch)
      : null;
    if (input.parentBranch && !parent) throw new NotFoundError(input.parentBranch);
    if (
      input.headCommitHash !== undefined &&
      !(await getVerifiedTransitionCommitGraph(tx, input.projectId, input.headCommitHash))
    ) {
      throw new NotFoundError(input.headCommitHash);
    }
    const branch = await insertBranch(tx, input);
    if (
      input.headCommitHash === undefined &&
      parent &&
      branch.headCommitHash !== parent.headCommitHash
    )
      throw new DraftAuthoringConflictError('Source branch changed while branching. Try again.');
    if (parent) {
      const parentPolicy = await getTransitionPolicyBinding(tx, input.projectId, parent.name);
      if (parentPolicy) {
        await bindTransitionPolicy(tx, {
          projectId: input.projectId,
          refName: branch.name,
          uri: parentPolicy.resource.uri,
          policy: parentPolicy.policy,
          actor: input.actor ?? { kind: 'service', id: 'service:t3x-branch-workspace' },
        });
      }
    }
    const head = await getTransitionRefHead(tx, {
      projectId: input.projectId,
      refName: branch.name,
    });
    let schema = unboundWorkspaceSchema();
    let sourceBundle: unknown[] = [];
    if (head.format !== 'empty') {
      const committed = await getVerifiedTransitionCommitGraph(tx, input.projectId, head.head);
      if (!committed) throw new DraftAuthoringConflictError('The inherited Commit is unavailable.');
      const receipt = await findTransitionCommitReceipt(tx, input.projectId, head.head);
      const graph = receipt
        ? await resolveTransitionProposalGraph(tx, input.projectId, receipt.transitionId)
        : null;
      if (graph?.preparation) {
        const preparation = JSON.parse(graph.preparation.canonicalJson) as Record<string, unknown>;
        if (
          preparation.schema === 't3x.application/workspace-authoring-preparation/v1' &&
          Array.isArray(preparation.sourceBundle)
        ) {
          sourceBundle = structuredClone(preparation.sourceBundle);
        }
      }
      if (
        graph &&
        (graph.membership.proposalDigest !== describeTransitionObject(committed.proposal).digest ||
          graph.membership.effectDigest !== describeTransitionObject(committed.effect).digest)
      )
        throw new DraftAuthoringConflictError(
          'The committed Schema preparation does not match the inherited Commit.'
        );
      const audit = await getRepositoryDecisionAuditByDigest(
        tx,
        input.projectId,
        head.commit.decision.digest
      );
      const refName = graph?.membership.refName ?? audit?.refName;
      if (!refName)
        throw new DraftAuthoringConflictError(
          'The inherited Commit has no recoverable source authority.'
        );
      const view = await getTransitionViewForCommit(tx, {
        projectId: input.projectId,
        refName,
        commitId: head.head,
      });
      if (view?.mode !== 'transition')
        throw new DraftAuthoringConflictError('The inherited Commit could not be verified.');
      const hashes = new Set<string>(
        view.checks.validation.runs.map((run) => run.predicate.schemaResource.digest)
      );
      const frozenReview = graph ? frozenWorkspaceSchemaReview(graph) : null;
      const frozen = frozenReview?.draft;
      if (frozen) schema = frozen;
      else if (hashes.size) {
        const recovered = await recoverCommittedSchema(
          tx,
          input.projectId,
          refName,
          head.head,
          schema
        );
        if (!recovered)
          throw new DraftAuthoringConflictError(
            'The exact committed Schema is unavailable. No branch was created.'
          );
        schema = recovered;
      }
      if (schema.status === 'bound') {
        const resolved = await resolveWorkspaceYSchema(
          { schemaBindings: schema.bindings },
          tx,
          input.projectId
        );
        if (
          (!(
            frozenReview &&
            isSchemaOnlyWorkspaceReview(frozenReview) &&
            (await hasSchemaReviewEvidence(committed.proposal, frozenReview))
          ) &&
            (hashes.size !== 1 || !hashes.has(schema.schemaHash!))) ||
          !schema.definition ||
          !resolved.schema ||
          (await sha256CompositionValue(normalizeYSchemaObject(schema.definition))) !==
            schema.schemaHash ||
          (await sha256CompositionValue(resolved.schema)) !== schema.schemaHash
        )
          throw new DraftAuthoringConflictError(
            'The exact committed Schema failed verification. No branch was created.'
          );
      } else if (hashes.size) {
        throw new DraftAuthoringConflictError(
          'The committed Schema binding is missing. No branch was created.'
        );
      }
    }
    const workspaceId = `workspace_branch:${encodeURIComponent(branch.name)}`;
    if (await findWorkspaceDraft(tx, input.projectId, workspaceId))
      throw new DraftAuthoringConflictError(
        'A Workspace already exists for the new branch. No existing Draft was changed.'
      );
    const savedAt = new Date().toISOString();
    const bindings = structuredClone(schema.bindings);
    for (const binding of bindings) {
      if (
        binding.studioSources ||
        typeof binding.compositionId !== 'string' ||
        typeof binding.compositionRevision !== 'number'
      )
        continue;
      const snapshot = await findYSchemaCompositionSnapshot(tx, {
        project_id: input.projectId,
        composition_id: binding.compositionId,
        composition_revision: binding.compositionRevision,
        compiled_schema_hash: schema.schemaHash ?? undefined,
      });
      const sources = StudioSourceSchema.array().min(1).safeParse(snapshot?.manifestJson.sources);
      if (sources.success) binding.studioSources = sources.data;
    }
    const workspace = {
      id: workspaceId,
      projectId: input.projectId,
      title: `Branch workspace: ${branch.name}`,
      summary: `Workspace branched from ${input.parentBranch ?? 'empty state'}.`,
      status: 'draft',
      updatedAt: savedAt,
      baseCommitHash: head.head,
      targetBranch: branch.name,
      sourceBundle,
      schemaBindings: bindings,
      schemaCandidate: { summary: 'Propose changes to this branch.', fields: [] },
      schemaReview: { verdict: 'needs_review', summary: 'No changes proposed yet.', gaps: [] },
      yopsDraft: { id: `draft:${workspaceId}`, operations: [] },
      outputTargets: [],
      workspaceSchemaBase: { refHead: head.head, snapshot: structuredClone(schema) },
    };
    const draft = await upsertWorkspaceDraft(tx, {
      project_id: input.projectId,
      workspace_id: workspaceId,
      title: workspace.title,
      parent_commit_hash: head.head,
      target_branch: branch.name,
      ...(input.owner ? { owner: input.owner } : {}),
      workspace_state: workspace,
    });
    await initializeWorkspaceAuthoring(tx, {
      projectId: input.projectId,
      workspaceId,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: head.head,
      actionId: `branch:${branch.branchId}`,
      actor: { kind: 'service', id: 'service:t3x-branch-workspace' },
    });
    return branch;
  });
}
