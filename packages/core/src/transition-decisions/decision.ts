import {
  type CanonicalTimestamp,
  type DecisionStatement,
  parseDecisionStatement,
} from '@t3x-dev/transition';
import {
  type EvaluateAcceptanceInput,
  evaluateAcceptance,
  type PolicyEvaluation,
  type PolicyFailure,
} from './evaluation';

export type DecisionCreationResult =
  | { ok: true; decision: DecisionStatement; evaluation: PolicyEvaluation }
  | { ok: false; evaluation: PolicyEvaluation; failures: PolicyFailure[] };

/**
 * Re-evaluate exact inputs before materializing the existing closed Decision
 * Statement. Preview evaluations are not authority tokens and cannot be forged
 * into Decisions by flipping a `permitted` field.
 *
 * This function establishes policy evaluation, not issuer authenticity. A
 * repository or MCP service MUST accept its result only through a trusted
 * decision path; a structurally valid Decision parsed elsewhere is not proof
 * that this evaluator authorized it.
 *
 * A rejected Decision is auditable; CommitV2 verification separately refuses it.
 */
export function createDecisionStatement(
  input: EvaluateAcceptanceInput & {
    decidedAt: CanonicalTimestamp;
  }
): DecisionCreationResult {
  const evaluation = evaluateAcceptance(input);
  if (!evaluation.permitted) {
    return { ok: false, evaluation, failures: evaluation.failures };
  }
  return {
    ok: true,
    evaluation,
    decision: parseDecisionStatement({
      schema: 't3x/statement/v1',
      subjects: [evaluation.proposal],
      actor: evaluation.actor,
      predicateType: 't3x.decision/v1',
      predicate: {
        policy: { mode: 'evaluated', resource: evaluation.policy },
        considered: evaluation.considered,
        outcome: evaluation.requestedOutcome,
        rationale: evaluation.rationale,
        decidedAt: input.decidedAt,
      },
    }),
  };
}
