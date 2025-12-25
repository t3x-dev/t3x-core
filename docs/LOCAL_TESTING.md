# Local End-to-End Testing Guide

This guide walks through manual testing of the t3x stack: WebUI → API Routes → @t3x/storage → PGLite.

## Prerequisites

```bash
# Ensure dependencies are installed
cd /path/to/t3x
npm install

# Build all packages
npm run build:core
npm run build:storage
```

## 1. Start the Development Server

```bash
cd t3x-webui
npm run dev
```

Server starts at: http://localhost:3000

PGLite database location: `t3x-webui/.t3x/database/`

## 2. Health Check

Verify the API is running:

```bash
curl -s http://localhost:3000/api/v1/health | jq
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
curl -s -X POST http://localhost:3000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test Project"}' | jq

# Save project_id for later
PROJECT_ID=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test Project"}' | jq -r '.data.project_id')

echo "Created project: $PROJECT_ID"
```

### Step 2: List Projects (Verify Storage)

```bash
curl -s "http://localhost:3000/api/v1/projects" | jq
```

Expected: Your project appears in the list.

### Step 3: Create a Conversation

```bash
CONV_ID=$(curl -s -X POST http://localhost:3000/api/v1/conversations \
  -H "Content-Type: application/json" \
  -d "{\"project_id\": \"$PROJECT_ID\", \"title\": \"Test Conversation\"}" \
  | jq -r '.data.conversation_id')

echo "Created conversation: $CONV_ID"
```

### Step 4: Add Turns to the Conversation

```bash
# User turn
curl -s -X POST http://localhost:3000/api/v1/turns \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"conversation_id\": \"$CONV_ID\",
    \"role\": \"user\",
    \"content\": \"I want to build a login feature with email and password.\"
  }" | jq

# Assistant turn
curl -s -X POST http://localhost:3000/api/v1/turns \
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
curl -s "http://localhost:3000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID" | jq
```

Expected: Two turns with `parent_turn_hash` linking them.

### Step 6: Get Turn Details with Extracted Rings

```bash
# Get first turn hash
TURN_HASH=$(curl -s "http://localhost:3000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID" \
  | jq -r '.data.turns[0].turn_hash')

# Get turn details with ring extraction
curl -s "http://localhost:3000/api/v1/turns/$TURN_HASH" | jq
```

Expected: Turn with `rings` containing extracted keywords, entities, and segments.

### Step 7: Create a Commit

```bash
# Get turn hashes for window
TURNS=$(curl -s "http://localhost:3000/api/v1/turns?project_id=$PROJECT_ID&conversation_id=$CONV_ID")
START_HASH=$(echo $TURNS | jq -r '.data.turns[0].turn_hash')
END_HASH=$(echo $TURNS | jq -r '.data.turns[-1].turn_hash')

# Create commit
curl -s -X POST http://localhost:3000/api/v1/commits \
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
curl -s http://localhost:3000/api/v1/status | jq
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

const dataDir = process.argv[2] || './t3x-webui/.t3x/database';
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
node /tmp/inspect-db.mjs ./t3x-webui/.t3x/database
```

## 5. Full Test Script (Automated)

Save this as `scripts/e2e-test.sh`:

```bash
#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API="$BASE_URL/api/v1"

echo "=== T3X E2E Test ==="
echo "API: $API"
echo

# Health check
echo "1. Health check..."
curl -sf "$API/health" | jq -e '.status == "ok"' > /dev/null
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
curl -s http://localhost:3000/api/v1/status | jq
```

## 7. Reset Database

To start fresh:

```bash
# Stop the dev server (Ctrl+C)

# Delete the database
rm -rf t3x-webui/.t3x/database

# Restart
cd t3x-webui && npm run dev
```

## Troubleshooting

### API returns 500 errors
```bash
# Check Next.js console for errors
# Common issues:
# - Missing dependencies: npm install
# - Build issues: npm run build (in t3x-core and t3x-storage first)
```

### Database not persisting
```bash
# Verify database directory exists
ls -la t3x-webui/.t3x/database/

# Check permissions
# PGLite needs write access to the directory
```

### Port already in use
```bash
# Find and kill process on port 3000
lsof -i :3000
kill -9 <PID>
```
