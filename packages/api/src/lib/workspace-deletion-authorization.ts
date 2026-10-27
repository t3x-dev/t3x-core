import { createHash } from 'node:crypto';
import {
  currentComposition,
  type DraftActionActor,
  type DraftActionLedger,
  type DraftActionRecord,
  draftLedgerAtRevision,
} from '@t3x-dev/application';
import { createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';

export const DELETION_AUTHORIZATIONS = 'authoringDeletionAuthorizations';
export function pureDeletionPaths(operations: readonly unknown[]): string[] {
  const paths: string[] = [];
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return [];
    const keys = Object.keys(operation);
    if (keys.length !== 1) return [];
    const name = keys[0];
    if (name === 'assert') continue;
    if (!['unset', 'drop'].includes(name)) return [];
    const payload = (operation as Record<string, unknown>)[name];
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof (payload as { path?: unknown }).path !== 'string'
    )
      return [];
    paths.push((payload as { path: string }).path);
  }
  return [...new Set(paths)].sort();
}
export interface DeletionAuthorization {
  schema: 't3x.application/deletion-authorization/v1';
  subjectDigest: string;
  actionId: string;
  paths: string[];
  actor: DraftActionActor;
  confirmedAt: string;
}
export function deletionSubject(
  projectId: string,
  workspaceId: string,
  basis: unknown,
  ledger: DraftActionLedger,
  action: DraftActionRecord
) {
  const paths = action.generation ? pureDeletionPaths(action.operations) : [];
  if (!paths.length) return null;
  const state = (revision: number) =>
    describeTransitionObject(
      createYOpsState(currentComposition(draftLedgerAtRevision(ledger, revision)))
    ).digest;
  const subject = {
    projectId,
    workspaceId,
    basis,
    actionId: action.actionId,
    operations: action.operations,
    generation: action.generation,
    before: state(action.beforeRevision),
    after: state(action.afterRevision),
    paths,
  };
  return {
    actionId: action.actionId,
    paths,
    digest: `sha256:${createHash('sha256')
      .update(canonicalizeProtocolValue(JSON.parse(JSON.stringify(subject))))
      .digest('hex')}`,
  };
}
export function deletionAuthorizations(
  workspace: Record<string, unknown>
): DeletionAuthorization[] {
  return Array.isArray(workspace[DELETION_AUTHORIZATIONS])
    ? (workspace[DELETION_AUTHORIZATIONS] as DeletionAuthorization[])
    : [];
}
export function matchingDeletionAuthorization(
  receipts: DeletionAuthorization[],
  subject: ReturnType<typeof deletionSubject>
) {
  return subject
    ? receipts.find(
        (receipt) =>
          receipt?.schema === 't3x.application/deletion-authorization/v1' &&
          receipt.actionId === subject.actionId &&
          JSON.stringify(receipt.paths) === JSON.stringify(subject.paths) &&
          receipt.subjectDigest === subject.digest &&
          receipt.actor?.kind === 'human' &&
          !!receipt.actor.id &&
          Number.isFinite(Date.parse(receipt.confirmedAt))
      )
    : undefined;
}
