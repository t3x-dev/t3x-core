import { randomUUID } from 'node:crypto';
import {
  type AnyDB,
  branches,
  getTransitionRefHead,
  listWorkspaceDraftsForOwner,
  NotFoundError,
  projects,
  TransitionHeadConflictError,
  upsertWorkspaceDraft,
  type WorkspaceOwner,
} from '@t3x-dev/storage';
import type { ActorRef } from '@t3x-dev/transition';
import { and, eq } from 'drizzle-orm';
import { initializeWorkspaceAuthoring } from './workspace-authoring';
import { readCommittedSchemaBinding, unboundWorkspaceSchema } from './workspace-schema-review';

export async function openWorkspace(
  db: AnyDB,
  input: {
    projectId: string;
    ref: string;
    expectedHead: string | null;
    requestId: string;
    actor: ActorRef;
    owner: WorkspaceOwner;
  }
) {
  const { projectId, ref, expectedHead, owner } = input;
  return db.transaction(async (rawTx) => {
    const tx = rawTx as AnyDB;
    // Follow Review's project-before-ref lock order while allowing foreign-key readers.
    await tx
      .select({ id: projects.projectId })
      .from(projects)
      .where(eq(projects.projectId, projectId))
      .for('no key update');
    const [branch] = await tx
      .select({ id: branches.branchId })
      .from(branches)
      .where(and(eq(branches.projectId, projectId), eq(branches.name, ref)))
      .for('update');
    if (!branch) throw new NotFoundError(ref);
    const head = await getTransitionRefHead(tx, { projectId, refName: ref });
    if (head.head !== expectedHead) throw new TransitionHeadConflictError(expectedHead, head.head);

    const existing = (await listWorkspaceDraftsForOwner(tx, projectId, owner)).find(
      (draft) => draft.target_branch === ref && draft.workspace_state?.status !== 'committed'
    );
    if (existing?.workspace_id) {
      const basis = existing.workspace_state?.authoringBasis as
        | { refHead?: string | null }
        | undefined;
      return {
        workspace_id: existing.workspace_id,
        workspace_revision: existing.revision,
        basis_ref_head:
          basis?.refHead === undefined ? (existing.parent_commit_hash ?? null) : basis.refHead,
        head_commit_hash: head.head,
        created: false,
      };
    }

    const schema =
      head.head === null
        ? unboundWorkspaceSchema()
        : await readCommittedSchemaBinding(tx, projectId, head.head);
    if (!schema) throw new NotFoundError(ref);
    const workspaceId = `workspace_open:${randomUUID()}`;
    const draft = await upsertWorkspaceDraft(tx, {
      project_id: projectId,
      workspace_id: workspaceId,
      target_branch: ref,
      title: ref,
      parent_commit_hash: head.head,
      owner,
      workspace_state: {
        id: workspaceId,
        projectId,
        targetBranch: ref,
        title: ref,
        status: 'draft',
        baseCommitHash: head.head,
        schemaBindings: schema.bindings,
        workspaceSchemaBase: { refHead: head.head, snapshot: schema },
        sourceBundle: [],
        yopsDraft: { id: `draft:${workspaceId}`, operations: [] },
        outputTargets: [],
      },
    });
    const opened = await initializeWorkspaceAuthoring(tx, {
      projectId,
      workspaceId,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: head.head,
      actionId: input.requestId,
      actor: input.actor,
    });
    return {
      workspace_id: workspaceId,
      workspace_revision: opened.draft.revision,
      basis_ref_head: opened.value.basis.refHead,
      head_commit_hash: head.head,
      created: true,
    };
  });
}
