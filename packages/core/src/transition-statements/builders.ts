import {
  type ActorRef,
  describeProtocolObject,
  type Effect,
  type ProposalStatement,
  type State,
} from '@t3x-dev/transition';
import {
  HUMAN_CONFIRMATION_PREDICATE_TYPE,
  type HumanConfirmationPredicate,
  type HumanConfirmationStatement,
  parseHumanConfirmationStatement,
  parseReplayVerificationStatement,
  parseYSchemaValidationStatement,
  REPLAY_VERIFICATION_PREDICATE_TYPE,
  type ReplayVerificationPredicate,
  type ReplayVerificationStatement,
  YSCHEMA_VALIDATION_PREDICATE_TYPE,
  type YSchemaValidationPredicate,
  type YSchemaValidationStatement,
} from './profiles';

export function buildReplayVerificationStatement(input: {
  effect: Effect;
  actor: ActorRef;
  predicate: ReplayVerificationPredicate;
}): ReplayVerificationStatement {
  return parseReplayVerificationStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(input.effect)],
    actor: input.actor,
    predicateType: REPLAY_VERIFICATION_PREDICATE_TYPE,
    predicate: input.predicate,
  });
}

export function buildYSchemaValidationStatement(input: {
  state: State;
  actor: ActorRef;
  predicate: YSchemaValidationPredicate;
}): YSchemaValidationStatement {
  return parseYSchemaValidationStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(input.state)],
    actor: input.actor,
    predicateType: YSCHEMA_VALIDATION_PREDICATE_TYPE,
    predicate: input.predicate,
  });
}

export function buildHumanConfirmationStatement(input: {
  proposal: ProposalStatement;
  actor: ActorRef & { kind: 'human' };
  predicate: HumanConfirmationPredicate;
}): HumanConfirmationStatement {
  return parseHumanConfirmationStatement({
    schema: 't3x/statement/v1',
    subjects: [describeProtocolObject(input.proposal)],
    actor: input.actor,
    predicateType: HUMAN_CONFIRMATION_PREDICATE_TYPE,
    predicate: input.predicate,
  });
}
