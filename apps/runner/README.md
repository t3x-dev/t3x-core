# T3X Runner

Grey-box agent evaluation, CI/CD, and workflow orchestration for T3X.

## Overview

T3X Runner provides:
- **Observer**: Captures agent I/O traces (LLM calls, tool invocations)
- **Eval Engine**: Runs test assertions against traces
- **Webhook API**: Integrates with CI/CD and workflow tools
- **n8n Integration**: Visual workflow orchestration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  On-Premise / Local                                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │    n8n       │───▶│  t3x-runner  │───▶│  t3x-core    │      │
│  │  (workflow)  │    │  (grey-box)  │    │  (semantic)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                    │              │
│                             └────────────────────┘              │
│                                      │                          │
│                                      ▼                          │
│                             ┌──────────────┐                   │
│                             │  t3x-webui   │                   │
│                             │  (canvas)    │                   │
│                             └──────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: npm (development)

```bash
# From monorepo root
npm install
npm run build:runner

# Start runner
npm run runner:dev
```

### Option 2: Docker (production)

```bash
# Minimal stack (runner + core)
npm run docker:up

# Full stack (runner + core + webui + n8n)
npm run docker:up:full
```

## API Endpoints

### Agent Management

```bash
# Register an agent
curl -X POST http://localhost:8080/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-agent",
    "name": "My Agent",
    "endpoint": "http://localhost:3000/agent",
    "type": "http"
  }'
```

### Run Agent

```bash
# Execute agent and capture trace
curl -X POST http://localhost:8080/run \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "input": { "query": "What is the weather?" }
  }'
```

### Evaluate

```bash
# Run test steps against a trace
curl -X POST http://localhost:8080/eval \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "run_abc123",
    "test_steps": [
      {
        "id": "1",
        "name": "contains weather",
        "type": "contains",
        "target": "output",
        "assertion": { "value": "weather" },
        "severity": "error"
      }
    ]
  }'
```

### Webhook (for n8n/CI)

```bash
# Run + auto-eval in one call
curl -X POST http://localhost:8080/webhook/run \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "input": { "query": "Hello" },
    "auto_eval": true,
    "test_steps": [
      {
        "id": "1",
        "name": "greeting response",
        "type": "contains",
        "target": "output",
        "assertion": { "value": "hello" },
        "severity": "error"
      }
    ]
  }'
```

## Test Step Types

| Type | Description | Example |
|------|-------------|---------|
| `contains` | Output contains string | `{ "value": "hello" }` |
| `not_contains` | Output does not contain | `{ "value": "error" }` |
| `regex` | Output matches pattern | `{ "pattern": "\\d{4}" }` |
| `json_path` | JSON path exists/matches | `{ "path": "data.id", "value": "123" }` |
| `semantic` | Semantic similarity | `{ "value": "greeting", "threshold": 0.8 }` |
| `custom` | Custom JS function | `{ "fn": "return value.length > 10" }` |

## Test Targets

- `input`: Agent input
- `output`: Agent output
- `llm_call`: All LLM call events
- `tool_call`: All tool call events
- `trace`: Full run trace

## n8n Integration

### Setup

1. Start with n8n profile:
   ```bash
   docker-compose --profile n8n up
   ```

2. Open n8n: http://localhost:5678

3. Create workflow with HTTP Request node pointing to `http://t3x-runner:8080/webhook/run`

### Example Workflow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Schedule│───▶│  HTTP   │───▶│   IF    │───▶│  Slack  │
│ (cron)  │    │ Request │    │ passed? │    │ notify  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                   │
                   │ POST /webhook/run
                   │ {
                   │   "agent_id": "my-agent",
                   │   "input": {...},
                   │   "auto_eval": true,
                   │   "test_steps": [...]
                   │ }
                   ▼
              ┌─────────┐
              │ Returns │
              │ {       │
              │   "passed": true/false,
              │   "suggestions": [...] │
              │ }       │
              └─────────┘
```

## SDK Usage

```typescript
import { observer, evalEngine } from '@t3x/runner';

// Register agent
observer.registerAgent({
  id: 'my-agent',
  name: 'My Agent',
  endpoint: 'http://localhost:3000/agent',
  type: 'http',
});

// Start run
const runId = observer.startRun('my-agent', {
  agent_id: 'my-agent',
  input: { query: 'hello' },
});

// Record events (called by your agent wrapper)
observer.recordLLMCall(runId, prompt, response, 'gpt-4', 500);
observer.recordToolCall(runId, 'search', input, output, 200);

// Complete run
const trace = observer.completeRun(runId, output, 'completed');

// Evaluate
const result = await evalEngine.evaluate({
  trace,
  test_steps: [
    {
      id: '1',
      name: 'check greeting',
      type: 'contains',
      target: 'output',
      assertion: { value: 'hello' },
      severity: 'error',
    },
  ],
});

console.log(result.passed); // true/false
console.log(result.suggestions); // auto-generated prompt improvements
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `T3X_CORE_URL` | `http://localhost:8000` | T3X Core API URL |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |

## Docker Compose Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| (default) | runner, core | Minimal eval setup |
| `full` | runner, core, webui, n8n, redis | Full stack |
| `n8n` | runner, core, n8n | Workflow automation |

## Roadmap

- [ ] Semantic assertions via t3x-core embeddings
- [ ] GitHub Actions integration
- [ ] Custom n8n node for t3x
- [ ] Batch evaluation
- [ ] Auto-suggestion → commit flow
- [ ] Metrics dashboard
