import {
  type CommitV2,
  DECISION_PREDICATE_TYPE,
  type DecisionStatement,
  EFFECT_SCHEMA,
  type Effect,
  PROPOSAL_PREDICATE_TYPE,
  type ProposalStatement,
  STATEMENT_SCHEMA,
  type Statement,
} from './contracts';
import { IntegrityChainInvalidError } from './errors';
import {
  parseCommitV2,
  parseDecisionStatement,
  parseEffect,
  parseProposalStatement,
  parseStatement,
} from './parse';
import { type ObjectResolver, resolveProtocolObject } from './resolver';

export interface VerifiedCommitIntegrity {
  commit: CommitV2;
  decision: DecisionStatement;
  proposal: ProposalStatement;
  effect: Effect;
  parents: CommitV2[];
}

function descriptorsEqual(
  left: { kind: string; schema: string; digest: string },
  right: { kind: string; schema: string; digest: string }
): boolean {
  return left.kind === right.kind && left.schema === right.schema && left.digest === right.digest;
}

export async function verifyStatementSubjects(
  statement: Statement,
  resolver: ObjectResolver
): Promise<void> {
  const parsed = parseStatement(statement);
  for (const subject of parsed.subjects) await resolveProtocolObject(resolver, subject);
}

/** Verify Commit -> Decision -> Proposal -> Effect references without evaluating policy or replay. */
export async function verifyCommitIntegrity(
  commit: CommitV2,
  resolver: ObjectResolver
): Promise<VerifiedCommitIntegrity> {
  const parsedCommit = parseCommitV2(commit);
  const decisionObject = await resolveProtocolObject(resolver, parsedCommit.decision);
  if (
    decisionObject.schema !== STATEMENT_SCHEMA ||
    decisionObject.predicateType !== DECISION_PREDICATE_TYPE
  ) {
    throw new IntegrityChainInvalidError(
      'CommitV2.decision must resolve to a t3x.decision/v1 Statement'
    );
  }
  const decision = parseDecisionStatement(decisionObject);
  if (decision.predicate.outcome === 'rejected') {
    throw new IntegrityChainInvalidError('A rejected Decision cannot be committed');
  }

  const proposalObject = await resolveProtocolObject(resolver, decision.subjects[0]);
  if (
    proposalObject.schema !== STATEMENT_SCHEMA ||
    proposalObject.predicateType !== PROPOSAL_PREDICATE_TYPE
  ) {
    throw new IntegrityChainInvalidError(
      'Decision subject must resolve to a t3x.proposal/v1 Statement'
    );
  }
  const proposal = parseProposalStatement(proposalObject);

  const effectObject = await resolveProtocolObject(resolver, proposal.subjects[0]);
  if (effectObject.schema !== EFFECT_SCHEMA) {
    throw new IntegrityChainInvalidError('Proposal subject must resolve to an Effect');
  }
  const effect = parseEffect(effectObject);
  if (!descriptorsEqual(parsedCommit.result, effect.result)) {
    throw new IntegrityChainInvalidError('CommitV2.result must equal the Effect claimed Result');
  }

  await resolveProtocolObject(resolver, effect.base);
  await resolveProtocolObject(resolver, parsedCommit.result);
  for (const considered of decision.predicate.considered) {
    const consideredObject = await resolveProtocolObject(resolver, considered);
    await verifyStatementSubjects(parseStatement(consideredObject), resolver);
  }

  const parents: CommitV2[] = [];
  for (const parentDescriptor of parsedCommit.parents) {
    const parentObject = await resolveProtocolObject(resolver, parentDescriptor);
    parents.push(parseCommitV2(parentObject));
  }
  const firstParent = parents[0];
  if (firstParent !== undefined && !descriptorsEqual(firstParent.result, effect.base)) {
    throw new IntegrityChainInvalidError(
      'First-parent Result must equal the Effect Base descriptor'
    );
  }

  return { commit: parsedCommit, decision, proposal, effect, parents };
}
