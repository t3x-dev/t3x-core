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

// Run record schemas
export {
  SpanKindSchema,
  LLMDataSchema,
  ToolDataSchema,
  RetrievalDataSchema,
  StepRecordSchema,
  RunRecordSchema,
  type SpanKind,
  type LLMData,
  type ToolData,
  type RetrievalData,
  type StepRecord,
  type RunRecord,
} from './run-record.js';

// Eval rules schemas
export {
  RuleOperatorSchema,
  RuleTypeSchema,
  RuleSchema,
  EvalRulesSchema,
  type RuleOperator,
  type RuleType,
  type Rule,
  type EvalRules,
} from './eval-rules.js';

// Eval result schemas
export {
  CheckResultSchema,
  ViolationSchema,
  EvalResultSchema,
  type CheckResult,
  type Violation,
  type EvalResult,
} from './eval-result.js';

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
