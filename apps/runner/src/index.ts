// T3X Runner - Grey-box agent evaluation engine
//
// Components:
// - Observer: Captures agent I/O as RunRecord
// - EvalEngine: Runs rule-based evaluation on RunRecord
//
// Usage:
//   import { observer, evalEngine } from '@t3x/runner';
//
//   // Register an agent
//   observer.registerAgent({
//     id: 'my-agent',
//     name: 'My Agent',
//     endpoint: 'http://localhost:3000/agent',
//     type: 'http',
//   });
//
//   // Start a run
//   const runId = observer.startRun('my-agent', { agent_id: 'my-agent', input: { query: 'hello' } });
//
//   // Record steps
//   observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
//   observer.recordToolCall(runId, 'search', { query: 'test' }, { results: [] }, 100);
//
//   // Complete run
//   const record = observer.completeRun(runId, output, 'completed');
//
//   // Evaluate with rules
//   const result = evalEngine.evaluate(record, rules);

// Observer (SDK proxy mode)
export { Observer, observer } from './observer.js';

// Evaluator (rule-based)
export { EvalEngine, evalEngine } from './evaluator/index.js';
export { parseRulesFromLeaf, loadRulesFromFile, DEFAULT_RULES } from './evaluator/index.js';

// Trace collection (n8n integration)
export { n8nClient, mapN8nExecutionToRunRecord, buildTraceSummary } from './trace/index.js';

// LLM Asserter
export { llmAsserter, type GenerateAssertionsResult, type AssertionStatus } from './asserter.js';

// Schemas - Types
export type {
  // Agent
  AgentConfig,
  AgentInput,
  // Run Record
  SpanKind,
  LLMData,
  ToolData,
  RetrievalData,
  StepRecord,
  RunRecord,
  // Eval Rules
  RuleOperator,
  RuleType,
  Rule,
  EvalRules,
  // Eval Result
  CheckResult,
  Violation,
  EvalResult,
  // Engine
  EngineRunRequest,
  N8nCallback,
  RunIngest,
  PendingRun,
} from './schemas/index.js';

// Schemas - Zod validators
export {
  // Agent
  AgentConfigSchema,
  AgentInputSchema,
  // Run Record
  SpanKindSchema,
  LLMDataSchema,
  ToolDataSchema,
  RetrievalDataSchema,
  StepRecordSchema,
  RunRecordSchema,
  // Eval Rules
  RuleOperatorSchema,
  RuleTypeSchema,
  RuleSchema,
  EvalRulesSchema,
  // Eval Result
  CheckResultSchema,
  ViolationSchema,
  EvalResultSchema,
  // Engine
  EngineRunRequestSchema,
  N8nCallbackSchema,
  RunIngestSchema,
} from './schemas/index.js';
