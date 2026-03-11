# @t3x-dev/runner Architecture

> Version: v0.2.0
> Last Updated: 2025-01

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Three-Phase Execution Model](#three-phase-execution-model)
3. [Directory Structure](#directory-structure)
4. [Core Modules](#core-modules)
5. [Data Formats](#data-formats)
6. [API Endpoints](#api-endpoints)
7. [Rule System](#rule-system)
8. [Execution Flow](#execution-flow)

---

## Design Philosophy

### Core Principles

```
Deterministic Layer ≠ LLM Layer (Optional)
```

**Runner follows T3X's core philosophy: the deterministic layer never depends on LLM.**

| Layer | Description | Requires LLM? |
|-------|-------------|---------------|
| **Collection** | Collect execution data from n8n or SDK | No |
| **Evaluation** | Rule-based deterministic evaluation | No |
| **Assertion** | LLM generates human-readable explanations | Yes (Optional) |

### Stateless Architecture

Runner itself **does not store any persistent state**. All data flows:

```
Engine (PostgreSQL) ←→ Runner (Compute) ←→ n8n (Execution)
```

- **Engine**: T3X API server, responsible for persistent storage
- **Runner**: Pure compute layer, handles evaluation logic
- **n8n**: Workflow execution engine, runs AI Agents

### Unified Data Format

v0.2.0 introduced unified data formats:

| Old Format | New Format | Description |
|------------|------------|-------------|
| `RunTrace` | `RunRecord` | Execution record (contains steps) |
| `TestStep` | `Rule` | Evaluation rule |
| `TestSteps[]` | `EvalRules` | Rule configuration file |

---

## Three-Phase Execution Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      T3X Runner Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────┐    ┌────────────┐    ┌────────────┐              │
│  │ Collection│───▶│ Evaluation │───▶│ Assertion  │              │
│  │           │    │            │    │            │              │
│  └───────────┘    └────────────┘    └────────────┘              │
│        │               │                  │                     │
│        ▼               ▼                  ▼                     │
│   RunRecord      EvalResult         AssertionOutput             │
│   (exec data)   (deterministic)    (optional, needs API Key)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: Collection

**Goal**: Collect Agent execution data from workflow systems.

**Two Modes**:

1. **n8n Mode** (Recommended)
   - n8n calls back Runner after workflow execution
   - Runner fetches execution details from n8n API
   - Converts to standard `RunRecord` format

2. **SDK Proxy Mode** (Observer)
   - Agent directly calls Runner SDK
   - Runner intercepts and records LLM/Tool calls
   - Suitable for non-n8n scenarios

### Phase 2: Evaluation

**Goal**: Execute deterministic rule checks on `RunRecord`.

**Characteristics**:
- **100% Deterministic**: Same inputs always produce same outputs
- **No LLM Dependency**: Pure rule engine
- **Multi-dimensional Scoring**: Task completion, tool use, trajectory efficiency, cost, latency

**Output**: `EvalResult`, containing:
- `passed`: Whether passed (based on pass_threshold)
- `score`: Weighted score (0-1)
- `checks`: Check results for each rule
- `violations`: List of violations
- `dimension_scores`: Scores by dimension

### Phase 3: Assertion

**Goal**: Generate human-readable explanations and suggestions based on evaluation results.

**Characteristics**:
- **Optional Phase**: Requires `ANTHROPIC_API_KEY`
- **Does Not Affect Judgment**: pass/fail is determined by Phase 2
- **Value-Added Service**: Provides improvement suggestions

---

## Directory Structure

```
apps/runner/
├── src/                           # Source code
│   ├── index.ts                   # Entry file, exports all public APIs
│   │
│   ├── observer.ts                # Observer class - SDK proxy mode
│   │                              # For directly capturing Agent I/O (without n8n)
│   │
│   ├── evaluator/                 # Deterministic evaluation engine
│   │   ├── index.ts               # EvalEngine main class
│   │   ├── operators.ts           # Rule operator implementations (exists, contains, range, etc.)
│   │   └── rule-parser.ts         # Rule file parsing (YAML/JSON)
│   │
│   ├── trace/                     # n8n execution data collection
│   │   ├── index.ts               # Module exports
│   │   ├── n8n-client.ts          # n8n REST API client
│   │   ├── n8n-mapper.ts          # n8n execution data → RunRecord conversion
│   │   ├── trace-summary.ts       # Trace summary builder
│   │   ├── storage-policy.ts      # Storage policy (decides whether to store full trace)
│   │   └── types.ts               # n8n data type definitions
│   │
│   ├── schemas/                   # Zod data validation (type-safe)
│   │   ├── index.ts               # Module exports
│   │   ├── agent.ts               # Agent config schema
│   │   ├── run-record.ts          # RunRecord schema (core data format)
│   │   ├── eval-rules.ts          # EvalRules schema (rule configuration)
│   │   ├── eval-result.ts         # EvalResult schema (evaluation results)
│   │   └── engine.ts              # Engine API request/response schema
│   │
│   ├── asserter.ts                # LLM assertion generator
│   │                              # Calls Claude API to generate human-readable assertions
│   │
│   ├── n8n.ts                     # n8n Webhook trigger
│   │                              # For triggering n8n workflows
│   │
│   ├── engine-client.ts           # Engine API client
│   │                              # Communicates with t3x-api (get run, submit results)
│   │
│   ├── types.ts                   # Public type definitions
│   │
│   └── utils/
│       └── retry.ts               # HTTP retry utility (fetch with retry)
│
├── resources/                     # Resource files
│   ├── rules/                     # Evaluation rules (YAML format)
│   │   ├── default.yml            # Default rules
│   │   ├── example.yaml           # Example rules (for learning)
│   │   └── weather-agent-eval.yaml # Weather Agent specific rules
│   │
│   ├── n8n-workflow.json          # n8n workflow template
│   │
│   └── json-schemas/              # JSON Schema (for IDE validation)
│       └── eval-rules.schema.json
│
├── scripts/
│   ├── test-e2e.sh                # E2E test script
│   └── schema_check.mjs           # Schema validation script
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # This document
│   ├── README.md                  # Usage tutorial
│   └── n8n-workflow-setup.md      # n8n workflow configuration guide
│
├── Dockerfile                     # Docker build file
├── package.json                   # Package configuration
└── tsconfig.json                  # TypeScript configuration
```

---

## Core Modules

### 1. Observer (observer.ts)

**Responsibility**: Capture Agent I/O in SDK proxy mode.

```typescript
import { observer } from '@t3x-dev/runner';

// Register Agent
observer.registerAgent({
  id: 'my-agent',
  name: 'My Agent',
  endpoint: 'http://localhost:3000/agent',
  type: 'http',
});

// Start a run
const runId = observer.startRun('my-agent', { agent_id: 'my-agent', input: { query: 'hello' } });

// Record LLM call
observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);

// Record tool call
observer.recordToolCall(runId, 'search', { query: 'test' }, { results: [] }, 100);

// Complete run
const record = observer.completeRun(runId, output, 'completed');
```

**Key Classes**:
- `Observer`: Singleton class, manages run state
- `observer`: Exported singleton instance

### 2. EvalEngine (evaluator/index.ts)

**Responsibility**: Execute deterministic rule evaluation.

```typescript
import { evalEngine, DEFAULT_RULES } from '@t3x-dev/runner';

// Evaluate RunRecord
const result = evalEngine.evaluate(runRecord, rules);
// result: { passed: true, score: 0.85, checks: [...], violations: [...] }

// Evaluate using Leaf object (auto-loads rules file specified by rules_ref)
const result = evalEngine.evaluateWithLeaf(runRecord, { rules_ref: 'weather-agent-eval' });
```

**Core Logic**:
1. Iterate through each Rule
2. Extract value at target path from RunRecord
3. Execute check operator
4. Calculate weighted score
5. Aggregate scores by dimension

### 3. Operators (evaluator/operators.ts)

**Responsibility**: Implement all rule operators.

**Basic Operators (v1.0)**:

| Operator | Description | Example |
|----------|-------------|---------|
| `exists` | Field exists | `target: "output", check: "exists"` |
| `not_empty` | Field is not empty | `target: "steps", check: "not_empty"` |
| `equals` | Value equals | `value: "completed"` |
| `not_equals` | Value not equals | `value: "error"` |
| `contains` | Contains substring | `value: "success"` |
| `not_contains` | Does not contain | `value: "error"` |
| `regex` | Regex match | `pattern: "^[0-9]+$"` |
| `range` | Numeric range | `min: 0, max: 100` |
| `some` | Some array items match | `condition: { status: "ok" }` |
| `all` | All array items match | `condition: { status: "ok" }` |
| `none` | No array items match | `condition: { status: "error" }` |

**Agent-Specific Operators (v2.0)**:

| Operator | Description | Purpose |
|----------|-------------|---------|
| `expected_tools` | Check if expected tools were called | Tool use correctness |
| `no_unknown_tools` | Check if unknown tools were called | Prevent tool abuse |
| `step_count` | Check step count range | Trajectory efficiency |
| `no_repeated_steps` | Check for repeated tool calls | Avoid redundancy |
| `total_tokens` | Check total token usage | Cost control |
| `total_latency_ms` | Check total latency | Performance requirements |

### 4. n8n Mapper (trace/n8n-mapper.ts)

**Responsibility**: Convert n8n execution data to standard `RunRecord` format.

**Conversion Rules**:

1. **Node Type Mapping**:
   ```
   n8n-nodes-base.webhook → webhook
   @n8n/n8n-nodes-langchain.agent → ai_agent
   @n8n/n8n-nodes-langchain.lmchatopenai → llm_call
   ```

2. **SpanKind Inference**:
   ```
   llm_call, ai_agent → 'llm'
   tool_call → 'tool'
   *retriev*, *vector* → 'retriever'
   webhook → 'workflow'
   other → 'chain'
   ```

3. **LLM Data Extraction**:
   - Token usage: extracted from `nodeRun.data.ai_languageModel[0][0].json.tokenUsage`
   - Model info: extracted from `nodeRun.inputOverride.ai_languageModel[0][0].json.options.model`

### 5. LLM Asserter (asserter.ts)

**Responsibility**: Call Claude API to generate human-readable assertions.

**Notes**:
- Requires `ANTHROPIC_API_KEY` environment variable
- **Does NOT participate in pass/fail judgment**, only provides explanatory output
- Auto-skips when all evaluations pass (`status: 'skipped'`)

```typescript
import { llmAsserter } from '@t3x-dev/runner';

// Check availability
if (llmAsserter.isAvailable()) {
  const result = await llmAsserter.generateAssertions({
    evalResult,
    runRecord,
  });
  // result.status: 'success' | 'skipped' | 'unavailable' | 'error'
}
```

---

## Data Formats

### RunRecord (Execution Record)

```typescript
interface RunRecord {
  run_id: string;                          // Run ID
  status: 'pending' | 'running' | 'completed' | 'failed';

  inputs: Record<string, unknown>;         // Input parameters
  output?: unknown;                        // Final output

  steps: StepRecord[];                     // List of execution steps

  timing: {
    started_at: string;                    // ISO8601 start time
    ended_at?: string;                     // ISO8601 end time
    total_ms?: number;                     // Total duration (milliseconds)
  };

  error?: {
    code: string;
    message: string;
    step_id?: string;                      // Step that caused error
  };

  source?: {
    system: 'n8n' | 'langchain' | 'custom';
    execution_id?: string;                 // n8n execution ID
  };
}
```

### StepRecord (Step Record)

```typescript
interface StepRecord {
  step_id: string;
  step_index: number;                      // Execution order (0-based)

  name: string;                            // Node name, e.g., "AI Agent"
  type: string;                            // Node type, e.g., "ai_agent"

  span_kind: 'chain' | 'llm' | 'tool' | 'retriever' | 'workflow';
  parent_step_id?: string;                 // Parent step (for nesting)

  input: unknown;
  output: unknown;
  latency_ms: number;

  status: 'ok' | 'error';
  error?: string;

  // Conditionally populated based on span_kind
  llm?: LLMData;                           // When span_kind='llm'
  tool?: ToolData;                         // When span_kind='tool'
  retrieval?: RetrievalData;               // When span_kind='retriever'
}

interface LLMData {
  model: string;
  provider?: string;                       // 'openai' | 'anthropic' | ...
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

interface ToolData {
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
}
```

### EvalRules (Evaluation Rule Configuration)

```yaml
version: "1.0"
name: "weather-agent-eval"
description: "Weather Agent evaluation rules"

rules:
  - id: "output_exists"
    name: "Output exists"
    type: "basic"                          # basic | tool_use | trajectory | cost | performance
    target: "output"
    check: "exists"
    weight: 0.2
    severity: "error"                      # error | warning

  - id: "used_weather_tool"
    name: "Used weather tool"
    type: "tool_use"
    target: "steps"
    check: "expected_tools"
    expected: ["WeatherTool"]
    weight: 0.3
    severity: "error"

  - id: "token_limit"
    name: "Token usage within limit"
    type: "cost"
    target: "steps"
    check: "total_tokens"
    max: 1000
    weight: 0.2
    severity: "warning"

pass_threshold: 0.7
```

### EvalResult (Evaluation Result)

```typescript
interface EvalResult {
  run_id: string;
  rules_version: string;
  evaluated_at: string;                    // ISO8601

  passed: boolean;                         // score >= pass_threshold
  score: number;                           // 0-1, weighted score

  checks: CheckResult[];                   // Check results for each rule
  violations: Violation[];                 // List of violations

  dimension_scores: {                      // Scores by dimension
    task_completion: number;
    tool_use: number;
    trajectory_efficiency: number;
    cost_efficiency: number;
    latency: number;
  };
}

interface CheckResult {
  rule_id: string;
  passed: boolean;
  score: number;                           // passed ? weight : 0
  actual: unknown;                         // Actual value
  expected: unknown;                       // Expected value
  message: string;
}

interface Violation {
  rule_id: string;
  severity: 'error' | 'warning';
  message: string;
  step_id?: string;                        // Related step
}
```

---

## API Endpoints

Runner exposes APIs through `apps/api/src/routes/runner.ts` (integrated in t3x-api).

### Agent Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runner/agents` | Register Agent |
| GET | `/runner/agents/:id` | Get Agent config |

### Run Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runner/run` | Execute Agent (proxy mode) |
| POST | `/runner/run/:id/event` | Add execution event (SDK integration) |
| GET | `/runner/run/:id` | Get run record |
| GET | `/runner/runs` | List all runs |

### Evaluation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runner/eval` | Execute evaluation |
| POST | `/runner/eval/validate` | Validate rule format |

### Webhook (External Integration)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runner/webhook/run` | Webhook trigger run + evaluation |

---

## Rule System

### Rule File Location

Rule files are stored in `resources/rules/` directory, supporting YAML and JSON formats.

### Rule Loading Priority

```
1. leaf.rules_ref → resources/rules/{rules_ref}.yaml
2. Default rules → resources/rules/default.yml
3. Built-in default → DEFAULT_RULES (code built-in)
```

### Rule Types and Dimension Scores

| Rule Type | Dimension | Description |
|-----------|-----------|-------------|
| `basic` | task_completion | Basic output checks |
| `tool_use` | tool_use | Tool usage correctness |
| `trajectory` | trajectory_efficiency | Execution path efficiency |
| `cost` | cost_efficiency | Token/cost control |
| `performance` | latency | Latency/performance |

### Score Calculation

```
score = Σ(check_i.passed ? rule_i.weight : 0) / Σ(rule_i.weight)
passed = score >= pass_threshold
```

---

## Execution Flow

### Main Flow (n8n Mode)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Complete Execution Flow                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────┐   POST /runs   ┌──────────┐   Webhook   ┌──────┐              │
│  │ WebUI   │───────────────▶│  Engine  │────────────▶│ n8n  │              │
│  │(Frontend)│               │  (API)   │    runner    │      │              │
│  └─────────┘                └──────────┘             └──────┘              │
│       │                          │                       │                 │
│       │                          │                       │                 │
│       │                          │                       ▼                 │
│       │                          │              ┌──────────────┐           │
│       │                          │              │ AI Agent Exec │           │
│       │                          │              │ (LLM + Tools) │           │
│       │                          │              └──────────────┘           │
│       │                          │                       │                 │
│       │                          │                       │ Callback        │
│       │                          │                       ▼                 │
│       │                          │     ┌────────────────────────────┐      │
│       │                          │     │     n8n-mapper.ts          │      │
│       │                          │◀────│  n8n Execution → RunRecord │      │
│       │                          │     └────────────────────────────┘      │
│       │                          │                       │                 │
│       │                          │                       ▼                 │
│       │                          │     ┌────────────────────────────┐      │
│       │                          │     │     evaluator/index.ts     │      │
│       │                          │◀────│  RunRecord × Rules → Result│      │
│       │                          │     └────────────────────────────┘      │
│       │                          │                       │                 │
│       │                          │                       ▼                 │
│       │                          │     ┌────────────────────────────┐      │
│       │                          │     │     asserter.ts (optional)  │      │
│       │                          │◀────│  EvalResult → Assertions   │      │
│       │                          │     └────────────────────────────┘      │
│       │                          │                                         │
│       │        GET /runs/:id     │                                         │
│       │◀─────────────────────────│                                         │
│       │     (complete result)    │                                         │
│       ▼                          ▼                                         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Details

1. **WebUI → Engine**: `POST /api/v1/runs`
   - Create Run record (status: 'pending')
   - Return `run_id` and `runner_run_id`

2. **Engine → n8n**: Webhook trigger
   - Send `leaf.content` (prompt), `inputs`
   - n8n executes AI Agent workflow

3. **n8n → Engine**: Callback
   - Send `n8n_execution_id`
   - Engine calls Runner for data collection and evaluation

4. **Runner Processing**:
   - `n8n-mapper.ts`: Fetch n8n execution details, convert to `RunRecord`
   - `evaluator`: Load rules, execute deterministic evaluation
   - `asserter`: (optional) Generate LLM assertions
   - `trace-summary.ts`: Build trace summary

5. **Engine Storage**:
   - Update Run status to 'completed'
   - Store `resultJson`, `traceSummaryJson`

6. **WebUI Display**:
   - Poll `GET /api/v1/runs/:id`
   - Display evaluation results and dimension scores

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `T3X_ENGINE_URL` | `http://localhost:8000` | Engine API address |
| `T3X_API_URL` | (same as above) | Compatibility alias |
| `N8N_WEBHOOK_URL` | `http://n8n:5678/webhook` | n8n Webhook base URL |
| `ENGINE_CALLBACK_URL` | `{T3X_ENGINE_URL}/api/v1/runs/ingest` | Engine callback URL |
| `ANTHROPIC_API_KEY` | (none) | Claude API Key (for assertion generation) |

---

## Design Decisions

### Why Evaluation Doesn't Use LLM?

1. **Reproducibility**: Same inputs always produce same outputs
2. **Cost Control**: No LLM API consumption per evaluation
3. **Speed**: Millisecond-level evaluation vs second-level LLM calls
4. **Transparency**: Rules are auditable and version-controllable

### Why Assertions Use LLM?

1. **Human Readable**: Rule results are booleans, humans need explanations
2. **Improvement Suggestions**: LLM can provide context-specific advice
3. **Optional Feature**: Evaluation works fine without API Key

### Why Use YAML for Rules?

1. **Readability**: More readable and writable than JSON
2. **Comment Support**: Can add comments in rules
3. **IDE Support**: JSON Schema provides validation

---

## References

- [T3X Project CLAUDE.md](/CLAUDE.md)
- [n8n Workflow Configuration Guide](./n8n-workflow-setup.md)
- [Arize Phoenix Span Design](https://docs.arize.com/phoenix/concepts/llm-traces)
