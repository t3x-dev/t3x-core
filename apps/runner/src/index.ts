// T3X Runner - Grey-box agent evaluation and CI/CD
//
// Components:
// - Observer: Captures agent I/O traces
// - EvalEngine: Runs test steps against traces
// - Server: HTTP API for runner operations
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

export { Observer, observer } from './observer.js';
export { EvalEngine, evalEngine } from './eval.js';
export { app } from './server.js';

export type {
  AgentInput,
  AgentConfig,
  TraceEvent,
  RunTrace,
  TestStep,
  TestResult,
  EvalRequest,
  EvalResponse,
} from './types.js';

export {
  AgentInputSchema,
  AgentConfigSchema,
  TraceEventSchema,
  RunTraceSchema,
  TestStepSchema,
  TestResultSchema,
  EvalRequestSchema,
  EvalResponseSchema,
} from './types.js';
