# n8n Weather Agent Workflow Configuration Guide

This document explains how to create a Weather Agent workflow in n8n for Phase 6 end-to-end validation.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Workflow Overview](#workflow-overview)
3. [Node Configuration Details](#node-configuration-details)
4. [Complete Workflow JSON](#complete-workflow-json)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

1. n8n is running and accessible (default http://localhost:5678)
2. AI model API Key configured (Claude or OpenAI)
3. Runner service is running (default http://localhost:8080 or http://t3x-runner:8080 in Docker)

---

## Workflow Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Webhook   │───►│  Set Vars   │───►│    AI Agent     │───►│ HTTP Request    │
│   (Entry)   │    │ (Prep Data) │    │  (Execute)      │    │ (Callback)      │
└─────────────┘    └─────────────┘    └────────┬────────┘    └─────────────────┘
                                               │
                                      ┌────────┴────────┐
                                      │   Tool: Code    │
                                      │  (WeatherTool)  │
                                      └─────────────────┘
```

---

## Node Configuration Details

### Node 1: Webhook (Entry Node)

**Purpose**: Receive requests from Runner, get prompt and user input.

**Configuration Steps**:

1. Add **Webhook** node
2. Configure as follows:

| Setting | Value | Description |
|---------|-------|-------------|
| **HTTP Method** | `POST` | Receive POST requests |
| **Path** | `weather-agent` | Webhook path, corresponds to `webhook_id` |
| **Respond** | `Respond to Webhook` | Respond after workflow completes |
| **Response Code** | `200` | Success response code |

**Expected Input Data Structure**:
```json
{
  "run_id": "run_abc123",
  "runner_run_id": "runner_run_xyz",
  "leaf": {
    "id": "leaf_weather_v1",
    "type": "eval",
    "content": "You are a weather assistant...",
    "rules_ref": "weather-agent-eval"
  },
  "inputs": {
    "query": "What's the weather in Beijing today?"
  },
  "callback_url": "http://t3x-runner:8080/callbacks/n8n"
}
```

---

### Node 2: Set (Prepare Variables)

**Purpose**: Extract and format variables for subsequent nodes.

**Configuration Steps**:

1. Add **Set** node
2. Connect Webhook → Set
3. Add the following fields:

| Field Name | Value (Expression) | Description |
|------------|-------------------|-------------|
| `run_id` | `{{ $json.run_id }}` | Run ID |
| `runner_run_id` | `{{ $json.runner_run_id }}` | Runner Run ID |
| `system_prompt` | `{{ $json.leaf.content }}` | AI Agent system prompt |
| `user_query` | `{{ $json.inputs.query }}` | User query content |
| `callback_url` | `{{ $json.callback_url }}` | Callback URL |
| `start_time` | `{{ Date.now() }}` | Start time (for latency calculation) |

---

### Node 3: AI Agent (Core Node)

**Purpose**: Use AI model to process user requests and call tools to get weather info.

**Configuration Steps**:

1. Add **AI Agent** node
2. Connect Set → AI Agent
3. Configure as follows:

#### Basic Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| **Agent Type** | `Tools Agent` | Agent that uses tools |
| **Chat Model** | Select your model (see below) | Claude or GPT |

#### Chat Model Configuration (Claude)

If using Claude:

| Setting | Value |
|---------|-------|
| **Model** | `claude-sonnet-4-20250514` or other |
| **API Key** | Your Anthropic API Key |

#### Chat Model Configuration (OpenAI)

If using OpenAI:

| Setting | Value |
|---------|-------|
| **Model** | `gpt-4` or `gpt-4o` |
| **API Key** | Your OpenAI API Key |

#### Prompt Configuration

| Setting | Value (Expression) |
|---------|-------------------|
| **System Message** | `{{ $('Set').item.json.system_prompt }}` |
| **User Message** | `{{ $('Set').item.json.user_query }}` |

---

### Node 4: Tool - WeatherTool (Tool Node)

**Purpose**: Simulate weather query tool, return weather data.

**Configuration Steps**:

1. Add Tool in AI Agent node
2. Select **Code** type (for simulation)
3. Configure as follows:

| Setting | Value |
|---------|-------|
| **Name** | `WeatherTool` |
| **Description** | `Query weather information for a specified city. Input city name, return current weather.` |

#### Tool Input Schema

```json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string",
      "description": "City name to query weather for"
    }
  },
  "required": ["city"]
}
```

#### Tool Code (JavaScript)

```javascript
// Simulated weather data
const weatherData = {
  "Beijing": { temp: 5, condition: "Sunny", humidity: 30, wind: "North 3" },
  "Shanghai": { temp: 12, condition: "Cloudy", humidity: 65, wind: "East 2" },
  "Guangzhou": { temp: 18, condition: "Overcast", humidity: 75, wind: "South 2" },
  "Shenzhen": { temp: 20, condition: "Sunny", humidity: 60, wind: "Southeast 2" },
};

const city = $input.item.json.city || "Beijing";
const weather = weatherData[city] || {
  temp: 15,
  condition: "Unknown",
  humidity: 50,
  wind: "Light"
};

return {
  city: city,
  temperature: weather.temp,
  condition: weather.condition,
  humidity: weather.humidity,
  wind: weather.wind,
  updated_at: new Date().toISOString()
};
```

---

### Node 5: HTTP Request (Callback Node)

**Purpose**: Send execution result back to Runner.

**Configuration Steps**:

1. Add **HTTP Request** node
2. Connect AI Agent → HTTP Request
3. Configure as follows:

| Setting | Value |
|---------|-------|
| **Method** | `POST` |
| **URL** | `http://t3x-runner:8080/callbacks/n8n` (Docker) or `http://localhost:8080/callbacks/n8n` (local) |
| **Authentication** | `None` |
| **Send Body** | `true` |
| **Body Content Type** | `JSON` |

#### Body (JSON Expression)

Click "Add Body Parameter" and select "JSON", then use the following expression:

```json
{
  "runner_run_id": "{{ $('Set').item.json.runner_run_id }}",
  "run_id": "{{ $('Set').item.json.run_id }}",
  "execution_id": "{{ $execution.id }}",
  "output": {
    "response": "{{ $json.output }}"
  },
  "meta": {
    "latency_ms": {{ Date.now() - $('Set').item.json.start_time }}
  }
}
```

**Important**: `execution_id` uses `{{ $execution.id }}` to get the current n8n execution ID, which Runner needs to fetch the complete execution trace.

---

### Node 6: Respond to Webhook (Response Node)

**Purpose**: Return response to the webhook trigger request.

**Configuration Steps**:

1. Add **Respond to Webhook** node
2. Connect HTTP Request → Respond to Webhook
3. Configure as follows:

| Setting | Value |
|---------|-------|
| **Respond With** | `JSON` |
| **Response Body** | `{{ { "success": true, "message": "Callback sent" } }}` |

---

## Complete Workflow JSON

You can directly import the following JSON into n8n (Menu → Import from File/URL):

```json
{
  "name": "Weather Agent - T3X E2E Test",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "weather-agent",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "run_id",
              "value": "={{ $json.run_id }}",
              "type": "string"
            },
            {
              "id": "2",
              "name": "runner_run_id",
              "value": "={{ $json.runner_run_id }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "system_prompt",
              "value": "={{ $json.leaf.content }}",
              "type": "string"
            },
            {
              "id": "4",
              "name": "user_query",
              "value": "={{ $json.inputs.query }}",
              "type": "string"
            },
            {
              "id": "5",
              "name": "callback_url",
              "value": "={{ $json.callback_url }}",
              "type": "string"
            },
            {
              "id": "6",
              "name": "start_time",
              "value": "={{ Date.now() }}",
              "type": "number"
            }
          ]
        },
        "options": {}
      },
      "id": "set-node",
      "name": "Set",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [450, 300]
    },
    {
      "parameters": {
        "options": {
          "systemMessage": "={{ $('Set').item.json.system_prompt }}"
        },
        "text": "={{ $('Set').item.json.user_query }}"
      },
      "id": "ai-agent-node",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [650, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://t3x-runner:8080/callbacks/n8n",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"runner_run_id\": \"{{ $('Set').item.json.runner_run_id }}\",\n  \"run_id\": \"{{ $('Set').item.json.run_id }}\",\n  \"execution_id\": \"{{ $execution.id }}\",\n  \"output\": {\n    \"response\": \"{{ $json.output }}\"\n  },\n  \"meta\": {\n    \"latency_ms\": {{ Date.now() - $('Set').item.json.start_time }}\n  }\n}",
        "options": {}
      },
      "id": "callback-node",
      "name": "Callback Runner",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [850, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { \"success\": true, \"message\": \"Callback sent\" } }}",
        "options": {}
      },
      "id": "respond-node",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1050, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [{ "node": "Set", "type": "main", "index": 0 }]
      ]
    },
    "Set": {
      "main": [
        [{ "node": "AI Agent", "type": "main", "index": 0 }]
      ]
    },
    "AI Agent": {
      "main": [
        [{ "node": "Callback Runner", "type": "main", "index": 0 }]
      ]
    },
    "Callback Runner": {
      "main": [
        [{ "node": "Respond", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

**Note**: The JSON above does not include AI Agent model configuration and Tool configuration. After importing, you need to manually add:
1. Configure Chat Model for AI Agent node (add Claude or OpenAI node)
2. Add WeatherTool (refer to Tool configuration above)

---

## Testing

### Method 1: Manual Test in n8n

1. Save and activate the workflow
2. Click "Test Workflow"
3. Use the following test data:

```json
{
  "run_id": "test_run_001",
  "runner_run_id": "test_runner_001",
  "leaf": {
    "id": "leaf_weather_v1",
    "type": "eval",
    "content": "You are a weather assistant. Answer weather questions concisely.",
    "rules_ref": "weather-agent-eval"
  },
  "inputs": {
    "query": "What's the weather in Beijing today?"
  },
  "callback_url": "http://t3x-runner:8080/callbacks/n8n"
}
```

### Method 2: Test with curl

```bash
curl -X POST http://localhost:5678/webhook/weather-agent \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "test_run_001",
    "runner_run_id": "test_runner_001",
    "leaf": {
      "id": "leaf_weather_v1",
      "type": "eval",
      "content": "You are a weather assistant. Answer weather questions concisely.",
      "rules_ref": "weather-agent-eval"
    },
    "inputs": {
      "query": "What is the weather in Beijing today?"
    },
    "callback_url": "http://t3x-runner:8080/callbacks/n8n"
  }'
```

---

## Troubleshooting

### Q1: Callback Failed, Connection Refused

**Cause**: Runner service not running or network unreachable.

**Solution**:
- Confirm Runner is running: `docker compose ps`
- Check URL is correct: Use `http://t3x-runner:8080` in Docker, `http://localhost:8080` locally

### Q2: AI Agent Returns Empty Result

**Cause**: Model API Key not configured or quota exhausted.

**Solution**:
- Check API Key in n8n Credentials
- Check n8n execution logs

### Q3: WeatherTool Not Called

**Cause**: System Prompt doesn't mention using tools, or Tool Description is unclear.

**Solution**:
- Ensure System Prompt mentions WeatherTool can be used
- Improve Tool Description to clarify tool purpose

### Q4: execution_id is Empty

**Cause**: Expression syntax error.

**Solution**:
- Ensure using `{{ $execution.id }}` (note: `$execution` not `$json.execution`)

---

## Next Steps

After configuration is complete, run the test script:

```bash
cd apps/runner
./scripts/test-e2e.sh
```

View evaluation results and dimension scores!
