# n8n Workflow Recipes

Pre-built n8n workflow templates for common T3X automation patterns. Each recipe is a valid n8n workflow JSON that can be imported directly.

## What Are Recipes?

Recipes are importable n8n workflow templates stored as JSON files in `apps/runner/recipes/`. They provide ready-made automation pipelines that connect T3X webhooks to external actions like evaluation runs, notifications, and auto-generation.

Each recipe is designed to be triggered by a T3X webhook event and performs a specific automation task.

## How to Import

1. Open your n8n instance (default: http://localhost:5678)
2. Click **Menu** (top-left hamburger icon)
3. Select **Import from File** (or **Import from URL** if hosting the JSON)
4. Choose the `.json` file from `apps/runner/recipes/`
5. Review the imported workflow and configure variables (see below)
6. **Activate** the workflow (toggle in top-right)

## Variable Configuration

Recipes use configurable URLs passed in the webhook payload or defaulting to localhost values. Configure these based on your deployment:

| Variable | Default | Description |
|----------|---------|-------------|
| `T3X_API_URL` | `http://localhost:8000` | T3X API server base URL. Passed via `t3x_api_url` field in webhook payload, or edit the node URL directly. In Docker, use `http://t3x-api:8000`. |
| `SLACK_WEBHOOK_URL` | (none) | Slack Incoming Webhook URL. Passed via `slack_webhook_url` field in webhook payload, or edit the Slack Notification node URL directly. |
| `REPORT_URL` | (none) | Optional URL for receiving eval result reports. Passed via `report_url` field in webhook payload. |

**Tip**: For a fixed deployment, edit the node URLs directly in n8n after import instead of passing them in every webhook payload.

---

## Available Recipes

### 1. Commit to Eval (`commit-to-eval.json`)

**Trigger**: `commit.created` webhook event
**Purpose**: When a new commit is created, automatically find associated Leaves and trigger an evaluation Run.

**Flow**:
```
Webhook ─► Find Leaves (GET /api/v1/leaves) ─► Has Leaves? ─┬─► Trigger Run (POST /api/v1/runs) ─► Report Result ─► Respond
                                                             └─► Respond No Leaves
```

**Webhook payload**:
```json
{
  "event": "commit.created",
  "payload": {
    "commit_hash": "sha256:abc123...",
    "project_id": "proj_xxx",
    "branch": "main",
    "message": "Extract preferences from conversation",
    "sentence_count": 5
  },
  "t3x_api_url": "http://localhost:8000",
  "report_url": "https://your-server.com/webhook/eval-results"
}
```

**Behavior**:
- Queries T3X API for leaves attached to the committed hash
- If leaves exist, creates an evaluation run for the first leaf
- Reports the run result to the configured `report_url`
- If no leaves are found, responds with a skip message

---

### 2. Merge Notify (`merge-notify.json`)

**Trigger**: `merge.completed` webhook event
**Purpose**: Send a formatted Slack notification when a merge operation completes.

**Flow**:
```
Webhook ─► Format Message (Set) ─► Slack Notification (HTTP POST) ─► Respond
```

**Webhook payload**:
```json
{
  "event": "merge.completed",
  "payload": {
    "commit_hash": "sha256:def456...",
    "project_id": "proj_xxx",
    "source_branch": "feature/new-preferences",
    "target_branch": "main"
  },
  "slack_webhook_url": "https://hooks.slack.com/services/T00/B00/xxx"
}
```

**Behavior**:
- Formats a Slack Block Kit message with merge details (project, branches, commit hash)
- Posts the message to the configured Slack webhook URL
- Falls back to a placeholder URL if `slack_webhook_url` is not provided

**Slack setup**: Create an Incoming Webhook in your Slack workspace at https://api.slack.com/messaging/webhooks

---

### 3. Leaf Auto-Generate (`leaf-auto-generate.json`)

**Trigger**: `leaf.created` webhook event
**Purpose**: Automatically trigger output generation when a new Leaf is created.

**Flow**:
```
Webhook ─► Generate Output (POST /api/v1/leaves/:id/generate) ─► Log Result (Set) ─► Respond
```

**Webhook payload**:
```json
{
  "event": "leaf.created",
  "payload": {
    "leaf_id": "leaf_abc123",
    "project_id": "proj_xxx",
    "type": "deploy_agent",
    "commit_hash": "sha256:abc123..."
  },
  "t3x_api_url": "http://localhost:8000"
}
```

**Behavior**:
- Calls the T3X leaf generate endpoint to produce output
- Logs the generation result (success/failure and response body)
- Responds with a summary including the leaf ID, type, and generation status
- Uses a 60-second timeout to accommodate LLM generation latency

---

## Testing Recipes

### Prerequisites

1. n8n is running (default: http://localhost:5678)
2. T3X API is running (default: http://localhost:8000)
3. The recipe workflow is imported and **activated** in n8n

### Method 1: curl

Test each recipe by sending a webhook request:

**Commit to Eval**:
```bash
curl -X POST http://localhost:5678/webhook/commit-to-eval \
  -H "Content-Type: application/json" \
  -d '{
    "event": "commit.created",
    "payload": {
      "commit_hash": "sha256:test123",
      "project_id": "proj_test",
      "branch": "main",
      "message": "Test commit",
      "sentence_count": 3
    },
    "t3x_api_url": "http://localhost:8000"
  }'
```

**Merge Notify** (uses https://httpbin.org as a test sink):
```bash
curl -X POST http://localhost:5678/webhook/merge-notify \
  -H "Content-Type: application/json" \
  -d '{
    "event": "merge.completed",
    "payload": {
      "commit_hash": "sha256:merge456",
      "project_id": "proj_test",
      "source_branch": "feature/test",
      "target_branch": "main"
    },
    "slack_webhook_url": "https://httpbin.org/post"
  }'
```

**Leaf Auto-Generate**:
```bash
curl -X POST http://localhost:5678/webhook/leaf-auto-generate \
  -H "Content-Type: application/json" \
  -d '{
    "event": "leaf.created",
    "payload": {
      "leaf_id": "leaf_test123",
      "project_id": "proj_test",
      "type": "deploy_agent",
      "commit_hash": "sha256:test123"
    },
    "t3x_api_url": "http://localhost:8000"
  }'
```

### Method 2: n8n Test UI

1. Open the workflow in n8n
2. Click **Test Workflow** (play button)
3. Send a curl request to the webhook URL shown in the Webhook node
4. Observe the execution flow in the n8n canvas -- each node lights up as it executes
5. Click on any node to inspect its input/output data

### Verifying Results

- **Commit to Eval**: Check the n8n execution log for the run creation response. If a `report_url` was configured, verify the report was received.
- **Merge Notify**: Check your Slack channel for the notification message. If using httpbin.org, check the curl response for the echoed payload.
- **Leaf Auto-Generate**: Check the n8n execution log for the generate response. Verify the leaf output was created in the T3X WebUI.

## Creating Custom Recipes

To create your own recipe:

1. Build the workflow visually in n8n
2. Test it thoroughly using the n8n test UI
3. Export via **Menu** > **Download** (produces JSON)
4. Save the JSON file to `apps/runner/recipes/`
5. Tag the workflow with `t3x` for discoverability

Common T3X webhook events you can build recipes for:
- `commit.created` -- A new commit was created
- `merge.completed` -- A merge operation finished
- `leaf.created` -- A new leaf was created
- `leaf.generated` -- Leaf output was generated
- `run.completed` -- An evaluation run finished
