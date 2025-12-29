// T3X Runner - Grey-box agent evaluation engine
//
// Components:
// - Observer: Captures agent I/O traces
// - EvalEngine: Runs test steps against traces
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
//   // Record events
//   observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
//
//   // Complete run
//   const trace = observer.completeRun(runId, output, 'completed');
//
//   // Evaluate
//   const result = await evalEngine.evaluate({
//     trace,
//     test_steps: [
//       { id: '1', name: 'check greeting', type: 'contains', target: 'output', assertion: { value: 'hello' }, severity: 'error' },
//     ],
//   });

export { EvalEngine, evalEngine } from './eval.js';
export { Observer, observer } from './observer.js';
export {
  caseToTestSteps,
  type EvalCase,
  type EvalSuite,
  EvalSuiteSchema,
  getDefaultSuitesPath,
  loadSuite,
  loadSuites,
  type SuiteRunResult,
} from './suites.js';

export type {
  AgentConfig,
  AgentInput,
  EvalRequest,
  EvalResponse,
  RunTrace,
  TestResult,
  TestStep,
  TraceEvent,
} from './types.js';

export {
  AgentConfigSchema,
  AgentInputSchema,
  EvalRequestSchema,
  EvalResponseSchema,
  RunTraceSchema,
  TestResultSchema,
  TestStepSchema,
  TraceEventSchema,
} from './types.js';
