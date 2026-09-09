import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { branches, projects } from '../schema';
import {
  transitionPolicyBindings,
  transitionProposalMemberships,
  transitionStatementMemberships,
} from '../schema-transition-commits';
import { drafts } from '../schema-trees';

/**
 * Lock every mutable row that contributes to one Transition review.
 *
 * The caller must pass a transaction-scoped database handle and keep the
 * transaction open through Decision authorization and persistence. Locks are
 * acquired in the same order used by Commit (ref before workspace) to avoid a
 * ref/workspace lock-order inversion.
 *
 * The project parent is locked first so the foreign-key KEY SHARE lock needed
 * by a first policy-binding insert cannot create an unlocked absent-row
 * phantom. The Proposal membership is locked next even though it is immutable.
 * A new Statement membership must acquire a PostgreSQL KEY SHARE lock on that
 * parent row to satisfy its foreign key, which conflicts with this UPDATE lock.
 * That closes the append-only phantom gap that locking only the current
 * Statement rows would leave open.
 */
export interface TransitionReviewLockResult {
  membershipFound: boolean;
  policyBindingFound: boolean;
}

async function lockTransitionProjectParent(db: AnyDB, projectId: string): Promise<void> {
  await db
    .select({ projectId: projects.projectId })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1)
    .for('update');
}

async function lockTransitionPolicyBindingRow(
  db: AnyDB,
  projectId: string,
  refName: string
): Promise<boolean> {
  const policyBindings = await db
    .select({ policyDigest: transitionPolicyBindings.policyDigest })
    .from(transitionPolicyBindings)
    .where(
      and(
        eq(transitionPolicyBindings.projectId, projectId),
        eq(transitionPolicyBindings.refName, refName)
      )
    )
    .limit(1)
    .for('update');
  return policyBindings.length === 1;
}

/**
 * Seal one project/ref policy pointer, including its absence.
 *
 * The caller must use a transaction-scoped handle and keep the transaction
 * open while loading, validating, authorizing with, and persisting against the
 * binding. Locking the project parent blocks the foreign-key KEY SHARE lock a
 * first binding insert needs when no binding tuple exists yet.
 */
export async function acquireTransitionPolicyBindingLock(
  db: AnyDB,
  projectId: string,
  refName: string
): Promise<{ policyBindingFound: boolean }> {
  await lockTransitionProjectParent(db, projectId);
  return {
    policyBindingFound: await lockTransitionPolicyBindingRow(db, projectId, refName),
  };
}

export async function acquireTransitionReviewLock(
  db: AnyDB,
  projectId: string,
  transitionId: string
): Promise<TransitionReviewLockResult> {
  await lockTransitionProjectParent(db, projectId);

  const [membership] = await db
    .select({
      workspaceId: transitionProposalMemberships.workspaceId,
      refName: transitionProposalMemberships.refName,
    })
    .from(transitionProposalMemberships)
    .where(
      and(
        eq(transitionProposalMemberships.projectId, projectId),
        eq(transitionProposalMemberships.transitionId, transitionId)
      )
    )
    .limit(1)
    .for('update');
  if (membership === undefined) {
    return { membershipFound: false, policyBindingFound: false };
  }

  await db
    .select({ statementDigest: transitionStatementMemberships.statementDigest })
    .from(transitionStatementMemberships)
    .where(eq(transitionStatementMemberships.transitionId, transitionId))
    .for('update');

  await db
    .select({ branchId: branches.branchId })
    .from(branches)
    .where(and(eq(branches.projectId, projectId), eq(branches.name, membership.refName)))
    .limit(1)
    .for('update');

  await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.projectId, projectId), eq(drafts.workspaceId, membership.workspaceId)))
    .limit(1)
    .for('update');

  const policyBindingFound = await lockTransitionPolicyBindingRow(
    db,
    projectId,
    membership.refName
  );
  return { membershipFound: true, policyBindingFound };
}
