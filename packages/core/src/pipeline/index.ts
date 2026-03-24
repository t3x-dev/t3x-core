/**
 * Pipeline intelligence layer exports.
 *
 * Step 1: SessionStateManager — conversation state + pipeline decision
 */

export { detectAmbiguity, parseAmbiguityResponse, type AmbiguityResult } from './ambiguityDetector';
export {
  type AnswerApplyResult,
  applyAnswer,
  applyStructuralAnswer,
  applyVaguenessAnswer,
  generateCollapseDelta,
} from './answerApplier';
export { checkDiffCompatibility, type DiffCheckResult } from './diffCompatibilityCheck';
export { detectDrift, parseDriftResponse } from './driftDetector';
export { preFilterDrift, type PreFilterResult } from './driftPreFilter';
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
// Step 7: EventEmitter
export {
  PipelineEventEmitter,
  pipelineEmitter,
  type ExtractionCompletedEvent,
  type PipelineEventMap,
  type QuestionGeneratedEvent,
  type TopicChangedEvent,
} from './eventEmitter';
