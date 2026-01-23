# T3X Runner Tutorial

> This document is a **step-by-step guide** for T3X Runner, suitable for first-time users.
>
> For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Table of Contents

1. [Environment Setup](#1-environment-setup)
   - [Install Docker Desktop](#11-install-docker-desktop)
   - [Docker Configuration](#12-docker-configuration)
   - [Network Proxy Configuration (Optional)](#13-network-proxy-configuration-optional)
2. [Start T3X Services](#2-start-t3x-services)
   - [Clone Repository](#21-clone-repository)
   - [Configure Environment Variables](#22-configure-environment-variables)
   - [Start Docker Containers](#23-start-docker-containers)
   - [Verify Service Status](#24-verify-service-status)
3. [Configure n8n Workflow](#3-configure-n8n-workflow)
   - [Access n8n Console](#31-access-n8n-console)
   - [Import Workflow Template](#32-import-workflow-template)
   - [Configure AI Model Credentials](#33-configure-ai-model-credentials)
   - [Activate Workflow](#34-activate-workflow)
4. [Using WebUI](#4-using-webui)
   - [Access WebUI](#41-access-webui)
   - [Deploy Agents Page](#42-deploy-agents-page)
   - [Run Evaluation](#43-run-evaluation)
   - [View Results](#44-view-results)
5. [Run E2E Tests](#5-run-e2e-tests)
6. [Custom Evaluation Rules](#6-custom-evaluation-rules)
   - [Create Rule File](#61-create-rule-file)
   - [Rule File Format](#62-rule-file-format)
   - [Load Custom Rules](#63-load-custom-rules)
7. [FAQ](#7-faq)

---

## 1. Environment Setup

### 1.1 Install Docker Desktop

Docker Desktop is the containerization platform required to run T3X.

#### macOS

1. Visit [Docker Desktop Download Page](https://www.docker.com/products/docker-desktop/)
2. Download the macOS version (Intel or Apple Silicon)
3. Double-click the `.dmg` file and drag Docker icon to Applications folder
4. Launch Docker Desktop from Applications
5. Wait for Docker engine to start (status bar icon changes from orange to green)

#### Windows

1. Visit [Docker Desktop Download Page](https://www.docker.com/products/docker-desktop/)
2. Download the Windows version
3. Run the installer and follow the prompts
4. If prompted to enable WSL 2, follow the instructions
5. Restart your computer and launch Docker Desktop

#### Verify Installation

Open terminal and run:

```bash
docker --version
# Example output: Docker version 24.0.7, build afdd53b

docker compose version
# Example output: Docker Compose version v2.23.0
```

### 1.2 Docker Configuration

Open Docker Desktop and go to **Settings**:

#### Resource Configuration

Click **Resources** > **Advanced**:

| Setting | Recommended | Description |
|---------|-------------|-------------|
| CPUs | 4+ | CPU cores allocated to Docker |
| Memory | 8 GB+ | Memory, n8n and AI models need more |
| Swap | 1 GB | Swap space |
| Disk image size | 60 GB+ | Disk space (for images and container data) |

Click **Apply & Restart** to apply changes.

### 1.3 Network Proxy Configuration (Optional)

If you need proxy access to external networks, configure proxy settings.

#### Configure Docker Registry Mirrors

Docker Desktop > Settings > Docker Engine, add registry mirrors:

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

Click **Apply & Restart**.

#### Configure HTTP Proxy (if needed)

Docker Desktop > Settings > Resources > Proxies:

- **HTTP Proxy**: `http://127.0.0.1:7890` (modify according to your proxy port)
- **HTTPS Proxy**: `http://127.0.0.1:7890`
- **No Proxy**: `localhost,127.0.0.1,n8n,api,postgres`

> Note: `n8n,api,postgres` are Docker internal service names, must be added to No Proxy list.

---

## 2. Start T3X Services

### 2.1 Clone Repository

```bash
# Clone T3X repository
git clone https://github.com/t3x-dev/t3x.git
cd t3x

# Install dependencies (requires pnpm)
pnpm install
```

If pnpm is not installed:

```bash
npm install -g pnpm
```

### 2.2 Configure Environment Variables

Copy the environment variable template:

```bash
cp .env.example .env
```

Edit the `.env` file to configure necessary variables:

```bash
# Database (auto-configured by Docker, no changes needed)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/t3x

# n8n configuration
N8N_BASE_URL=http://localhost:5678

# AI API Key (for n8n AI Agent, configure at least one)
# OpenAI
OPENAI_API_KEY=sk-xxxx
# Or Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxx
```

### 2.3 Start Docker Containers

T3X uses Docker Compose to manage multiple services.

#### Start Full Service Stack (including n8n)

```bash
# Navigate to project root
cd /path/to/t3x

# Build and start all services
docker compose --profile runner --profile n8n up -d --build
```

> `--profile n8n` will also start n8n service
> `--profile runner` will also start runner service

#### Service Port Reference

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| WebUI | 3000 | http://localhost:3000 | T3X frontend interface |
| API | 8000 | http://localhost:8000 | T3X Engine API |
| n8n | 5678 | http://localhost:5678 | n8n workflow console |
| PostgreSQL | 5432 | - | Database (internal use) |

#### Check Container Status

```bash
docker compose ps
```

Expected output:

```
NAME                SERVICE     STATUS     PORTS
t3x-api-1           api         running    0.0.0.0:8000->8000/tcp
t3x-webui-1         webui       running    0.0.0.0:3000->3000/tcp
t3x-n8n-1           n8n         running    0.0.0.0:5678->5678/tcp
t3x-postgres-1      postgres    running    0.0.0.0:5432->5432/tcp
```

#### View Logs

```bash
# View all service logs
docker compose logs -f

# View only API logs
docker compose logs -f api

# View only n8n logs
docker compose logs -f n8n
```

### 2.4 Verify Service Status

#### Check API Health

```bash
curl http://localhost:8000/health
# Expected output: {"status":"ok","timestamp":"..."}
```

#### Check n8n Health

```bash
curl http://localhost:5678/healthz
# Expected output: {"status":"ok"}
```

#### Access WebUI

Open browser and visit http://localhost:3000

If you see the T3X interface, the services have started successfully.

---

## 3. Configure n8n Workflow

n8n is the workflow execution engine used by T3X to run AI Agents.

### 3.1 Access n8n Console

Open browser and visit http://localhost:5678

First visit will require account creation:

1. Enter email (can be any email, e.g., `admin@localhost`)
2. Set password
3. Click create account

### 3.2 Import Workflow Template

T3X provides pre-configured workflow templates.

#### Steps

1. In n8n interface, click **+** or **Create Workflow** in top right
2. Click **⋮** (three dots) menu in top right
3. Select **Import from File...**
4. Select file: `apps/runner/resources/n8n-workflow.json`
5. Click **Import**

#### Workflow Structure

After import, you'll see a workflow with these nodes:

```
[Webhook] → [AI Agent] → [Respond to Webhook]
              ↓
        [Weather Tool]
```

- **Webhook**: Receives requests from T3X
- **AI Agent**: LangChain Agent, processes user queries
- **Weather Tool**: Example tool, simulates weather queries
- **Respond to Webhook**: Returns results to T3X

### 3.3 Configure AI Model Credentials

AI Agent needs LLM model credentials to work.

#### Configure OpenAI

1. Double-click **AI Agent** node
2. In **Chat Model** dropdown, select **OpenAI Chat Model**
3. Click **Create New** next to **Credential**
4. Enter your OpenAI API Key
5. Click **Save**
6. Select model (recommended `gpt-4o`)

#### Configure Anthropic (Claude)

1. Double-click **AI Agent** node
2. In **Chat Model** dropdown, select **Anthropic Chat Model**
3. Click **Create New** next to **Credential**
4. Enter your Anthropic API Key
5. Click **Save**
6. Select model (recommended `claude-sonnet-4-5`)

#### Configure Ollama (Local Model)

If you want to use local models:

1. First install [Ollama](https://ollama.ai/) locally
2. Pull model: `ollama pull llama3.2`
3. In n8n:
   - Select **Ollama Chat Model**
   - Base URL: `http://host.docker.internal:11434` (Docker accessing host)
   - Select model

### 3.4 Activate Workflow

1. After configuration, click **Save** in top right to save workflow
2. Click publish in top right, switch status from **Inactive** to **Active**
3. Note the Webhook URL (use production URL not test URL, click Webhook node to see), format:
   ```
   http://localhost:5678/webhook/weather-agent
   ```

> **Important**: Workflow must be in Active state to receive requests!

---

## 4. Using WebUI

### 4.1 Access WebUI

Open browser and visit http://localhost:3000

### 4.2 Deploy Agents Page

Click **Deploy Agents** in the left menu to enter the Agent deployment page.

#### Page Description

| Area | Description |
|------|-------------|
| **Agent Cards** | Shows list of deployed Agents |
| **Run Button** | Trigger Agent execution |
| **Status Indicator** | Idle / Running |
| **Recent Run** | Shows the most recent run ID |

#### Create Deploy Agent

1. Click **+ New Agent** button
2. Fill in configuration:
   - **Name**: Agent name (e.g., "Weather Agent")
   - **Webhook ID**: n8n workflow's Webhook ID (e.g., `weather-agent`)

3. Click **Save**

> **Note**: Custom evaluation rules are specified via API or test scripts, see [Section 6: Custom Evaluation Rules](#6-custom-evaluation-rules).

### 4.3 Run Evaluation

#### Trigger Run (Currently only E2E script available, via Run E2E Test button at bottom of page)

1. On Deploy Agent card, click **Run** button
2. Enter test query (e.g., "What's the weather like in Beijing today?")
3. Click **Submit**

(For script:
1. Select agent
2. Select prompt
3. Click Run E2E Test)

#### Run Flow

```
WebUI [Run Button]
  ↓ POST /api/v1/runs
Engine [Create Run Record]
  ↓ Webhook Trigger
n8n [Execute AI Agent]
  ↓ Callback
Engine [Call Runner for Evaluation]
  ↓ Store Results
WebUI [Display Results]
```

#### Button Status Explanation

| Status | Description |
|--------|-------------|
| **Run** | Idle, can click to run |
| **Running...** | Executing, please wait |
| **Run** (green check) | Last run succeeded |
| **Run** (red x) | Last run failed |

### 4.4 View Results

#### Enter Eval Results Page

After run completes:

1. Click **Detail** on the right side of a run in Recent Runs list, or click the recent run link
2. Enter `/eval/[runId]` page

#### Results Page Description

| Area | Description |
|------|-------------|
| **Summary** | Run summary (passed/failed, score) |
| **Dimension Scores** | Scores by dimension (radar chart) |
| **Check Results** | Check results for each rule |
| **Violations** | List of violations (if any) |
| **Trace Summary** | Execution trace summary |
| **Assertions** | LLM-generated assertions (requires API Key) |

#### Dimension Score Explanation

| Dimension | Description |
|-----------|-------------|
| **Task Completion** | Task completion (is output correct) |
| **Tool Use** | Tool usage correctness |
| **Trajectory Efficiency** | Trajectory efficiency (are steps redundant) |
| **Cost Efficiency** | Cost efficiency (Token usage) |
| **Latency** | Latency performance |

#### API Correspondence

| WebUI Action | API Endpoint | Description |
|--------------|--------------|-------------|
| Click Run button | `POST /api/v1/runs` | Create run |
| View run status | `GET /api/v1/runs/:id` | Get run details |
| View Agent list | `GET /api/v1/deploy-agents` | List Deploy Agents |
| Create Agent | `POST /api/v1/deploy-agents` | Create Deploy Agent |

---

## 5. Run E2E Tests

T3X provides end-to-end test scripts to quickly verify the entire flow.

### Prerequisites

Ensure the following services are running:
- API (http://localhost:8000)
- n8n (http://localhost:5678)
- runner (http://localhost:8080)
- n8n workflow is activated

### Run Tests

```bash
# Navigate to runner directory
cd apps/runner

# Run E2E test (using v1 prompt)
./scripts/test-e2e.sh

# Or use optimized v2 prompt
./scripts/test-e2e.sh v2
```

### Test Flow

The script will automatically execute:

1. **Create Run**: `POST /api/v1/runs`
2. **Wait for Completion**: Poll run status
3. **Display Results**: Evaluation score, dimension scores, violations list

### Expected Output

```
============================================================================
 Phase 6.3 End-to-End Validation
============================================================================

[INFO] API URL: http://localhost:8000
[INFO] n8n Webhook ID: weather-agent
[INFO] Prompt Version: v1
[INFO] Test Input: What's the weather like in Beijing today?

[INFO] Step 1: Trigger run POST /v1/runs
[SUCCESS] Run created
  run_id: run_xxxxx
  runner_run_id: rr_xxxxx
  status: pending

[INFO] Step 2: Waiting for run to complete...
  Status: completed (waited 15s)

[INFO] Step 3: View results

=== Basic Info ===
  run_id: run_xxxxx
  status: completed

=== Evaluation Result ===
  passed: true
  score: 0.85

=== Dimension Scores ===
{
  "task_completion": 1,
  "tool_use": 0.8,
  "trajectory_efficiency": 0.7,
  "cost_efficiency": 0.9,
  "latency": 1
}

=== Trace Summary ===
{
  "step_count": 4,
  "llm_calls": 1,
  "tool_calls": 1,
  "tokens": {
    "prompt_tokens": 169,
    "completion_tokens": 99,
    "total_tokens": 268
  },
  "total_latency_ms": 2500
}

============================================================================
[SUCCESS] Run completed, evaluation passed!
============================================================================
```

### v1 vs v2 Prompt Comparison

| Version | Characteristics | Expected Score |
|---------|-----------------|----------------|
| v1 | Broad instructions, may call unnecessary tools | 0.60-0.80 |
| v2 | Precise instructions, controls tool usage and output length | 0.80-0.95 |

This demonstrates T3X's core value: **Discover Prompt issues through evaluation, guide optimization**.

---

## 6. Custom Evaluation Rules

Runner supports custom evaluation rules, allowing you to customize evaluation criteria for different Agent scenarios.

### 6.1 Create Rule File

Rule files are stored in `apps/runner/resources/rules/` directory, supporting YAML and JSON formats.

```bash
apps/runner/resources/rules/
├── default.yml              # Default rules
├── example.yaml             # Example rule template (reference this file)
├── weather-agent-eval.yaml  # Weather Agent specific rules
└── my-custom-eval.yaml      # Your custom rules
```

### 6.2 Rule File Format

Reference the template file: `apps/runner/resources/rules/example.yaml`

Copy and modify the template:

```bash
cd apps/runner/resources/rules
cp example.yaml my-custom-eval.yaml
# Edit my-custom-eval.yaml to modify rules as needed
```

### 6.3 Load Custom Rules

Custom rules are loaded via the `leaf.rules_ref` field, supporting the following two methods:

#### Method 1: API Call

```bash
curl -X POST http://localhost:8000/api/v1/runs \
  -H "Content-Type: application/json" \
  -d '{
    "leaf": {
      "id": "leaf_test",
      "type": "eval",
      "content": "You are a weather assistant...",
      "rules_ref": "my-custom-eval"
    },
    "inputs": { "query": "Beijing weather" },
    "workflow": { "type": "n8n", "webhook_id": "weather-agent" }
  }'
```

#### Method 2: Modify E2E Test Script

Modify the `rules_ref` field in the request body in `scripts/test-e2e.sh`:

```json
{
  "leaf": {
    "rules_ref": "my-custom-eval"
  }
}
```

### Rule Loading Priority

```
1. resources/rules/{rules_ref}.yaml
2. resources/rules/{rules_ref}.yml
3. resources/rules/{rules_ref}.json
4. resources/rules/default.yml (fallback)
```

---

## 7. FAQ

### Q: Docker containers won't start?

**Check port conflicts**:

```bash
# Check port 3000
lsof -i :3000

# Check port 8000
lsof -i :8000

# Check port 5678
lsof -i :5678
```

If ports are occupied, stop the occupying process or modify port mappings in `docker-compose.yml`.

### Q: n8n workflow won't trigger?

**Checklist**:

1. Is workflow in **Active** state?
2. Is Webhook URL correct?
3. Is n8n container running normally?
4. Check n8n logs: `docker compose logs -f n8n`

### Q: AI Agent returns error?

**Check AI credentials**:

1. Open workflow in n8n
2. Double-click AI Agent node
3. Check if Credential is configured correctly
4. Test if API Key is valid

### Q: API returns "unhealthy"?

**Check database connection**:

```bash
# View API logs
docker compose logs api

# Check database container
docker compose ps postgres

# Restart service
docker compose restart api
```

### Q: Token count shows 0?

This may be an n8n version issue. Ensure you're using an n8n version that supports the `tokenUsage` field.

Runner supports both field names:
- `tokenUsage` (newer n8n)
- `tokenUsageEstimate` (older n8n)

### Q: How to stop all services?

```bash
# Stop and remove containers
docker compose down

# Stop and remove containers, volumes, networks (complete cleanup)
docker compose down -v
```

### Q: How to rebuild?

```bash
# Force rebuild images
docker compose --profile n8n up -d --build --force-recreate
```

### Q: How to view database contents?

```bash
# Enter postgres container
docker compose exec postgres psql -U postgres -d t3x

# View runs table
SELECT * FROM runs LIMIT 10;

# Exit
\q
```

---

## More Resources

- **Architecture Documentation**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **n8n Workflow Configuration**: [n8n-workflow-setup.md](./n8n-workflow-setup.md)
- **Project Main Documentation**: [/CLAUDE.md](/CLAUDE.md)
- **GitHub Issues**: If you have questions, please submit an Issue on GitHub

---

## Next Steps

1. **Try Custom Rules**: Edit YAML files under `resources/rules/`
2. **Optimize Prompts**: Adjust Agent Prompt based on evaluation results
3. **Add More Tools**: Extend Agent's toolset in n8n
4. **Integrate into CI/CD**: Use E2E test scripts for automated testing
