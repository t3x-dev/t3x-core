/**
 * T3X Runner Schemas
 *
 * Centralized schema definitions for the Runner service.
 */

// Agent schemas
export {
  AgentConfigSchema,
  AgentInputSchema,
  type AgentConfig,
  type AgentInput,
} from './agent.js';

// Trace schemas (legacy)
export {
  TraceEventSchema,
  RunTraceSchema,
  type TraceEvent,
  type RunTrace,
} from './trace.js';

// Run record schemas (new)
export {
  StepRecordSchema,
  RunRecordSchema,
  type StepRecord,
  type RunRecord,
} from './run-record.js';

// Eval rules schemas (new)
export {
  RuleOperatorSchema,
  RuleSchema,
  EvalRulesSchema,
  type RuleOperator,
  type Rule,
  type EvalRules,
} from './eval-rules.js';

// Eval result schemas (new)
export {
  CheckResultSchema,
  ViolationSchema,
  EvalResultSchema,
  type CheckResult,
  type Violation,
  type EvalResult,
} from './eval-result.js';

// Test step schemas (legacy)
export {
  TestStepSchema,
  TestResultSchema,
  type TestStep,
  type TestResult,
} from './test-step.js';

// Eval schemas (legacy)
export {
  EvalRequestSchema,
  EvalResponseSchema,
  type EvalRequest,
  type EvalResponse,
} from './eval.js';

// Engine integration schemas
export {
  EngineRunRequestSchema,
  N8nCallbackSchema,
  RunIngestSchema,
  type EngineRunRequest,
  type N8nCallback,
  type RunIngest,
  type PendingRun,
} from './engine.js';
