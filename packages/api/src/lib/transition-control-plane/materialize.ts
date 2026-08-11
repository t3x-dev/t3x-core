import type { ProposalStatement } from '@t3x-dev/core';
import {
  type AnyDB,
  createTransitionProposalMembership,
  digestTransitionPreparationCanonicalJson,
  digestTransitionRequestCanonicalJson,
  recordTransitionStatementMembership,
  type TransitionRequestKind,
} from '@t3x-dev/storage';
import {
  canonicalizeProtocolValue,
  type Effect,
  type ProtocolValue,
  type State,
  type Statement,
} from '@t3x-dev/transition';

type ActorRef = ProposalStatement['actor'];

export function canonicalTransitionRequest(value: ProtocolValue): {
  canonicalJson: string;
  digest: `sha256:${string}`;
} {
  const canonicalJson = canonicalizeProtocolValue(value);
  return {
    canonicalJson,
    digest: digestTransitionRequestCanonicalJson(canonicalJson),
  };
}

function canonicalTransitionPreparation(value: ProtocolValue): {
  canonicalJson: string;
  digest: `sha256:${string}`;
} {
  const canonicalJson = canonicalizeProtocolValue(value);
  return {
    canonicalJson,
    digest: digestTransitionPreparationCanonicalJson(canonicalJson),
  };
}

/** Persist one immutable Proposal graph behind a stable application request identity. */
export async function materializeTransitionProposal(input: {
  db: AnyDB;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  refName: string;
  refHead: string | null;
  requestKind: TransitionRequestKind;
  requestFacts: ProtocolValue;
  preparationFacts?: ProtocolValue;
  requestId: string;
  actor: ActorRef;
  base: State;
  result: State;
  effect: Effect;
  proposal: ProposalStatement;
}) {
  const request = canonicalTransitionRequest(input.requestFacts);
  const preparation =
    input.preparationFacts === undefined
      ? undefined
      : canonicalTransitionPreparation(input.preparationFacts);
  return createTransitionProposalMembership(input.db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    refName: input.refName,
    refHead: input.refHead,
    requestKind: input.requestKind,
    requestCanonicalJson: request.canonicalJson,
    requestDigest: request.digest,
    ...(preparation === undefined
      ? {}
      : {
          preparationCanonicalJson: preparation.canonicalJson,
          preparationDigest: preparation.digest,
        }),
    requestId: input.requestId,
    actor: input.actor,
    base: input.base,
    result: input.result,
    effect: input.effect,
    proposal: input.proposal,
  });
}

/** Persist one Statement membership using the same canonical request digest law as Verify. */
export async function materializeTransitionStatement(input: {
  db: AnyDB;
  projectId: string;
  transitionId: string;
  statement: Statement;
  source: string;
  issuer: ActorRef;
  requestId: string;
  requestFacts: ProtocolValue;
}) {
  const request = canonicalTransitionRequest(input.requestFacts);
  return recordTransitionStatementMembership(input.db, {
    projectId: input.projectId,
    transitionId: input.transitionId,
    statement: input.statement,
    source: input.source,
    issuer: input.issuer,
    requestId: input.requestId,
    requestDigest: request.digest,
  });
}
