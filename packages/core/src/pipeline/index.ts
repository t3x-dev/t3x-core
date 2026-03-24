/**
 * Pipeline intelligence layer exports.
 *
 * Step 1: SessionStateManager — conversation state + pipeline decision
 */

export { type AmbiguityResult, detectAmbiguity, parseAmbiguityResponse } from './ambiguityDetector';
export {
  type AnswerApplyResult,
  applyAnswer,
  applyStructuralAnswer,
  applyVaguenessAnswer,
  generateCollapseDelta,
} from './answerApplier';
export { checkDiffCompatibility, type DiffCheckResult } from './diffCompatibilityCheck';
export { detectDrift, parseDriftResponse } from './driftDetector';
export { type PreFilterResult, preFilterDrift } from './driftPreFilter';
// Step 7: EventEmitter
export {
  type ExtractionCompletedEvent,
  PipelineEventEmitter,
  type PipelineEventMap,
  pipelineEmitter,
  type QuestionGeneratedEvent,
  type TopicChangedEvent,
} from './eventEmitter';
export { checkReadiness, type ReadinessBlockReason, type ReadinessResult } from './readinessGate';
export { computeSessionContext, decideAction } from './sessionStateManager';
export type {
  AdvisoryQuestion,
  DriftDecision,
  DriftResult,
  PipelineDecision,
  PipelineOrchestratorContext,
  SessionContext,
  UserAnswer,
} from './types';
