# V4 E2E Run-Through Acceptance Criteria

> **Status**: Active
> **Created**: 2026-01-23
> **Phase**: V4 E2E Run-Through

---

## Hard Requirements (Must Pass)

### API Layer Tests

- [ ] `pnpm test:storage` - All tests pass (currently 326 tests)
- [ ] `pnpm test --filter @t3x/api` - All V4-related tests pass
- [ ] V3 payload submitted to V4 endpoint returns clear error (COMMIT_VERSION_UNSUPPORTED)

### Commit Flow

- [ ] `POST /v1/commits-v4` - Creates successfully, returns hash
- [ ] `GET /v1/commits-v4/:hash` - Returns complete commit with all fields
- [ ] `GET /v1/projects/:id/commits-v4` - Returns list with correct pagination
- [ ] Branch HEAD automatically updates after commit creation
- [ ] `source_refs` stored and returned correctly

### Leaf Flow

- [ ] `POST /v1/leaves` - Creates leaf, associates with commit
- [ ] `GET /v1/leaves/:id` - Returns complete leaf with constraints
- [ ] `PATCH /v1/leaves/:id` - Updates constraints correctly
- [ ] `DELETE /v1/leaves/:id` - Soft deletes successfully
- [ ] Constraint IDs auto-generated with `cst_` prefix
- [ ] Assertion IDs auto-generated with `ast_` prefix

### Pin Flow

- [ ] `POST /v1/projects/:id/pins` - Pins conversation/leaf
- [ ] `GET /v1/projects/:id/pins` - Returns list correctly
- [ ] `DELETE /v1/pins/:id` - Unpins successfully
- [ ] Duplicate pin attempt returns 409 DUPLICATE_PIN
- [ ] `selected_assertion_ids` stored and filtered correctly

### Context Flow

- [ ] `GET /v1/conversations/:id/memory` - Returns BuiltContext
- [ ] `PUT /v1/conversations/:id/context` - Sets custom context selection
- [ ] Context includes commit sentences + pinned items
- [ ] `GET /v1/conversations/:id/context-export` - Exports JSON/Markdown

### WebUI Flow

- [ ] Open Project → V4 commits display (no crashes, no console errors)
- [ ] Click Commit → Detail view shows (sentences, source_refs)
- [ ] Commit detail shows "Constraints are in Leaves" notice
- [ ] Create Leaf → Dialog opens with type selection
- [ ] Create Leaf → Successfully redirects to leaf detail page
- [ ] Leaf detail page shows constraints and assertions
- [ ] Pin/Unpin buttons work correctly
- [ ] Context Panel displays in conversation page
- [ ] Edit Context dialog allows pin selection
- [ ] Export button downloads file

### Downstream Action

- [ ] Export Context Packet (JSON) works
- [ ] Export Context Packet (Markdown) works
- [ ] Copy to clipboard works

---

## Error Code Specifications (Must Be Consistent)

| Scenario | HTTP Status | Error Code | Message Example |
|----------|-------------|------------|-----------------|
| V3 payload to V4 endpoint | 400 | `COMMIT_VERSION_UNSUPPORTED` | Only V4 commits supported. Received: t3x/commit/v3 |
| Missing required field | 400 | `INVALID_REQUEST` | Missing required field: sentences |
| Empty sentences array | 400 | `INVALID_REQUEST` | sentences must contain at least one sentence |
| Invalid schema version | 400 | `COMMIT_VERSION_UNSUPPORTED` | Only V4 commits supported on this endpoint |
| Commit not found | 404 | `COMMIT_NOT_FOUND` | Commit not found: sha256:xxx |
| Project not found | 404 | `PROJECT_NOT_FOUND` | Project not found: proj_xxx |
| Leaf not found | 404 | `LEAF_NOT_FOUND` | Leaf not found: leaf_xxx |
| Conversation not found | 404 | `CONVERSATION_NOT_FOUND` | Conversation not found: conv_xxx |
| Pin not found | 404 | `PIN_NOT_FOUND` | Pin not found: pin_xxx |
| Duplicate pin | 409 | `DUPLICATE_PIN` | Item already pinned |
| Hash conflict | 409 | `HASH_CONFLICT` | Commit hash already exists |
| Server error | 500 | `INTERNAL_ERROR` | Unexpected error occurred |
| Database error | 500 | `DATABASE_ERROR` | Database operation failed |

---

## Response Format Specification

### Success Response

```json
{
  "success": true,
  "data": {
    // response payload
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      // optional additional context
    }
  }
}
```

---

## V4 Commit Schema Reference

> **IMPORTANT**: This schema must match `packages/core/src/types/v4/index.ts` (single source of truth)

```typescript
interface CommitV4 {
  // First-class fields (included in hash)
  hash: string;                    // sha256:...
  schema: 't3x/commit/v4';
  parents: string[];               // Parent commit hashes
  author: {
    type: 'human' | 'agent';       // Author type
    id?: string;                   // Optional author ID
    name?: string;                 // Optional display name
  };
  committed_at: string;            // ISO8601
  content: {
    sentences: Array<{
      id: string;                  // s_xxx (prefix: s_)
      text: string;
      confidence?: number;         // 0-1 extraction confidence
      source_ref?: {
        conversation_id: string;
        turn_hash: string;
      };
    }>;
  };

  // Second-class fields (NOT in hash)
  project_id?: string;
  message?: string;
  branch?: string;
  position_x?: number;
  position_y?: number;
  source_refs?: Array<{
    type: 'conversation' | 'leaf';
    id: string;
    title?: string;
    assertion_lessons?: string[];  // For leaf sources
  }>;
  created_at?: string;
}
```

---

## Leaf Schema Reference

> **IMPORTANT**: This schema must match `packages/core/src/types/v4/index.ts` (single source of truth)

```typescript
type LeafType = 'deploy_agent' | 'tweet' | 'weibo' | 'wechat' | 'email' | 'article' | 'slack' | 'eval';

interface Leaf {
  id: string;                      // leaf_xxx (prefix: leaf_)
  commit_hash: string;
  type: LeafType;
  title?: string;
  project_id: string;
  constraints: Array<Constraint>;  // See Constraint type below
  config: {
    prompt_template?: string;
    model?: string;
    max_tokens?: number;
    [key: string]: unknown;
  };
  output?: string;
  generated_at?: string;
  assertions?: Array<Assertion>;   // See Assertion type below
  created_at: string;
  created_by?: string;
}

// Constraint types (owned by Leaf, NOT Commit)
type Constraint = RequireConstraint | ExcludeConstraint;

interface RequireConstraint {
  id: string;                      // cst_xxx (prefix: cst_)
  type: 'require';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  source_sentence_id?: string;
}

interface ExcludeConstraint {
  id: string;                      // cst_xxx (prefix: cst_)
  type: 'exclude';
  match_mode: 'exact' | 'semantic';
  value: string;
  description?: string;
  reason?: string;                 // Why excluded (policy/compliance)
}

// Assertion = Validation result
interface Assertion {
  id: string;                      // ast_xxx (prefix: ast_)
  constraint_id: string;           // Which constraint was checked
  passed: boolean;                 // Did the output pass?
  details: string;                 // What was found/not found
  lesson?: string;                 // Human-readable feedback
}
```

---

## Pin Schema Reference

> **IMPORTANT**: This schema must match `packages/core/src/types/v4/index.ts` (single source of truth)

```typescript
type PinType = 'conversation' | 'leaf';

interface Pin {
  id: string;                      // pin_xxx (prefix: pin_)
  project_id: string;
  type: PinType;
  ref_id: string;                  // conversation_id or leaf_id
  selected_assertion_ids?: string[] | null; // For leaf pins (null = all)
  pinned_at: string;               // ISO8601
  pinned_by?: string;
}
```

---

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Backend Developer | | | [ ] |
| Frontend Developer | | | [ ] |
| Coordinator | | | [ ] |
