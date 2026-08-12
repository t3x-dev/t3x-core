// T3X Runner - Grey-box agent evaluation engine
//
// Components:
// - Observer: Captures agent I/O as RunRecord
// - EvalEngine: Runs rule-based evaluation on RunRecord
//
// Usage:
//   import { observer, evalEngine } from '@t3x-dev/runner';
//
//   // Register an agent
//   observer.registerAgent('project-id', {
//     id: 'my-agent',
//     name: 'My Agent',
//     endpoint: 'http://localhost:3000/agent',
//     type: 'http',
//   });
//
//   // Start a run
//   const runId = observer.startRun('project-id', 'my-agent', {
//     agent_id: 'my-agent', input: { query: 'hello' }
//   });
//
//   // Record steps
//   observer.recordLLMCall('project-id', runId, prompt, response, 'gpt-4', 500);
//   observer.recordToolCall('project-id', runId, 'search', { query: 'test' }, { results: [] }, 100);
//
//   // Complete run
//   const record = observer.completeRun('project-id', runId, output, 'completed');
//
//   // Evaluate with rules
//   const result = evalEngine.evaluate(record, rules);

// LLM Asserter
export { type AssertionStatus, type GenerateAssertionsResult, llmAsserter } from './asserter.js';
// Outbound endpoint policy
export {
  assertSafeAgentEndpoint,
  fetchAgentEndpoint,
  isBlockedAgentAddress,
  RUNNER_ENDPOINT_ALLOWLIST_ENV,
  UnsafeAgentEndpointError,
} from './endpoint-security.js';
// Evaluator (rule-based)
export {
  DEFAULT_RULES,
  EvalEngine,
  evalEngine,
  loadRulesFromFile,
  parseRulesFromLeaf,
} from './evaluator/index.js';
export { DEFAULT_RUNNER_HOST, resolveRunnerHost, resolveRunnerPort } from './network.js';
// Observer (SDK proxy mode)
export { Observer, observer } from './observer.js';
// Schemas - Types
export type {
  // Agent
  AgentConfig,
  AgentInput,
  // Eval Result
  CheckResult,
  // Engine
  EngineRunRequest,
  EvalResult,
  EvalRules,
  LLMData,
  N8nCallback,
  PendingRun,
  ProjectScopedAgentConfig,
  ProjectScopedAgentInput,
  RetrievalData,
  Rule,
  // Eval Rules
  RuleOperator,
  RuleType,
  RunIngest,
  RunRecord,
  // Run Record
  SpanKind,
  StepRecord,
  ToolData,
  Violation,
} from './schemas/index.js';
// Schemas - Zod validators
export {
  // Agent
  AgentConfigSchema,
  AgentInputSchema,
  // Eval Result
  CheckResultSchema,
  // Engine
  EngineRunRequestSchema,
  EvalResultSchema,
  EvalRulesSchema,
  LLMDataSchema,
  N8nCallbackSchema,
  ProjectScopedAgentConfigSchema,
  ProjectScopedAgentInputSchema,
  RetrievalDataSchema,
  // Eval Rules
  RuleOperatorSchema,
  RuleSchema,
  RuleTypeSchema,
  RunIngestSchema,
  RunRecordSchema,
  // Run Record
  SpanKindSchema,
  StepRecordSchema,
  ToolDataSchema,
  ViolationSchema,
} from './schemas/index.js';
// Trace collection (n8n integration)
export { buildTraceSummary, mapN8nExecutionToRunRecord, n8nClient } from './trace/index.js';
