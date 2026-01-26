# V4 E2E Runbook

> This runbook guides you through a complete V4 workflow.
> Expected completion time: 10-15 minutes
> Prerequisites: Development environment set up

## Prerequisites

### 1. Start Services

Open two terminal windows:

**Terminal 1 - WebUI:**
```bash
cd /path/to/t3x
pnpm dev:webui
# Wait for: "Ready on http://localhost:3000"
```

**Terminal 2 - API:**
```bash
cd /path/to/t3x
pnpm dev:api
# Wait for: "Server running on port 8000"
```

### 2. Verify Services

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

---

## Step 1: Create a Project

**API:**
```bash
curl -X POST http://localhost:8000/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "V4 E2E Test Project"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "proj_xxxxxxxxx",
    "name": "V4 E2E Test Project",
    "created_at": "2024-..."
  }
}
```

**Save the project_id for subsequent steps:**
```bash
export PROJECT_ID="proj_xxxxxxxxx"
```

**WebUI Verification:**
1. Open http://localhost:3000
2. You should see "V4 E2E Test Project" in the project list
3. Click to open the project canvas

---

## Step 2: Create a V4 Commit

**API:**
```bash
curl -X POST http://localhost:8000/v1/commits-v4 \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "'$PROJECT_ID'",
    "branch": "main",
    "message": "Initial user preferences commit",
    "sentences": [
      {"id": "s_1", "text": "User prefers dark mode for all interfaces"},
      {"id": "s_2", "text": "User speaks English and Mandarin Chinese"},
      {"id": "s_3", "text": "User timezone is Asia/Shanghai (UTC+8)"}
    ],
    "author": {
      "type": "human",
      "name": "Test User"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "hash": "sha256:abc...",
    "schema": "t3x/commit/v4",
    "parents": [],
    "content": {
      "sentences": [
        {"id": "s_1", "text": "User prefers dark mode for all interfaces"},
        {"id": "s_2", "text": "User speaks English and Mandarin Chinese"},
        {"id": "s_3", "text": "User timezone is Asia/Shanghai (UTC+8)"}
      ]
    },
    "author": {"type": "human", "name": "Test User"},
    "committed_at": "2024-...",
    "message": "Initial user preferences commit",
    "branch": "main",
    "project_id": "proj_...",
    "position_x": null,
    "position_y": null,
    "source_refs": null,
    "created_at": "2024-..."
  }
}
```

**Save the commit hash:**
```bash
export COMMIT_HASH="sha256:abc..."
```

**WebUI Verification:**
1. Refresh the project canvas
2. The new commit should appear as a node
3. Click the commit node
4. Detail panel should show:
   - Hash
   - Message: "Initial user preferences commit"
   - 3 sentences listed
   - Author information
   - NO constraints section (V4 commits store only sentences)

---

## Step 3: Verify V3 Rejection

This step verifies that the V4 endpoint correctly rejects V3 payloads.

**API (should fail):**
```bash
curl -X POST http://localhost:8000/v1/commits-v4 \
  -H "Content-Type: application/json" \
  -d '{
    "schema": "t3x/commit/v3",
    "project_id": "'$PROJECT_ID'",
    "turn_window": {"start_turn_hash": "sha256:xxx", "end_turn_hash": "sha256:yyy"},
    "facet_snapshot": []
  }'
```

**Expected Response (400 error):**
```json
{
  "success": false,
  "error": {
    "code": "COMMIT_VERSION_UNSUPPORTED",
    "message": "Only V4 commits supported on this endpoint. Received schema: t3x/commit/v3. Use /v1/commits-v3 for legacy commits."
  }
}
```

**Also verify constraints rejection:**
```bash
curl -X POST http://localhost:8000/v1/commits-v4 \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "'$PROJECT_ID'",
    "sentences": [{"id": "s_1", "text": "Test"}],
    "author": {"type": "human"},
    "constraints": [{"type": "require", "value": "test"}]
  }'
```

**Expected Response (400 error):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "V4 commits do not support constraints at the commit level. Constraints should be stored in Leaves (POST /v1/leaves)."
  }
}
```

> If you see these errors, V4-only validation is working correctly.

---

## Step 4: Create a Leaf

In V4 architecture, constraints are stored in Leaves (application layer), not in commits.

**API:**
```bash
curl -X POST http://localhost:8000/v1/leaves \
  -H "Content-Type: application/json" \
  -d '{
    "commit_hash": "'$COMMIT_HASH'",
    "type": "deploy_agent",
    "title": "User Profile System Prompt",
    "project_id": "'$PROJECT_ID'",
    "constraints": [
      {
        "type": "require",
        "match_mode": "semantic",
        "value": "dark mode preference"
      },
      {
        "type": "require",
        "match_mode": "semantic",
        "value": "bilingual support (English and Chinese)"
      },
      {
        "type": "exclude",
        "match_mode": "exact",
        "value": "light mode",
        "reason": "User explicitly prefers dark mode"
      }
    ],
    "config": {
      "prompt_template": "You are a helpful assistant. User preferences: {{sentences}}"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "leaf_xxxxxxxxx",
    "commit_hash": "sha256:abc...",
    "type": "deploy_agent",
    "title": "User Profile System Prompt",
    "constraints": [
      {"id": "cst_xxx1", "type": "require", "match_mode": "semantic", "value": "dark mode preference"},
      {"id": "cst_xxx2", "type": "require", "match_mode": "semantic", "value": "bilingual support (English and Chinese)"},
      {"id": "cst_xxx3", "type": "exclude", "match_mode": "exact", "value": "light mode", "reason": "User explicitly prefers dark mode"}
    ],
    "config": {"prompt_template": "..."},
    "output": null,
    "generated_at": null,
    "assertions": null,
    "project_id": "proj_...",
    "created_at": "2024-...",
    "created_by": null
  }
}
```

**Save the leaf_id:**
```bash
export LEAF_ID="leaf_xxxxxxxxx"
```

**Supported Leaf Types:**
- `deploy_agent` - Agent deployment configuration
- `tweet` - Twitter post
- `weibo` - Weibo post
- `wechat` - WeChat message
- `email` - Email content
- `article` - Article/blog post
- `slack` - Slack message
- `eval` - Evaluation configuration

**WebUI Verification:**
1. From commit detail, click "Create Leaf" button (if available)
2. Or navigate to the leaf via API response ID
3. Verify constraints display with correct types (require/exclude)
4. Verify config is saved

---

## Step 5: Pin the Leaf

Pins mark items as selected for commit sources and conversation context.

**API:**
```bash
curl -X POST http://localhost:8000/v1/projects/$PROJECT_ID/pins \
  -H "Content-Type: application/json" \
  -d '{
    "type": "leaf",
    "ref_id": "'$LEAF_ID'"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "pin_xxxxxxxxx",
    "project_id": "proj_...",
    "type": "leaf",
    "ref_id": "leaf_...",
    "selected_assertion_ids": null,
    "pinned_at": "2024-...",
    "pinned_by": null
  }
}
```

**Save the pin_id:**
```bash
export PIN_ID="pin_xxxxxxxxx"
```

**Verify duplicate prevention:**
```bash
curl -X POST http://localhost:8000/v1/projects/$PROJECT_ID/pins \
  -H "Content-Type: application/json" \
  -d '{
    "type": "leaf",
    "ref_id": "'$LEAF_ID'"
  }'
```

**Expected Response (409 error):**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_PIN",
    "message": "Pin already exists for this item in project proj_..."
  }
}
```

> If you see the duplicate error, the pin system is working correctly.

**WebUI Verification:**
1. In leaf detail page, pin status should show "Pinned"
2. Pin/Unpin toggle should work (if implemented)
3. Navigate to project pins list to see all pinned items

---

## Step 6: List and Verify Data

Verify all CRUD operations are working correctly.

### 6.1 List Commits by Project

**API:**
```bash
curl "http://localhost:8000/v1/projects/$PROJECT_ID/commits-v4"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "hash": "sha256:abc...",
      "schema": "t3x/commit/v4",
      "message": "Initial user preferences commit",
      "branch": "main",
      ...
    }
  ]
}
```

### 6.2 List Leaves by Project

**API:**
```bash
curl "http://localhost:8000/v1/projects/$PROJECT_ID/leaves"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "leaf_...",
      "type": "deploy_agent",
      "title": "User Profile System Prompt",
      ...
    }
  ]
}
```

### 6.3 List Leaves by Commit

**API:**
```bash
curl "http://localhost:8000/v1/commits/$COMMIT_HASH/leaves"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "leaf_...",
      "commit_hash": "sha256:abc...",
      ...
    }
  ]
}
```

### 6.4 List Pins by Project

**API:**
```bash
curl "http://localhost:8000/v1/projects/$PROJECT_ID/pins"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pin_...",
      "type": "leaf",
      "ref_id": "leaf_...",
      ...
    }
  ]
}
```

### 6.5 Get Individual Resources

**Get Commit by Hash:**
```bash
curl "http://localhost:8000/v1/commits-v4/$COMMIT_HASH"
```

**Get Leaf by ID:**
```bash
curl "http://localhost:8000/v1/leaves/$LEAF_ID"
```

**Get Pin by ID:**
```bash
curl "http://localhost:8000/v1/pins/$PIN_ID"
```

> All GET requests should return `{"success": true, "data": {...}}` with the corresponding resource.

---

## Step 7: Cleanup

### 7.1 Delete Resources (Optional)

**Delete Pin:**
```bash
curl -X DELETE "http://localhost:8000/v1/pins/$PIN_ID"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "pin_..."
  }
}
```

**Delete Leaf (also removes associated pins automatically):**
```bash
curl -X DELETE "http://localhost:8000/v1/leaves/$LEAF_ID"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "leaf_..."
  }
}
```

**Delete Commit:**
```bash
curl -X DELETE "http://localhost:8000/v1/commits-v4/$COMMIT_HASH"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "hash": "sha256:..."
  }
}
```

### 7.2 Clear Environment Variables

```bash
unset PROJECT_ID COMMIT_HASH LEAF_ID PIN_ID
```

---

## Troubleshooting

### "Connection refused" errors
- Check if services are running (`pnpm dev:webui`, `pnpm dev:api`)
- Check ports 3000 and 8000 are not in use
- Try restarting the services

### "Project not found" errors
- Verify PROJECT_ID is set correctly: `echo $PROJECT_ID`
- Project may have been deleted - create a new one

### "Commit not found" errors
- Verify COMMIT_HASH is set correctly: `echo $COMMIT_HASH`
- URL-encode the hash if it contains special characters

### "INVALID_REQUEST" errors
- Check the request body format matches the expected schema
- Ensure all required fields are provided
- For V4 commits: `sentences`, `author.type`, and `project_id` are required

### WebUI shows stale data
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear local storage if using state persistence
- Check browser console for errors

### Tests fail but API works manually
- Run `pnpm db:reset` to reset test database
- Check for orphaned test data
- Ensure you're hitting the correct port (8000 for API)

---

## Summary Checklist

After completing this runbook, you should have verified:

- [ ] Project creation works
- [ ] V4 commit creation with sentences works
- [ ] V3 payloads are rejected with `COMMIT_VERSION_UNSUPPORTED`
- [ ] Constraints at commit level are rejected with `INVALID_REQUEST`
- [ ] Leaf creation with constraints works
- [ ] Pin creation works
- [ ] Duplicate pins are rejected with `DUPLICATE_PIN`
- [ ] List operations (commits, leaves, pins) work
- [ ] Get by ID operations work
- [ ] Delete operations work
- [ ] Leaf deletion cleans up associated pins

> **Congratulations!** If all checks pass, the V4 E2E flow is working correctly.
