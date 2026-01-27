# Local End-to-End Testing Guide

This guide walks through manual testing of the t3x stack: WebUI → Hono API → @t3x/storage → PGLite.

**Last Updated:** 2026-01-23

## Prerequisites

```bash
# Ensure dependencies are installed
cd /path/to/t3x
pnpm install

# Build all packages
pnpm build:core
pnpm build:storage
```

**Database Mode:** By default (no `DATABASE_URL`), the API uses PGLite for local development. Set `DATABASE_URL` to use PostgreSQL instead.

## 1. Start the Development Servers

You need to start **two** servers: the API server and the WebUI.

### Terminal 1: Start API Server (Hono)
```bash
pnpm dev:api
```
API server starts at: http://localhost:8000
- Health check: `GET http://localhost:8000/health`
- API docs: `GET http://localhost:8000/api/docs`

### Terminal 2: Start WebUI (Next.js)
```bash
pnpm dev:webui
```
WebUI starts at: http://localhost:3000

PGLite database location: `.t3x/database/`

## 2. Health Check

Verify the API is running:

```bash
curl -s http://localhost:8000/health | jq
```

Expected:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "storage": "pglite"
}
```

## 3. End-to-End Test Flow

### Step 1: Create a Project

```bash
# Create project
curl -s -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test Project"}' | jq

# Save project_id for later
PROJECT_ID=$(curl -s -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test Project"}' | jq -r '.data.project_id')

echo "Created project: $PROJECT_ID"
```

### Step 2: List Projects (Verify Storage)

```bash
curl -s "http://localhost:8000/api/v1/projects" | jq
```

Expected: Your project appears in the list.

### Step 3: Create a Conversation

```bash
CONV_ID=$(curl -s -X POST http://localhost:8000/api/v1/conversations \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Test Conversation\"}" \
  | jq -r '.data.conversation_id')

echo "Created conversation: $CONV_ID"
```

### Step 4: Add Turns to the Conversation

```bash
# User turn
curl -s -X POST http://localhost:8000/api/v1/turns \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"user\",
    \"content\": \"I want to build a login feature with email and password.\"
  }" | jq

# Assistant turn
curl -s -X POST http://localhost:8000/api/v1/turns \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"assistant\",
    \"content\": \"I will help you build a login feature. Should we use OAuth or a custom implementation?\"
  }" | jq
```

### Step 5: Verify Turn Chain

```bash
# List turns in conversation
curl -s "http://localhost:8000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID" | jq
```

Expected: Two turns with `parent_turn_hash` linking them.

### Step 6: Get Turn Details with Extracted Rings

```bash
# Get first turn hash
TURN_HASH=$(curl -s "http://localhost:8000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID" \
  | jq -r '.data.turns[0].turn_hash')

# Get turn details with ring extraction
curl -s "http://localhost:8000/api/v1/turns/$TURN_HASH" | jq
```

Expected: Turn with `rings` containing extracted keywords, entities, and segments.

### Step 7: Create a Commit

```bash
# Get turn hashes for window
TURNS=$(curl -s "http://localhost:8000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID")
START_HASH=$(echo $TURNS | jq -r '.data.turns[0].turn_hash')
END_HASH=$(echo $TURNS | jq -r '.data.turns[-1].turn_hash')

# Create commit
curl -s -X POST http://localhost:8000/api/v1/commits \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"branch\": \"main\",
    \"message\": \"Initial commit: login feature discussion\",
    \"turn_window\": {
      \"start_turn_hash\": \"$START_HASH\",
      \"end_turn_hash\": \"$END_HASH\"
    }
  }" | jq
```

### Step 8: Check Status Summary

```bash
curl -s http://localhost:8000/api/v1/status | jq
```

Expected:
```json
{
  "status": "ok",
  "data": {
    "projects_count": 1,
    "conversations_count": 1,
    "turns_count": 2,
    "commits_count": 1
  }
}
```

## 4. Inspect PGLite Database Directly

Create a Node.js script to inspect the database:

```bash
cat > /tmp/inspect-db.mjs << 'EOF'
import { PGlite } from '@electric-sql/pglite';

const dataDir = process.argv[2] || './.t3x/database';
console.log(`Opening database at: ${dataDir}`);

const client = new PGlite(dataDir);

// List all tables
const tables = await client.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename
`);
console.log('\n=== Tables ===');
tables.rows.forEach(r => console.log(`  - ${r.tablename}`));

// Count rows in each table
console.log('\n=== Row Counts ===');
for (const { tablename } of tables.rows) {
  const count = await client.query(`SELECT COUNT(*) as count FROM ${tablename}`);
  console.log(`  ${tablename}: ${count.rows[0].count}`);
}

// Sample data from projects
console.log('\n=== Projects ===');
const projects = await client.query('SELECT * FROM projects LIMIT 5');
console.log(JSON.stringify(projects.rows, null, 2));

// Sample data from conversations
console.log('\n=== Conversations ===');
const convs = await client.query('SELECT * FROM conversations LIMIT 5');
console.log(JSON.stringify(convs.rows, null, 2));

// Sample data from turns
console.log('\n=== Turns (last 3) ===');
const turns = await client.query('SELECT turn_hash, role, LEFT(content, 50) as content_preview FROM turns_v2 ORDER BY created_at DESC LIMIT 3');
console.log(JSON.stringify(turns.rows, null, 2));

// Sample data from commits
console.log('\n=== Commits ===');
const commits = await client.query('SELECT commit_hash, branch, message FROM commits_v2 LIMIT 5');
console.log(JSON.stringify(commits.rows, null, 2));

await client.close();
console.log('\nDone!');
EOF

# Run it (from project root)
cd /path/to/t3x
node /tmp/inspect-db.mjs ./.t3x/database
```

## 5. Full Test Script (Automated)

Save this as `scripts/e2e-test.sh`:

```bash
#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:8000}"
API="$BASE_URL/api/v1"

echo "=== T3X E2E Test ==="
echo "API: $API"
echo

# Health check
echo "1. Health check..."
curl -sf "$BASE_URL/health" | jq -e '.status == "ok"' > /dev/null
echo "   ✓ API is healthy"

# Create project
echo "2. Creating project..."
PROJECT=$(curl -sf -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test '$(date +%s)'"}')
PROJECT_ID=$(echo $PROJECT | jq -r '.data.project_id')
echo "   ✓ Created project: $PROJECT_ID"

# Create conversation
echo "3. Creating conversation..."
CONV=$(curl -sf -X POST "$API/conversations" \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Test Conv\"}")
CONV_ID=$(echo $CONV | jq -r '.data.conversation_id')
echo "   ✓ Created conversation: $CONV_ID"

# Add turns
echo "4. Adding turns..."
TURN1=$(curl -sf -X POST "$API/turns" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"user\",
    \"content\": \"Build a login with email authentication.\"
  }")
TURN1_HASH=$(echo $TURN1 | jq -r '.data.turn_hash')
echo "   ✓ Turn 1: $TURN1_HASH"

TURN2=$(curl -sf -X POST "$API/turns" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"assistant\",
    \"content\": \"I will implement email login with password validation.\"
  }")
TURN2_HASH=$(echo $TURN2 | jq -r '.data.turn_hash')
echo "   ✓ Turn 2: $TURN2_HASH"

# Verify turn chain
echo "5. Verifying turn chain..."
TURN2_DETAIL=$(curl -sf "$API/turns/$TURN2_HASH")
PARENT=$(echo $TURN2_DETAIL | jq -r '.data.parent_turn_hash')
if [ "$PARENT" = "$TURN1_HASH" ]; then
  echo "   ✓ Turn chain is correct (turn2 -> turn1)"
else
  echo "   ✗ Turn chain broken! Expected $TURN1_HASH, got $PARENT"
  exit 1
fi

# Create commit
echo "6. Creating commit..."
COMMIT=$(curl -sf -X POST "$API/commits" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"branch\": \"main\",
    \"message\": \"E2E test commit\",
    \"turn_window\": {
      \"start_turn_hash\": \"$TURN1_HASH\",
      \"end_turn_hash\": \"$TURN2_HASH\"
    }
  }")
COMMIT_HASH=$(echo $COMMIT | jq -r '.data.commit_hash')
echo "   ✓ Created commit: $COMMIT_HASH"

# Verify status
echo "7. Checking status..."
STATUS=$(curl -sf "$API/status")
PROJ_COUNT=$(echo $STATUS | jq '.data.projects_count')
CONV_COUNT=$(echo $STATUS | jq '.data.conversations_count')
TURN_COUNT=$(echo $STATUS | jq '.data.turns_count')
COMMIT_COUNT=$(echo $STATUS | jq '.data.commits_count')
echo "   Projects: $PROJ_COUNT, Conversations: $CONV_COUNT, Turns: $TURN_COUNT, Commits: $COMMIT_COUNT"

# Cleanup (optional)
echo "8. Cleanup..."
curl -sf -X DELETE "$API/projects/$PROJECT_ID" > /dev/null
echo "   ✓ Deleted project $PROJECT_ID"

echo
echo "=== All tests passed! ==="
```

Make it executable:
```bash
chmod +x scripts/e2e-test.sh
./scripts/e2e-test.sh
```

## 6. WebUI Browser Testing

1. Open http://localhost:3000
2. Create a new project (click + button)
3. Open the project canvas
4. Create a conversation node
5. Add messages via the chat panel
6. Create a commit from the conversation

Check data persisted:
```bash
# After browser actions, verify via API
curl -s http://localhost:8000/api/v1/status | jq
```

## 7. Reset Database

To start fresh:

```bash
# Stop both dev servers (Ctrl+C)

# Delete the database
rm -rf .t3x/database

# Restart servers
pnpm dev:api    # Terminal 1
pnpm dev:webui  # Terminal 2
```

## Troubleshooting

### API returns 500 errors
```bash
# Check API console for errors
# Common issues:
# - Missing dependencies: pnpm install
# - Build issues: pnpm build:core && pnpm build:storage
```

### Database not persisting
```bash
# Verify database directory exists
ls -la .t3x/database/

# Check permissions
# PGLite needs write access to the directory
```

### Port already in use
```bash
# Find and kill process on port 8000 (API)
lsof -i :8000
kill -9 <PID>

# Find and kill process on port 3000 (WebUI)
lsof -i :3000
kill -9 <PID>
```

### WebUI can't connect to API
```bash
# Verify API is running
curl http://localhost:8000/health

# Check for CORS issues in browser console
# API server should have CORS middleware enabled
```

## 8. V4 Architecture Testing

V4 架构引入了新的概念：CommitV4（纯知识）、Leaf（约束+输出）、Pin（源选择）、ConversationContext（对话上下文）。

### Step 1: Create a CommitV4

```bash
# Create a CommitV4 with sentences (no constraints - they go in Leaves)
COMMIT_V4=$(curl -s -X POST http://localhost:8000/api/v1/commits-v4 \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"branch\": \"main\",
    \"message\": \"Initial knowledge commit\",
    \"parents\": [],
    \"author\": { \"type\": \"human\", \"name\": \"Test User\" },
    \"sentences\": [
      { \"id\": \"s_001\", \"text\": \"We want to visit Tokyo in spring.\" },
      { \"id\": \"s_002\", \"text\": \"Cherry blossom season is preferred.\" }
    ],
    \"source_refs\": [
      { \"type\": \"conversation\", \"id\": \"$CONV_ID\", \"title\": \"Trip Planning\" }
    ]
  }")

COMMIT_V4_HASH=$(echo $COMMIT_V4 | jq -r '.data.hash')
echo "Created CommitV4: $COMMIT_V4_HASH"
```

### Step 2: Create a Leaf with Constraints

```bash
# Create a leaf with constraints (constraints belong to Leaf, not Commit)
LEAF=$(curl -s -X POST http://localhost:8000/api/v1/leaves \
  -H "Content-Type: application/json" \
  -d "{
    \"commit_hash\": \"$COMMIT_V4_HASH\",
    \"project_id\": \"$PROJECT_ID\",
    \"type\": \"deploy_agent\",
    \"title\": \"Travel Agent\",
    \"constraints\": [
      { \"id\": \"cst_001\", \"type\": \"require\", \"match_mode\": \"semantic\", \"value\": \"cherry blossom\", \"source_sentence_id\": \"s_002\" },
      { \"id\": \"cst_002\", \"type\": \"exclude\", \"match_mode\": \"exact\", \"value\": \"rainy season\" }
    ],
    \"config\": { \"model\": \"claude-sonnet-4\", \"temperature\": 0.7 }
  }")

LEAF_ID=$(echo $LEAF | jq -r '.data.id')
echo "Created Leaf: $LEAF_ID"
```

### Step 3: List Leaves by Commit

```bash
# Get all leaves for a specific commit
curl -s "http://localhost:8000/api/v1/commits/$COMMIT_V4_HASH/leaves" | jq
```

### Step 4: Update Leaf Output and Assertions

```bash
# Simulate LLM output generation and validation
curl -s -X PATCH "http://localhost:8000/api/v1/leaves/$LEAF_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "output": "I recommend visiting Tokyo during cherry blossom season in late March to early April.",
    "assertions": [
      { "id": "ast_001", "constraint_id": "cst_001", "passed": true, "details": "Found cherry blossom reference", "lesson": "User prefers spring travel" },
      { "id": "ast_002", "constraint_id": "cst_002", "passed": true, "details": "No rainy season mention" }
    ]
  }' | jq
```

### Step 5: Pin a Conversation

```bash
# Pin the conversation as a knowledge source
PIN=$(curl -s -X POST "http://localhost:8000/api/v1/projects/$PROJECT_ID/pins" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"conversation\",
    \"ref_id\": \"$CONV_ID\"
  }")

PIN_ID=$(echo $PIN | jq -r '.data.id')
echo "Created Pin: $PIN_ID"
```

### Step 6: List Project Pins

```bash
# List all pins in the project
curl -s "http://localhost:8000/api/v1/projects/$PROJECT_ID/pins" | jq

# Filter by type
curl -s "http://localhost:8000/api/v1/projects/$PROJECT_ID/pins?type=conversation" | jq
```

### Step 7: Pin a Leaf (for assertion lessons)

```bash
# Pin the leaf to include its assertion lessons in context
curl -s -X POST "http://localhost:8000/api/v1/projects/$PROJECT_ID/pins" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"leaf\",
    \"ref_id\": \"$LEAF_ID\",
    \"selected_assertion_ids\": [\"ast_001\"]
  }" | jq
```

### Step 8: Get CommitV4 Details

```bash
# Retrieve the commit with all its data
curl -s "http://localhost:8000/api/v1/commits-v4/$COMMIT_V4_HASH" | jq

# Note: Commit contains sentences only, not constraints
# Constraints are in the associated Leaves
```

### Step 9: Test Storage Layer Directly (Optional)

```bash
# Inspect V4 tables
cat > /tmp/inspect-v4.mjs << 'EOF'
import { PGlite } from '@electric-sql/pglite';

const dataDir = process.argv[2] || './.t3x/database';
const client = new PGlite(dataDir);

console.log('\n=== V4 Tables ===');

// CommitsV4
console.log('\n--- CommitsV4 ---');
const commits = await client.query('SELECT hash, message, branch FROM commits_v4 LIMIT 5');
console.log(JSON.stringify(commits.rows, null, 2));

// Leaves
console.log('\n--- Leaves ---');
const leaves = await client.query('SELECT id, commit_hash, type, title FROM leaves LIMIT 5');
console.log(JSON.stringify(leaves.rows, null, 2));

// Pins
console.log('\n--- Pins ---');
const pins = await client.query('SELECT id, project_id, type, ref_id FROM pins LIMIT 5');
console.log(JSON.stringify(pins.rows, null, 2));

// Conversation Contexts
console.log('\n--- Conversation Contexts ---');
const contexts = await client.query('SELECT * FROM conversation_contexts LIMIT 5');
console.log(JSON.stringify(contexts.rows, null, 2));

await client.close();
console.log('\nDone!');
EOF

node /tmp/inspect-v4.mjs ./.t3x/database
```

### V4 Architecture Summary

| 概念 | 用途 | API 端点 | 状态 |
|------|------|----------|------|
| **CommitV4** | 纯知识存储（sentences only） | `/v1/commits-v4` | **已实现** |
| **Leaf** | 约束 + 输出 + 验证 | `/v1/leaves` | **已实现** |
| **Pin** | 源选择（commit 来源 + 对话上下文） | `/v1/projects/:id/pins` | **已实现** |
| **ConversationContext** | 每对话上下文配置 | Storage only | 开发中 |

**V4 核心原则**：
- **CommitV4** 只存储纯知识（sentences），不包含 constraints
- **Leaf** 拥有 constraints、output、assertions（应用层）
- **Pin** 用于标记 commit 来源和对话上下文
- 同一 Commit 可被多个 Leaf 引用，使用不同的 constraints
