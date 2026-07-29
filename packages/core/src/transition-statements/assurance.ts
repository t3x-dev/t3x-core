import {
  type ActorRef,
  type DecisionStatement,
  describeProtocolObject,
  type ProposalStatement,
  parseDecisionStatement,
  parseProposalStatement,
  parseStatement,
  type Statement,
  type StatementDescriptor,
} from '@t3x-dev/transition';
import {
  HUMAN_CONFIRMATION_PREDICATE_TYPE,
  type HumanConfirmationPredicate,
  parseHumanConfirmationStatement,
  parseReplayVerificationStatement,
  parseYSchemaValidationStatement,
  REPLAY_VERIFICATION_PREDICATE_TYPE,
  type ReplayVerificationPredicate,
  YSCHEMA_VALIDATION_PREDICATE_TYPE,
  type YSchemaValidationPredicate,
} from './profiles';

export interface ObservationScope {
  completeness: 'complete' | 'partial';
  sources: string[];
}

export type ObservationState = 'observed' | 'no_statement_observed';

export interface ObservedRun<Predicate> {
  statement: StatementDescriptor;
  actor: ActorRef;
  predicate: Predicate;
}

export interface UnsupportedProfileObservation {
  statement: StatementDescriptor;
  actor: ActorRef;
  predicateType: string;
}

export interface AssuranceReport {
  structure: 'valid';
  objectIntegrity: 'verified' | 'not_checked';
  observationScope: ObservationScope;
  replay: {
    observation: ObservationState;
    outcomes: Array<ReplayVerificationPredicate['outcome'] | 'unsupported'>;
    runs: ObservedRun<ReplayVerificationPredicate>[];
    unsupportedProfiles: UnsupportedProfileObservation[];
  };
  claims:
    | { observation: 'not_supplied' }
    | {
        observation: 'supplied';
        proposal: StatementDescriptor;
        intent: ProposalStatement['predicate']['intent']['mode'];
        rationale: ProposalStatement['predicate']['rationale']['mode'];
      };
  evidence:
    | { observation: 'not_supplied' }
    | {
        observation: 'supplied';
        intent: number;
        rationale: number;
      };
  validation: {
    observation: ObservationState;
    outcomes: Array<YSchemaValidationPredicate['outcome'] | 'unsupported'>;
    runs: ObservedRun<YSchemaValidationPredicate>[];
    unsupportedProfiles: UnsupportedProfileObservation[];
  };
  humanConfirmation: {
    observation: ObservationState;
    runs: ObservedRun<HumanConfirmationPredicate>[];
  };
  decision:
    | { observation: 'not_supplied' }
    | {
        observation: 'supplied';
        statement: StatementDescriptor;
        outcome: DecisionStatement['predicate']['outcome'];
      };
}

export interface DeriveAssuranceReportInput {
  observationScope: ObservationScope;
  statements: readonly Statement[];
  proposal?: ProposalStatement;
  decision?: DecisionStatement;
  objectIntegrity?: 'verified' | 'not_checked';
}

function normalizedScope(scope: ObservationScope): ObservationScope {
  if (scope.sources.some((source) => source.length === 0)) {
    throw new TypeError('Observation scope sources must be non-empty');
  }
  const sources = [...new Set(scope.sources)].sort();
  if (sources.length !== scope.sources.length) {
    throw new TypeError('Observation scope sources must be unique');
  }
  return { completeness: scope.completeness, sources };
}

function evidenceCount(claim: ProposalStatement['predicate']['intent']): number {
  return claim.mode === 'unspecified' ? 0 : claim.evidence.length;
}

function sortedRuns<T extends { statement: StatementDescriptor }>(runs: T[]): T[] {
  return runs.sort((left, right) => left.statement.digest.localeCompare(right.statement.digest));
}

function sortedOutcomes<T extends string>(outcomes: T[]): T[] {
  return [...new Set(outcomes)].sort();
}

function unsupportedProfile(statement: Statement): UnsupportedProfileObservation {
  return {
    statement: describeProtocolObject(statement),
    actor: statement.actor,
    predicateType: statement.predicateType,
  };
}

/**
 * Derive a deterministic, non-authoritative read model from the exact objects
 * visible in one observation scope. Array order is digest order, never recency.
 */
export function deriveAssuranceReport(input: DeriveAssuranceReportInput): AssuranceReport {
  const replayRuns: ObservedRun<ReplayVerificationPredicate>[] = [];
  const validationRuns: ObservedRun<YSchemaValidationPredicate>[] = [];
  const confirmationRuns: ObservedRun<HumanConfirmationPredicate>[] = [];
  const replayUnsupported: UnsupportedProfileObservation[] = [];
  const validationUnsupported: UnsupportedProfileObservation[] = [];

  for (const candidate of input.statements) {
    const statement = parseStatement(candidate);
    const descriptor = describeProtocolObject(statement);

    if (statement.predicateType === REPLAY_VERIFICATION_PREDICATE_TYPE) {
      const parsed = parseReplayVerificationStatement(statement);
      replayRuns.push({ statement: descriptor, actor: parsed.actor, predicate: parsed.predicate });
      continue;
    }
    if (statement.predicateType.startsWith('t3x.dev/replay-verification/')) {
      replayUnsupported.push(unsupportedProfile(statement));
      continue;
    }
    if (statement.predicateType === YSCHEMA_VALIDATION_PREDICATE_TYPE) {
      const parsed = parseYSchemaValidationStatement(statement);
      validationRuns.push({
        statement: descriptor,
        actor: parsed.actor,
        predicate: parsed.predicate,
      });
      continue;
    }
    if (statement.predicateType.startsWith('t3x.dev/yschema-validation/')) {
      validationUnsupported.push(unsupportedProfile(statement));
      continue;
    }
    if (statement.predicateType === HUMAN_CONFIRMATION_PREDICATE_TYPE) {
      const parsed = parseHumanConfirmationStatement(statement);
      confirmationRuns.push({
        statement: descriptor,
        actor: parsed.actor,
        predicate: parsed.predicate,
      });
    }
  }

  const proposal =
    input.proposal === undefined ? undefined : parseProposalStatement(input.proposal);
  const decision =
    input.decision === undefined ? undefined : parseDecisionStatement(input.decision);
  const replayObserved = replayRuns.length + replayUnsupported.length > 0;
  const validationObserved = validationRuns.length + validationUnsupported.length > 0;

  return {
    structure: 'valid',
    objectIntegrity: input.objectIntegrity ?? 'not_checked',
    observationScope: normalizedScope(input.observationScope),
    replay: {
      observation: replayObserved ? 'observed' : 'no_statement_observed',
      outcomes: sortedOutcomes([
        ...replayRuns.map((run) => run.predicate.outcome),
        ...replayUnsupported.map(() => 'unsupported' as const),
      ]),
      runs: sortedRuns(replayRuns),
      unsupportedProfiles: sortedRuns(replayUnsupported),
    },
    claims:
      proposal === undefined
        ? { observation: 'not_supplied' }
        : {
            observation: 'supplied',
            proposal: describeProtocolObject(proposal),
            intent: proposal.predicate.intent.mode,
            rationale: proposal.predicate.rationale.mode,
          },
    evidence:
      proposal === undefined
        ? { observation: 'not_supplied' }
        : {
            observation: 'supplied',
            intent: evidenceCount(proposal.predicate.intent),
            rationale: evidenceCount(proposal.predicate.rationale),
          },
    validation: {
      observation: validationObserved ? 'observed' : 'no_statement_observed',
      outcomes: sortedOutcomes([
        ...validationRuns.map((run) => run.predicate.outcome),
        ...validationUnsupported.map(() => 'unsupported' as const),
      ]),
      runs: sortedRuns(validationRuns),
      unsupportedProfiles: sortedRuns(validationUnsupported),
    },
    humanConfirmation: {
      observation: confirmationRuns.length > 0 ? 'observed' : 'no_statement_observed',
      runs: sortedRuns(confirmationRuns),
    },
    decision:
      decision === undefined
        ? { observation: 'not_supplied' }
        : {
            observation: 'supplied',
            statement: describeProtocolObject(decision),
            outcome: decision.predicate.outcome,
          },
  };
}
