# V4 E2E Run-Through Issues (Run-Through Phase)

> **Status**: Phase 2 - E2E Run-Through
> **Goal**: Complete end-to-end flow from a new user's perspective, system "V4-only"
> **Prerequisite**: Track A (Storage/Core) + Track B (API/WebUI) completed

---

## Milestone Definition

**Objective**: Complete, usable end-to-end flow from user's perspective:
```
Create Project → Create Conversation → Create V4 Commit → Create Leaf → Pin Resource →
View Context → Export Context Packet (minimum downstream action)
```

**Acceptance Definition**:
- V4 commits can be created, read, and displayed correctly
- Leaves can be created, constraints can be edited, and Pins work
- Context can be customized, previewed, and exported
- All API tests pass
- Manual E2E flow can be reproduced

---

## Parallel Development Compatibility Strategy

### Critical Preparation Before Starting

To prevent conflicts when two developers work in parallel, the following preparations **MUST** be completed before development begins:

#### 1. Contract Freeze Agreement

The following files are **frozen** during parallel development. Any changes require both developers to synchronize:

| File | Purpose | Owner |
|------|---------|-------|
| `packages/core/src/types/v4/index.ts` | TypeScript types | Shared (frozen) |
| `packages/storage/src/schema-v4.ts` | Database schema | Shared (frozen) |
| `apps/api/src/schemas/v4-contracts.ts` | API contracts | Shared (frozen) |

**Rule**: If a contract change is needed:
1. Developer identifies the need
2. Creates a discussion issue or Slack thread
3. Both developers agree on the change
4. One developer makes the change in a dedicated PR
5. Other developer rebases immediately after merge

#### 2. File Ownership Matrix

| File/Directory | Track A (Backend) | Track B (Frontend) |
|----------------|-------------------|-------------------|
| `apps/api/src/routes/*.openapi.ts` | ✅ Primary | ❌ Read-only |
| `apps/api/src/__tests__/*.test.ts` | ✅ Primary | ❌ Read-only |
| `apps/api/src/lib/errors.ts` | ✅ Primary | ❌ Read-only |
| `apps/web/src/components/**` | ❌ Read-only | ✅ Primary |
| `apps/web/src/store/**` | ❌ Read-only | ✅ Primary |
| `apps/web/src/lib/api.ts` | ⚠️ Types only | ✅ Primary |
| `packages/storage/src/queries/*.ts` | ✅ Primary | ❌ Do not touch |
| `docs/plans/*.md` | ⚠️ Coordinator | ⚠️ Coordinator |

#### 3. Communication Protocol

**Daily Sync** (5 minutes):
- What I finished yesterday
- What I'm working on today
- Any blockers or contract changes needed

**Before Touching Shared Files**:
1. Announce in team channel
2. Wait for acknowledgment
3. Make change quickly
4. Notify when PR is merged

#### 4. Branch Strategy

```
main
 └── feat/v4-e2e-runthrough (integration branch)
      ├── feat/v4-e2e-track-a (Backend developer)
      └── feat/v4-e2e-track-b (Frontend developer)
```

**Rules**:
- Each track has its own feature branch
- PR to `feat/v4-e2e-runthrough` (not directly to main)
- Integration branch owner (coordinator) merges both tracks
- Rebase from integration branch at least once per day

#### 5. API Mock Contract

Before parallel development starts, create a mock server or static contract file that both tracks can reference:

```typescript
// docs/contracts/v4-api-mock.ts
// This file defines the exact API shapes both tracks must adhere to

export const API_CONTRACTS = {
  'POST /v1/commits-v4': {
    request: {
      project_id: 'string',
      branch: 'string',
      message: 'string?',
      sentences: [{ id: 'string', text: 'string' }],
      author: { name: 'string', identity: 'string' },
    },
    response: {
      success: true,
      data: {
        hash: 'sha256:...',
        schema: 't3x/commit/v4',
        // ... full shape
      },
    },
    errorCodes: ['COMMIT_VERSION_UNSUPPORTED', 'INVALID_REQUEST', 'PROJECT_NOT_FOUND'],
  },
  // ... other endpoints
};
```

#### 6. Integration Checkpoints

| Checkpoint | When | What to Verify |
|------------|------|----------------|
| CP1 | After G1 | Both tracks agree on acceptance criteria |
| CP2 | After A1+B2 | API types match frontend expectations |
| CP3 | After A2+B1 | Error handling works end-to-end |
| CP4 | After all 2.2 issues | Full integration test |

---

## Dependency Graph and Parallel Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Phase 2.1: Validation and Setup (Gate Issues)                              │
│  ─────────────────────────────────────────────                              │
│                                                                             │
│    G1 (Acceptance Checklist) ────────────────────────────────────────────┐  │
│                                                                          │  │
│    G2 (Contract Freeze + Branch Setup) ◄─────────────────────────────────┤  │
│                                                                          │  │
│  Phase 2.2: Parallel Development                                         │  │
│  ───────────────────────────────                                         │  │
│                                                                          │  │
│    [Track A - Backend] ◄─────────────────────┬─────► [Track B - Frontend]│  │
│         │                                    │            │              │  │
│    A1 (API Test Coverage)                    │     B1 (Context Page)     │  │
│         │                                    │            │              │  │
│    A2 (Error Response Standardization)       │     B2 (Commit List/Detail)│ │
│         │                                    │            │              │  │
│    A3 (V4-only Validation)                   │     B3 (Leaf Creation)    │  │
│         │                                    │            │              │  │
│         └──────────────────────┬─────────────┴────────────┘              │  │
│                                │                                         │  │
│  Phase 2.3: Integration and Wrap-up                                      │  │
│  ──────────────────────────────────                                      │  │
│                               ▼                                          │  │
│    I1 (E2E Runbook) ◄────────┘                                           │  │
│         │                                                                │  │
│    I2 (Downstream Action: Context Export)                                │  │
│         │                                                                │  │
│    I3 (WebUI E2E Acceptance Tests)                                       │  │
│                                                                          │  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Parallel Assignment**:
- **Developer A (Backend)**: G1 (collaborate) + A1 + A2 + A3
- **Developer B (Frontend)**: G1 (collaborate) + B1 + B2 + B3
- **Coordinator**: G2 + I1 + I2 + I3 (after both tracks complete)

---

## Phase 2.1: Gate Issues (Highest Priority)

### Issue G1: Define "V4 Run-Through" Acceptance Checklist

**Priority**: P0 (Gate)
**Estimated Effort**: 30 minutes
**Owner**: Coordinator (with input from both developers)

#### Problem Statement

Without a clear, written acceptance criteria, developers may have different interpretations of "done." This leads to:
- Features that work in isolation but fail when integrated
- Inconsistent error handling between API and UI
- Missing edge cases that cause bugs in production

#### Description

Define the hard acceptance criteria for the run-through phase. This document serves as the single source of truth for all subsequent issues and will be used to verify completion.

#### Detailed Requirements

**1. Create the acceptance criteria file**

Create file `docs/plans/v4-e2e-acceptance.md` with the following sections:

```markdown
# V4 E2E Run-Through Acceptance Criteria

## Hard Requirements (Must Pass)

### API Layer Tests
- [ ] `pnpm test:storage` - All tests pass (currently 326 tests)
- [ ] `pnpm test --filter @t3x/api` - All V4-related tests pass
- [ ] V3 payload submitted to V4 endpoint returns clear error (COMMIT_VERSION_UNSUPPORTED)

### Commit Flow
- [ ] POST /v1/commits-v4 - Creates successfully, returns hash
- [ ] GET /v1/commits-v4/:hash - Returns complete commit with all fields
- [ ] GET /v1/projects/:id/commits-v4 - Returns list with correct pagination
- [ ] Branch HEAD automatically updates after commit creation

### Leaf Flow
- [ ] POST /v1/leaves - Creates leaf, associates with commit
- [ ] GET /v1/leaves/:id - Returns complete leaf with constraints
- [ ] PATCH /v1/leaves/:id - Updates constraints correctly
- [ ] DELETE /v1/leaves/:id - Soft deletes successfully
- [ ] Constraint IDs auto-generated with cst_ prefix
- [ ] Assertion IDs auto-generated with ast_ prefix

### Pin Flow
- [ ] POST /v1/projects/:id/pins - Pins conversation/leaf
- [ ] GET /v1/projects/:id/pins - Returns list correctly
- [ ] DELETE /v1/pins/:id - Unpins successfully
- [ ] Duplicate pin attempt returns 409 DUPLICATE_PIN

### Context Flow
- [ ] GET /v1/conversations/:id/memory - Returns BuiltContext
- [ ] PUT /v1/conversations/:id/context - Sets custom context selection
- [ ] Context includes commit sentences + pinned items

### WebUI Flow
- [ ] Open Project → V4 commits display (no crashes)
- [ ] Click Commit → Detail view shows (sentences, source_refs)
- [ ] Create Leaf → Successfully redirects
- [ ] Leaf detail page shows constraints
- [ ] Pin/Unpin buttons work correctly
- [ ] Context Panel displays correctly

### Downstream Action
- [ ] Export Context Packet (JSON/Markdown) works

## Error Code Specifications (Must Be Consistent)

| Scenario | HTTP Status | Error Code | Message Example |
|----------|-------------|------------|-----------------|
| V3 payload to V4 endpoint | 400 | COMMIT_VERSION_UNSUPPORTED | Only V4 commits supported. Received: t3x/commit/v3 |
| Missing required field | 400 | INVALID_REQUEST | Missing required field: sentences |
| Commit not found | 404 | COMMIT_NOT_FOUND | Commit not found: sha256:xxx |
| Project not found | 404 | PROJECT_NOT_FOUND | Project not found: proj_xxx |
| Leaf not found | 404 | LEAF_NOT_FOUND | Leaf not found: leaf_xxx |
| Duplicate pin | 409 | DUPLICATE_PIN | Item already pinned |
| Server error | 500 | INTERNAL_ERROR | Unexpected error occurred |

## Response Format Specification

All API responses must follow this exact format:

**Success Response:**
```json
{
  "success": true,
  "data": { /* response payload */ }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { /* optional additional context */ }
  }
}
```
```

**2. Review with both developers**

- Schedule 15-minute sync to review criteria
- Ensure both developers understand expectations
- Resolve any ambiguities immediately

#### Deliverables

- [ ] `docs/plans/v4-e2e-acceptance.md` created
- [ ] Both developers have reviewed and approved
- [ ] No ambiguous acceptance criteria

#### Acceptance Criteria

- [ ] Acceptance checklist covers all major flows
- [ ] Error code list is complete
- [ ] Can be used as a Runbook foundation
- [ ] Both developers signed off

---

### Issue G2: Establish Contract Freeze and Branch Structure

**Priority**: P0 (Gate)
**Estimated Effort**: 30 minutes
**Owner**: Coordinator
**Prerequisites**: G1 completed

#### Problem Statement

Without explicit branch structure and contract freeze rules, parallel development will result in:
- Merge conflicts in shared files
- Breaking API changes mid-development
- Wasted time resolving integration issues

#### Description

Set up the development infrastructure for parallel work:
1. Create the integration branch
2. Document frozen files
3. Set up branch protection rules
4. Create initial API contract documentation

#### Detailed Tasks

**1. Create branch structure**

```bash
# From main branch
git checkout main
git pull origin main
git checkout -b feat/v4-e2e-runthrough

# Push integration branch
git push -u origin feat/v4-e2e-runthrough

# Developer A creates their branch
git checkout -b feat/v4-e2e-track-a
git push -u origin feat/v4-e2e-track-a

# Developer B creates their branch
git checkout -b feat/v4-e2e-track-b
git push -u origin feat/v4-e2e-track-b
```

**2. Document frozen contracts**

Create `docs/plans/v4-contract-freeze.md`:

```markdown
# V4 Contract Freeze Notice

**Effective**: [Date]
**Duration**: Until V4 E2E Run-Through complete

## Frozen Files

The following files are FROZEN. Any changes require:
1. Discussion in #t3x-dev channel
2. Both developers acknowledge the change
3. Single PR to modify (not parallel changes)

### Type Definitions (packages/core)
- `packages/core/src/types/v4/index.ts`
- `packages/core/src/types/v4/commit.ts`
- `packages/core/src/types/v4/leaf.ts`
- `packages/core/src/types/v4/pin.ts`

### Database Schema (packages/storage)
- `packages/storage/src/schema-v4.ts`

### API Contracts (apps/api)
- `apps/api/src/schemas/v4-contracts.ts`

## How to Request a Contract Change

1. Create issue titled: "Contract Change Request: [brief description]"
2. Label: `contract-change`, `v4`
3. Include:
   - Current behavior
   - Proposed change
   - Impact on both tracks
4. Wait for both developers to approve before implementing
```

**3. Create API contract snapshot**

Create `docs/contracts/v4-api-snapshot.md` with current API shapes for reference.

#### Deliverables

- [ ] Integration branch created and pushed
- [ ] Track branches created for both developers
- [ ] `docs/plans/v4-contract-freeze.md` created
- [ ] `docs/contracts/v4-api-snapshot.md` created
- [ ] Both developers acknowledged freeze rules

#### Acceptance Criteria

- [ ] Branch structure matches the diagram
- [ ] Frozen files are clearly documented
- [ ] Both developers can start work on their track branches

---

## Phase 2.2A: Track A Issues (Backend)

### Issue A1: Complete V4 API Test Coverage

**Priority**: P0
**Estimated Effort**: 2-3 hours
**Owner**: Backend Developer
**Files to Modify**:
- `apps/api/src/__tests__/commits-v4.test.ts` (additions)
- `apps/api/src/__tests__/leaves.test.ts` (additions)
- `apps/api/src/__tests__/pins.test.ts` (additions)

#### Problem Statement

Current API tests may not cover all edge cases defined in the acceptance criteria (G1). Specifically:
- V3 rejection is not tested
- Branch HEAD update behavior is not verified
- Constraint/Assertion ID generation is not tested
- Duplicate pin handling is not tested

Without comprehensive tests, bugs may slip through and cause integration failures.

#### Description

Add comprehensive test coverage for all V4 API endpoints, ensuring every acceptance criterion from G1 has a corresponding test.

#### Background Context

- Current test framework: Vitest
- Test database: PGLite (isolated per test file)
- Test pattern: See existing tests in `apps/api/src/__tests__/`
- Run tests with: `pnpm test --filter @t3x/api`

#### Detailed Tasks

**Task 1: Enhance commits-v4.test.ts**

Add the following test cases:

```typescript
// apps/api/src/__tests__/commits-v4.test.ts

describe('V4-only validation', () => {
  it('rejects V3 commit payload with COMMIT_VERSION_UNSUPPORTED error', async () => {
    // Setup: Create a valid project first
    const project = await createTestProject(mockDB);

    const v3Payload = {
      schema: 't3x/commit/v3',
      project_id: project.project_id,
      branch: 'main',
      turn_window: { start_turn_hash: 'sha256:abc', end_turn_hash: 'sha256:def' },
      facet_snapshot: [],
    };

    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v3Payload),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('COMMIT_VERSION_UNSUPPORTED');
    expect(data.error.message).toContain('Only V4 commits supported');
  });

  it('rejects payload with schema field set to non-V4 value', async () => {
    const project = await createTestProject(mockDB);

    const payload = {
      schema: 't3x/commit/v5', // Future version
      project_id: project.project_id,
      sentences: [{ id: 's_1', text: 'Test' }],
      author: { name: 'test', identity: 'test@example.com' },
    };

    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('COMMIT_VERSION_UNSUPPORTED');
  });

  it('returns INVALID_REQUEST when sentences field is missing', async () => {
    const project = await createTestProject(mockDB);

    const payload = {
      project_id: project.project_id,
      branch: 'main',
      author: { name: 'test', identity: 'test@example.com' },
      // sentences missing
    };

    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
    expect(data.error.message).toContain('sentences');
  });

  it('returns INVALID_REQUEST when sentences array is empty', async () => {
    const project = await createTestProject(mockDB);

    const payload = {
      project_id: project.project_id,
      sentences: [], // Empty array
      author: { name: 'test', identity: 'test@example.com' },
    };

    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_REQUEST');
    expect(data.error.message).toContain('at least one sentence');
  });
});

describe('Branch HEAD management', () => {
  it('automatically updates branch HEAD after creating first commit', async () => {
    const project = await createTestProject(mockDB);

    // Create commit
    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.project_id,
        branch: 'main',
        sentences: [{ id: 's_1', text: 'Test sentence' }],
        author: { name: 'test', identity: 'test@example.com' },
      }),
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();

    // Verify branch HEAD
    const branch = await findBranchByName(mockDB, project.project_id, 'main');
    expect(branch).not.toBeNull();
    expect(branch?.head_commit_hash).toBe(data.hash);
  });

  it('updates branch HEAD after creating subsequent commits', async () => {
    const project = await createTestProject(mockDB);

    // Create first commit
    const res1 = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.project_id,
        branch: 'main',
        sentences: [{ id: 's_1', text: 'First commit' }],
        author: { name: 'test', identity: 'test@example.com' },
      }),
    });
    const { data: commit1 } = await res1.json();

    // Create second commit
    const res2 = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.project_id,
        branch: 'main',
        parents: [commit1.hash],
        sentences: [{ id: 's_2', text: 'Second commit' }],
        author: { name: 'test', identity: 'test@example.com' },
      }),
    });
    const { data: commit2 } = await res2.json();

    // Verify branch HEAD is now second commit
    const branch = await findBranchByName(mockDB, project.project_id, 'main');
    expect(branch?.head_commit_hash).toBe(commit2.hash);
  });
});

describe('source_refs handling', () => {
  it('stores and returns source_refs correctly', async () => {
    const project = await createTestProject(mockDB);
    const conversation = await createTestConversation(mockDB, project.project_id);

    const sourceRefs = [
      { type: 'conversation', conversation_id: conversation.conversation_id },
    ];

    const res = await app.request('/v1/commits-v4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.project_id,
        sentences: [{ id: 's_1', text: 'From conversation' }],
        author: { name: 'test', identity: 'test@example.com' },
        source_refs: sourceRefs,
      }),
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.source_refs).toEqual(sourceRefs);

    // Verify via GET
    const getRes = await app.request(`/v1/commits-v4/${data.hash}`);
    const { data: fetched } = await getRes.json();
    expect(fetched.source_refs).toEqual(sourceRefs);
  });
});
```

**Task 2: Enhance leaves.test.ts**

Add the following test cases:

```typescript
// apps/api/src/__tests__/leaves.test.ts

describe('Constraint ID generation', () => {
  it('auto-generates constraint IDs with cst_ prefix when not provided', async () => {
    const { project, commit } = await createTestCommit(mockDB);

    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: commit.hash,
        type: 'system_prompt',
        project_id: project.project_id,
        constraints: [
          { type: 'require', value: 'dark mode', match_mode: 'semantic' },
          { type: 'exclude', value: 'light mode', match_mode: 'exact' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();

    // All constraints should have cst_ prefix
    expect(data.constraints).toHaveLength(2);
    expect(data.constraints[0].id).toMatch(/^cst_/);
    expect(data.constraints[1].id).toMatch(/^cst_/);

    // IDs should be unique
    expect(data.constraints[0].id).not.toBe(data.constraints[1].id);
  });

  it('preserves provided constraint IDs if they have correct prefix', async () => {
    const { project, commit } = await createTestCommit(mockDB);

    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: commit.hash,
        type: 'system_prompt',
        project_id: project.project_id,
        constraints: [
          { id: 'cst_custom123', type: 'require', value: 'test', match_mode: 'semantic' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.constraints[0].id).toBe('cst_custom123');
  });
});

describe('Assertion ID generation', () => {
  it('auto-generates assertion IDs with ast_ prefix when not provided', async () => {
    const { project, commit } = await createTestCommit(mockDB);

    const res = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: commit.hash,
        type: 'system_prompt',
        project_id: project.project_id,
        assertions: [
          { type: 'contains', value: 'hello', description: 'Should greet' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const { data } = await res.json();

    expect(data.assertions).toHaveLength(1);
    expect(data.assertions[0].id).toMatch(/^ast_/);
  });
});

describe('Leaf deletion and pin cleanup', () => {
  it('soft deletes leaf and cleans up associated pins', async () => {
    const { project, commit } = await createTestCommit(mockDB);

    // Create leaf
    const leafRes = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: commit.hash,
        type: 'system_prompt',
        project_id: project.project_id,
      }),
    });
    const { data: leaf } = await leafRes.json();

    // Pin the leaf
    await app.request(`/v1/projects/${project.project_id}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leaf', ref_id: leaf.id }),
    });

    // Verify pin exists
    const pinsBeforeRes = await app.request(`/v1/projects/${project.project_id}/pins`);
    const { data: pinsBefore } = await pinsBeforeRes.json();
    expect(pinsBefore.some((p: any) => p.ref_id === leaf.id)).toBe(true);

    // Delete leaf
    const deleteRes = await app.request(`/v1/leaves/${leaf.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    // Verify pin is removed or inactive
    const pinsAfterRes = await app.request(`/v1/projects/${project.project_id}/pins`);
    const { data: pinsAfter } = await pinsAfterRes.json();
    expect(pinsAfter.some((p: any) => p.ref_id === leaf.id)).toBe(false);
  });
});
```

**Task 3: Enhance pins.test.ts**

Add the following test cases:

```typescript
// apps/api/src/__tests__/pins.test.ts

describe('Duplicate pin prevention', () => {
  it('returns 409 DUPLICATE_PIN when pinning same item twice', async () => {
    const { project, conversation } = await createTestConversation(mockDB);

    // First pin - should succeed
    const res1 = await app.request(`/v1/projects/${project.project_id}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation',
        ref_id: conversation.conversation_id,
      }),
    });
    expect(res1.status).toBe(201);

    // Second pin - should fail
    const res2 = await app.request(`/v1/projects/${project.project_id}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation',
        ref_id: conversation.conversation_id,
      }),
    });
    expect(res2.status).toBe(409);
    const data = await res2.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('DUPLICATE_PIN');
  });

  it('allows pinning same item with different selected_assertion_ids', async () => {
    // This test depends on whether we allow multiple pins of same item
    // with different selections. Skip if not applicable.
  });
});

describe('selected_assertion_ids filtering', () => {
  it('stores and returns selected_assertion_ids correctly', async () => {
    const { project, commit } = await createTestCommit(mockDB);

    // Create leaf with assertions
    const leafRes = await app.request('/v1/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commit_hash: commit.hash,
        type: 'system_prompt',
        project_id: project.project_id,
        assertions: [
          { id: 'ast_1', type: 'contains', value: 'hello' },
          { id: 'ast_2', type: 'contains', value: 'world' },
        ],
      }),
    });
    const { data: leaf } = await leafRes.json();

    // Pin with selected assertions
    const pinRes = await app.request(`/v1/projects/${project.project_id}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'leaf',
        ref_id: leaf.id,
        selected_assertion_ids: ['ast_1'], // Only first assertion
      }),
    });
    expect(pinRes.status).toBe(201);
    const { data: pin } = await pinRes.json();

    expect(pin.selected_assertion_ids).toEqual(['ast_1']);

    // Verify via list
    const listRes = await app.request(`/v1/projects/${project.project_id}/pins`);
    const { data: pins } = await listRes.json();
    const foundPin = pins.find((p: any) => p.ref_id === leaf.id);
    expect(foundPin.selected_assertion_ids).toEqual(['ast_1']);
  });
});
```

#### Acceptance Criteria

- [ ] All new tests pass: `pnpm test --filter @t3x/api`
- [ ] Test coverage matches all G1 API layer acceptance points
- [ ] No regressions in existing tests
- [ ] Tests are isolated and don't depend on external state

---

### Issue A2: Standardize Error Responses

**Priority**: P1
**Estimated Effort**: 1-2 hours
**Owner**: Backend Developer
**Files to Modify**:
- `apps/api/src/lib/errors.ts` (new file)
- `apps/api/src/routes/commits-v4.openapi.ts`
- `apps/api/src/routes/leaves.openapi.ts`
- `apps/api/src/routes/pins.openapi.ts`

#### Problem Statement

Inconsistent error response formats between endpoints make frontend error handling fragile:
- Some endpoints return `{ error: "message" }`
- Some return `{ success: false, message: "..." }`
- Error codes are not machine-readable

This causes:
- Frontend developers must handle multiple formats
- User-facing error messages are inconsistent
- Debugging is harder without standardized codes

#### Description

Create a centralized error handling system that ensures all V4 API endpoints return errors in a consistent, machine-readable format.

#### Detailed Tasks

**Task 1: Create error utilities**

Create `apps/api/src/lib/errors.ts`:

```typescript
/**
 * Standardized error codes for V4 API
 *
 * Convention:
 * - Use SCREAMING_SNAKE_CASE
 * - Be specific about the error type
 * - Include entity name when relevant (e.g., PROJECT_NOT_FOUND, not just NOT_FOUND)
 */
export const ErrorCodes = {
  // Version errors
  COMMIT_VERSION_UNSUPPORTED: 'COMMIT_VERSION_UNSUPPORTED',

  // Validation errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Not found errors
  NOT_FOUND: 'NOT_FOUND',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  COMMIT_NOT_FOUND: 'COMMIT_NOT_FOUND',
  LEAF_NOT_FOUND: 'LEAF_NOT_FOUND',
  PIN_NOT_FOUND: 'PIN_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',

  // Conflict errors
  DUPLICATE_PIN: 'DUPLICATE_PIN',
  HASH_CONFLICT: 'HASH_CONFLICT',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Create a standardized error response
 *
 * @param code - Machine-readable error code from ErrorCodes
 * @param message - Human-readable error message
 * @param details - Optional additional context (field errors, etc.)
 * @returns Standardized error response object
 *
 * @example
 * return c.json(createError('INVALID_REQUEST', 'Missing required field: sentences'), 400);
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return {
    success: false,
    error: {
      code: ErrorCodes[code],
      message,
      ...(details && { details }),
    },
  };
}

/**
 * HTTP status codes for each error type
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  COMMIT_VERSION_UNSUPPORTED: 400,
  INVALID_REQUEST: 400,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  COMMIT_NOT_FOUND: 404,
  LEAF_NOT_FOUND: 404,
  PIN_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  DUPLICATE_PIN: 409,
  HASH_CONFLICT: 409,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
};

/**
 * Helper to return error with correct status code
 *
 * @example
 * return errorResponse(c, 'PROJECT_NOT_FOUND', `Project not found: ${projectId}`);
 */
export function errorResponse(
  c: Context,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return c.json(createError(code, message, details), ErrorStatusCodes[code]);
}
```

**Task 2: Update commits-v4.openapi.ts**

Replace ad-hoc error handling with standardized functions:

```typescript
import { createError, errorResponse, ErrorCodes } from '../lib/errors';

// In route handler:
app.post('/', async (c) => {
  const body = await c.req.json();

  // V4-only validation
  if (body.schema && body.schema !== 't3x/commit/v4') {
    return errorResponse(
      c,
      'COMMIT_VERSION_UNSUPPORTED',
      `Only V4 commits supported. Received: ${body.schema}`
    );
  }

  // Required field validation
  if (!body.sentences || !Array.isArray(body.sentences)) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'Missing required field: sentences (must be an array)'
    );
  }

  if (body.sentences.length === 0) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'sentences must contain at least one sentence'
    );
  }

  // Project existence check
  const project = await findProjectById(db, body.project_id);
  if (!project) {
    return errorResponse(
      c,
      'PROJECT_NOT_FOUND',
      `Project not found: ${body.project_id}`
    );
  }

  // ... rest of handler
});
```

**Task 3: Update leaves.openapi.ts**

Apply same pattern:

```typescript
import { createError, errorResponse } from '../lib/errors';

app.get('/:id', async (c) => {
  const leafId = c.req.param('id');
  const leaf = await findLeafById(db, leafId);

  if (!leaf) {
    return errorResponse(c, 'LEAF_NOT_FOUND', `Leaf not found: ${leafId}`);
  }

  return c.json({ success: true, data: leaf });
});
```

**Task 4: Update pins.openapi.ts**

Apply same pattern, with special attention to duplicate handling:

```typescript
import { createError, errorResponse } from '../lib/errors';

app.post('/', async (c) => {
  const body = await c.req.json();
  const projectId = c.req.param('projectId');

  // Check for duplicate
  const existingPin = await findPinByRef(db, projectId, body.type, body.ref_id);
  if (existingPin) {
    return errorResponse(
      c,
      'DUPLICATE_PIN',
      `${body.type} ${body.ref_id} is already pinned in this project`
    );
  }

  // ... rest of handler
});
```

**Task 5: Update OpenAPI documentation**

Ensure error responses are documented in the OpenAPI schema:

```typescript
// In each route file's schema definition
const errorResponses = {
  400: {
    description: 'Bad Request',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
              required: ['code', 'message'],
            },
          },
          required: ['success', 'error'],
        },
      },
    },
  },
  404: { /* similar structure */ },
  409: { /* similar structure */ },
  500: { /* similar structure */ },
};
```

#### Acceptance Criteria

- [ ] All V4 API error responses follow the standardized format
- [ ] Error codes are consistent across all endpoints
- [ ] Frontend can display `error.message` directly to users
- [ ] Frontend can use `error.code` for conditional logic
- [ ] OpenAPI documentation includes error response schemas
- [ ] All existing tests still pass

---

### Issue A3: Add V4-only Schema Validation

**Priority**: P1
**Estimated Effort**: 1 hour
**Owner**: Backend Developer
**Files to Modify**:
- `apps/api/src/routes/commits-v4.openapi.ts`

#### Problem Statement

The `/v1/commits-v4` endpoint should explicitly reject V3 or other schema versions to prevent confusion and ensure data integrity. Currently, there may be no explicit check for the `schema` field.

#### Description

Add explicit validation at the API layer to:
1. Reject payloads with V3 schema field
2. Provide clear error messages about version requirements
3. Validate all required V4 fields

#### Detailed Tasks

**Task 1: Add schema version validation**

At the beginning of the POST handler:

```typescript
app.post('/', async (c) => {
  const body = await c.req.json();

  // Schema version check - MUST be first validation
  const providedSchema = body.schema;
  if (providedSchema) {
    // If schema is provided, it must be V4
    if (providedSchema !== 't3x/commit/v4') {
      return errorResponse(
        c,
        'COMMIT_VERSION_UNSUPPORTED',
        `Only V4 commits supported on this endpoint. Received schema: ${providedSchema}. ` +
        `For V3 commits, use /v1/commits (deprecated).`
      );
    }
  }
  // If schema is not provided, we accept and treat as V4

  // ... continue with other validations
});
```

**Task 2: Add comprehensive field validation**

```typescript
// Required fields validation
const requiredFields = ['project_id', 'sentences', 'author'];
const missingFields = requiredFields.filter(f => !(f in body));
if (missingFields.length > 0) {
  return errorResponse(
    c,
    'INVALID_REQUEST',
    `Missing required fields: ${missingFields.join(', ')}`
  );
}

// Sentences validation
if (!Array.isArray(body.sentences)) {
  return errorResponse(
    c,
    'INVALID_REQUEST',
    'sentences must be an array'
  );
}

if (body.sentences.length === 0) {
  return errorResponse(
    c,
    'INVALID_REQUEST',
    'sentences must contain at least one sentence'
  );
}

// Validate each sentence
for (let i = 0; i < body.sentences.length; i++) {
  const sentence = body.sentences[i];
  if (!sentence.text || typeof sentence.text !== 'string') {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      `sentences[${i}].text is required and must be a string`
    );
  }
}

// Author validation
if (!body.author.name || !body.author.identity) {
  return errorResponse(
    c,
    'INVALID_REQUEST',
    'author must have both name and identity fields'
  );
}

// Optional: Validate constraints field is NOT present (V4 doesn't have constraints)
if (body.constraints && Array.isArray(body.constraints) && body.constraints.length > 0) {
  return errorResponse(
    c,
    'COMMIT_VERSION_UNSUPPORTED',
    'V4 commits do not support constraints at the commit level. ' +
    'Constraints should be defined in Leaves instead.'
  );
}
```

**Task 3: Update OpenAPI schema**

Document the V4-specific requirements:

```typescript
const createCommitV4Schema = {
  type: 'object',
  required: ['project_id', 'sentences', 'author'],
  properties: {
    schema: {
      type: 'string',
      enum: ['t3x/commit/v4'],
      description: 'Optional schema identifier. If provided, must be t3x/commit/v4',
    },
    project_id: {
      type: 'string',
      description: 'Project ID (format: proj_xxx)',
    },
    branch: {
      type: 'string',
      default: 'main',
      description: 'Branch name to commit to',
    },
    parents: {
      type: 'array',
      items: { type: 'string' },
      description: 'Parent commit hashes (for non-root commits)',
    },
    message: {
      type: 'string',
      description: 'Optional commit message',
    },
    sentences: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['text'],
        properties: {
          id: { type: 'string', description: 'Sentence ID (auto-generated if not provided)' },
          text: { type: 'string', description: 'Sentence text content' },
        },
      },
    },
    author: {
      type: 'object',
      required: ['name', 'identity'],
      properties: {
        name: { type: 'string' },
        identity: { type: 'string' },
        verification: { type: 'string', enum: ['none', 'device', 'verified'] },
      },
    },
    source_refs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['conversation', 'turn'] },
          conversation_id: { type: 'string' },
          turn_hash: { type: 'string' },
        },
      },
    },
  },
  // Explicitly document what is NOT allowed
  additionalProperties: false,
};
```

#### Acceptance Criteria

- [ ] V3 payload (with `schema: 't3x/commit/v3'`) returns 400 with clear error
- [ ] Missing required fields return specific error messages
- [ ] Payload with `constraints` array returns informative error
- [ ] OpenAPI schema accurately documents V4 requirements
- [ ] All tests pass

---

## Phase 2.2B: Track B Issues (Frontend)

### Issue B1: Integrate Context Panel into Conversation Page

**Priority**: P0
**Estimated Effort**: 2-3 hours
**Owner**: Frontend Developer
**Files to Modify**:
- `apps/web/src/app/project/[projectId]/conversation/[conversationId]/page.tsx` (or create if needed)
- May need to create route if it doesn't exist

#### Problem Statement

The ContextPanel component exists but is not integrated into any page. Users cannot view or manage their conversation context.

#### Current State

- ✅ ContextPanel component: `apps/web/src/components/conversation/ContextPanel.tsx`
- ✅ EditContextDialog component: `apps/web/src/components/conversation/EditContextDialog.tsx`
- ✅ pinsStore: `apps/web/src/store/pinsStore.ts`
- ❓ Conversation page: Need to verify if it exists

#### Detailed Tasks

**Task 1: Verify or create conversation page route**

Check if the route exists:

```bash
ls apps/web/src/app/project/\[projectId\]/conversation/
```

If not, create `apps/web/src/app/project/[projectId]/conversation/[conversationId]/page.tsx`:

```typescript
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ContextPanel } from '@/components/conversation/ContextPanel';
import { ConversationView } from '@/components/conversation/ConversationView';
import { getConversation, getProjectPins } from '@/lib/api';

interface PageProps {
  params: Promise<{
    projectId: string;
    conversationId: string;
  }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { projectId, conversationId } = await params;

  // Fetch conversation data
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    notFound();
  }

  return (
    <div className="flex h-full">
      {/* Main conversation area */}
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div>Loading conversation...</div>}>
          <ConversationView
            conversationId={conversationId}
            projectId={projectId}
          />
        </Suspense>
      </div>

      {/* Context panel sidebar */}
      <aside className="w-80 border-l border-gray-200 dark:border-gray-700">
        <Suspense fallback={<div>Loading context...</div>}>
          <ContextPanelWrapper
            projectId={projectId}
            conversationId={conversationId}
          />
        </Suspense>
      </aside>
    </div>
  );
}
```

**Task 2: Create ContextPanelWrapper for data fetching**

```typescript
// apps/web/src/components/conversation/ContextPanelWrapper.tsx

'use client';

import { useEffect, useState } from 'react';
import { usePinsStore } from '@/store/pinsStore';
import { ContextPanel } from './ContextPanel';
import { updateConversationContext, getConversationContext } from '@/lib/api';
import { toast } from 'sonner'; // or your toast library

interface ContextPanelWrapperProps {
  projectId: string;
  conversationId: string;
}

export function ContextPanelWrapper({ projectId, conversationId }: ContextPanelWrapperProps) {
  const { pins, fetchPins, isLoading: pinsLoading } = usePinsStore();
  const [contextConfig, setContextConfig] = useState<{
    selected_pin_ids: string[] | null;
  }>({ selected_pin_ids: null });
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch pins on mount
  useEffect(() => {
    fetchPins(projectId);
  }, [projectId, fetchPins]);

  // Fetch current context config
  useEffect(() => {
    async function loadContext() {
      try {
        const context = await getConversationContext(conversationId);
        setContextConfig(context);
      } catch (err) {
        console.error('Failed to load context:', err);
      }
    }
    loadContext();
  }, [conversationId]);

  // Handle context changes
  const handleContextChange = async (selectedPinIds: string[] | null) => {
    setIsUpdating(true);
    try {
      await updateConversationContext(conversationId, {
        selected_pin_ids: selectedPinIds,
      });
      setContextConfig({ selected_pin_ids: selectedPinIds });
      toast.success('Context updated');
    } catch (err) {
      console.error('Failed to update context:', err);
      toast.error('Failed to update context');
    } finally {
      setIsUpdating(false);
    }
  };

  if (pinsLoading) {
    return <div className="p-4">Loading pins...</div>;
  }

  return (
    <ContextPanel
      pins={pins}
      selectedPinIds={contextConfig.selected_pin_ids}
      onContextChange={handleContextChange}
      isUpdating={isUpdating}
    />
  );
}
```

**Task 3: Add API functions if missing**

In `apps/web/src/lib/api.ts`:

```typescript
export async function getConversationContext(conversationId: string) {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/context`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to fetch context');
  }
  return data.data;
}

export async function updateConversationContext(
  conversationId: string,
  config: { selected_pin_ids: string[] | null }
) {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to update context');
  }
  return data.data;
}
```

**Task 4: Test UI interactions**

Manual testing checklist:
- [ ] Navigate to `/project/{id}/conversation/{id}`
- [ ] ContextPanel renders in sidebar
- [ ] Pins list shows pinned items
- [ ] Click "Edit" opens EditContextDialog
- [ ] Select/deselect pins in dialog
- [ ] Save changes → toast appears
- [ ] Reload page → changes persisted

#### Acceptance Criteria

- [ ] ContextPanel displays in conversation page sidebar
- [ ] Pin list shows all project pins correctly
- [ ] Edit dialog opens and allows pin selection
- [ ] Context changes save successfully
- [ ] Page handles loading states gracefully
- [ ] Errors display user-friendly messages

---

### Issue B2: Adapt Commit List and Detail Views for V4

**Priority**: P1
**Estimated Effort**: 2 hours
**Owner**: Frontend Developer
**Files to Modify**:
- `apps/web/src/components/canvas/CommitNode.tsx` (or similar)
- `apps/web/src/components/canvas/CommitDetailPanel.tsx` (or similar)
- `apps/web/src/lib/api.ts` (type updates)

#### Problem Statement

The WebUI may still be structured around V3 commit format (with `facet_snapshot`, `constraints`, etc.). V4 commits have a different structure (`sentences` instead of `constraints`) that needs to be displayed correctly.

#### Current V4 Commit Structure

```typescript
interface CommitV4 {
  hash: string;
  schema: 't3x/commit/v4';
  parents: string[];
  author: { name: string; identity: string; verification?: string };
  committed_at: string;
  content: {
    sentences: Array<{ id: string; text: string; source?: SourceInfo }>;
  };
  // Second-class fields (not in hash)
  project_id?: string;
  message?: string;
  branch?: string;
  position_x?: number;
  position_y?: number;
  source_refs?: SourceRef[];
}
```

#### Detailed Tasks

**Task 1: Update TypeScript types**

In `apps/web/src/lib/api.ts` or a dedicated types file:

```typescript
// V4 Commit types
export interface SentenceV4 {
  id: string;
  text: string;
  source?: {
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
}

export interface CommitV4 {
  hash: string;
  schema: 't3x/commit/v4';
  parents: string[];
  author: {
    name: string;
    identity: string;
    verification?: 'none' | 'device' | 'verified';
  };
  committed_at: string;
  content: {
    sentences: SentenceV4[];
  };
  // Second-class fields
  project_id?: string;
  message?: string;
  branch?: string;
  position_x?: number;
  position_y?: number;
  source_refs?: SourceRef[];
}

export interface SourceRef {
  type: 'conversation' | 'turn';
  conversation_id?: string;
  turn_hash?: string;
}

// Helper to check if commit is V4
export function isCommitV4(commit: unknown): commit is CommitV4 {
  return (
    typeof commit === 'object' &&
    commit !== null &&
    'schema' in commit &&
    (commit as any).schema === 't3x/commit/v4'
  );
}
```

**Task 2: Update Commit List component**

Find and update the commit list rendering:

```typescript
// apps/web/src/components/canvas/CommitListItem.tsx or similar

interface CommitListItemProps {
  commit: CommitV4;
  onClick: (hash: string) => void;
}

export function CommitListItem({ commit, onClick }: CommitListItemProps) {
  // Display logic
  const displayTitle = commit.message || `Commit ${commit.hash.slice(0, 12)}...`;
  const sentenceCount = commit.content.sentences.length;

  return (
    <div
      className="p-3 border rounded hover:bg-gray-50 cursor-pointer"
      onClick={() => onClick(commit.hash)}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium truncate">{displayTitle}</span>
        <span className="text-xs text-gray-500">{commit.branch}</span>
      </div>

      <div className="mt-1 text-sm text-gray-600">
        {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
      </div>

      <div className="mt-1 text-xs text-gray-400">
        by {commit.author.name} · {formatDate(commit.committed_at)}
      </div>
    </div>
  );
}
```

**Task 3: Update Commit Detail component**

```typescript
// apps/web/src/components/canvas/CommitDetailPanel.tsx or similar

interface CommitDetailPanelProps {
  commit: CommitV4;
  onClose: () => void;
}

export function CommitDetailPanel({ commit, onClose }: CommitDetailPanelProps) {
  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {commit.message || 'Untitled Commit'}
        </h2>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>

      {/* Metadata */}
      <div className="mb-4 text-sm text-gray-600">
        <p><strong>Hash:</strong> <code>{commit.hash}</code></p>
        <p><strong>Branch:</strong> {commit.branch || 'main'}</p>
        <p><strong>Author:</strong> {commit.author.name} ({commit.author.identity})</p>
        <p><strong>Committed:</strong> {formatDateTime(commit.committed_at)}</p>
        {commit.parents.length > 0 && (
          <p><strong>Parents:</strong> {commit.parents.map(p => p.slice(0, 12)).join(', ')}</p>
        )}
      </div>

      {/* Sentences - This is the key V4 difference */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">
          Sentences ({commit.content.sentences.length})
        </h3>
        <ul className="space-y-2">
          {commit.content.sentences.map((sentence) => (
            <li key={sentence.id} className="p-2 bg-gray-50 rounded text-sm">
              <span className="text-xs text-gray-400 mr-2">{sentence.id}</span>
              {sentence.text}
            </li>
          ))}
        </ul>
      </div>

      {/* V4 Notice - Constraints are in Leaves */}
      <div className="p-3 bg-blue-50 text-blue-700 rounded text-sm">
        <strong>Note:</strong> In V4, constraints are defined in Leaves, not commits.
        <br />
        <a href={`/project/${commit.project_id}/leaves?commit=${commit.hash}`}
           className="underline">
          View Leaves for this commit →
        </a>
      </div>

      {/* Source References */}
      {commit.source_refs && commit.source_refs.length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Source References</h3>
          <ul className="space-y-1 text-sm">
            {commit.source_refs.map((ref, i) => (
              <li key={i}>
                {ref.type === 'conversation' && (
                  <span>Conversation: {ref.conversation_id}</span>
                )}
                {ref.type === 'turn' && (
                  <span>Turn: {ref.turn_hash?.slice(0, 12)}...</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Task 4: Remove or hide V3-specific UI elements**

Search for and update/remove:
- Any "Constraints" sections in commit views
- Any "facet_snapshot" displays
- Any V3-specific field references

```typescript
// Example: Conditional rendering for backwards compatibility during migration
function CommitContent({ commit }: { commit: CommitV4 | CommitV3 }) {
  if (isCommitV4(commit)) {
    return <V4SentencesList sentences={commit.content.sentences} />;
  }

  // Legacy V3 display (can be removed once V3 is fully deprecated)
  return <V3ConstraintsList constraints={commit.constraints} />;
}
```

#### Acceptance Criteria

- [ ] Commit list loads without errors for V4 commits
- [ ] Commit list shows message (or hash if no message)
- [ ] Commit list shows sentence count
- [ ] Commit list shows branch and author
- [ ] Commit detail panel shows all V4 fields
- [ ] Sentences display correctly with IDs
- [ ] No "constraints" section in V4 commit view
- [ ] Link to Leaves is present
- [ ] Source references display when present

---

### Issue B3: Add Leaf Creation Flow from Commit

**Priority**: P1
**Estimated Effort**: 2-3 hours
**Owner**: Frontend Developer
**Files to Modify**:
- `apps/web/src/components/canvas/LeafPanel.tsx`
- `apps/web/src/lib/api.ts`
- May need router integration for navigation

#### Problem Statement

Users need a clear path to create Leaves from Commits. The LeafPanel component may exist but lacks the creation logic and navigation flow.

#### Current State

- ✅ LeafPanel component exists (UI shell)
- ✅ Leaf detail page exists
- ✅ Leaf API endpoints exist
- ❓ Creation flow from commit view not implemented

#### Detailed Tasks

**Task 1: Add API client function for leaf creation**

In `apps/web/src/lib/api.ts`:

```typescript
export interface CreateLeafInput {
  commit_hash: string;
  type: 'system_prompt' | 'user_prompt' | 'evaluation' | 'custom';
  title?: string;
  project_id: string;
  constraints?: Array<{
    type: 'require' | 'exclude' | 'prefer';
    value: string;
    match_mode: 'exact' | 'semantic';
    weight?: number;
  }>;
  assertions?: Array<{
    type: 'contains' | 'excludes' | 'matches';
    value: string;
    description?: string;
  }>;
}

export interface Leaf {
  id: string;
  commit_hash: string;
  type: string;
  title?: string;
  project_id: string;
  constraints: Array<{
    id: string;
    type: string;
    value: string;
    match_mode: string;
    weight?: number;
  }>;
  assertions: Array<{
    id: string;
    type: string;
    value: string;
    description?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export async function createLeaf(input: CreateLeafInput): Promise<Leaf> {
  const res = await fetch(`${API_URL}/v1/leaves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await res.json();

  if (!data.success) {
    const errorMessage = data.error?.message || 'Failed to create leaf';
    throw new Error(errorMessage);
  }

  return data.data;
}
```

**Task 2: Create LeafCreationDialog component**

```typescript
// apps/web/src/components/canvas/LeafCreationDialog.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { createLeaf, type CreateLeafInput } from '@/lib/api';
import { toast } from 'sonner';

const LEAF_TYPES = [
  {
    value: 'system_prompt',
    label: 'System Prompt',
    description: 'Generate a system prompt from commit knowledge'
  },
  {
    value: 'user_prompt',
    label: 'User Prompt',
    description: 'Generate a user prompt template'
  },
  {
    value: 'evaluation',
    label: 'Evaluation',
    description: 'Create evaluation criteria for testing'
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Custom leaf type for other use cases'
  },
] as const;

interface LeafCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitHash: string;
  projectId: string;
}

export function LeafCreationDialog({
  open,
  onOpenChange,
  commitHash,
  projectId,
}: LeafCreationDialogProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [leafType, setLeafType] = useState<CreateLeafInput['type']>('system_prompt');
  const [title, setTitle] = useState('');

  const handleCreate = async () => {
    setIsCreating(true);

    try {
      const leaf = await createLeaf({
        commit_hash: commitHash,
        type: leafType,
        title: title || undefined,
        project_id: projectId,
        constraints: [], // Start empty, user will add in detail page
      });

      toast.success('Leaf created successfully');
      onOpenChange(false);

      // Navigate to leaf detail page
      router.push(`/project/${projectId}/leaf/${leaf.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create leaf';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Leaf from Commit</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title input */}
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User Profile System Prompt"
            />
          </div>

          {/* Leaf type selection */}
          <div className="space-y-2">
            <Label>Leaf Type</Label>
            <RadioGroup
              value={leafType}
              onValueChange={(v) => setLeafType(v as CreateLeafInput['type'])}
            >
              {LEAF_TYPES.map((type) => (
                <div key={type.value} className="flex items-start space-x-2">
                  <RadioGroupItem value={type.value} id={type.value} />
                  <div className="grid gap-0.5">
                    <Label htmlFor={type.value} className="font-medium">
                      {type.label}
                    </Label>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Commit reference (read-only) */}
          <div className="space-y-2">
            <Label>Source Commit</Label>
            <code className="block p-2 bg-gray-100 rounded text-sm">
              {commitHash.slice(0, 24)}...
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Leaf'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Task 3: Add creation trigger to Commit Detail**

Update the commit detail component to include a "Create Leaf" button:

```typescript
// In CommitDetailPanel.tsx or similar

import { useState } from 'react';
import { LeafCreationDialog } from './LeafCreationDialog';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react'; // or your icon library

export function CommitDetailPanel({ commit, onClose }: CommitDetailPanelProps) {
  const [showCreateLeaf, setShowCreateLeaf] = useState(false);

  return (
    <div className="p-4">
      {/* ... existing header and metadata ... */}

      {/* Actions section */}
      <div className="mb-4 flex gap-2">
        <Button onClick={() => setShowCreateLeaf(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Leaf
        </Button>
        {/* Other actions... */}
      </div>

      {/* ... rest of component ... */}

      {/* Leaf creation dialog */}
      <LeafCreationDialog
        open={showCreateLeaf}
        onOpenChange={setShowCreateLeaf}
        commitHash={commit.hash}
        projectId={commit.project_id!}
      />
    </div>
  );
}
```

**Task 4: Handle error states**

Ensure proper error handling:

```typescript
// In LeafCreationDialog

const handleCreate = async () => {
  setIsCreating(true);

  try {
    const leaf = await createLeaf({...});
    // success handling
  } catch (err) {
    // Handle specific error codes from backend
    if (err instanceof Error) {
      if (err.message.includes('COMMIT_NOT_FOUND')) {
        toast.error('The commit no longer exists. Please refresh and try again.');
      } else if (err.message.includes('PROJECT_NOT_FOUND')) {
        toast.error('Project not found. Please check your permissions.');
      } else {
        toast.error(err.message);
      }
    } else {
      toast.error('An unexpected error occurred');
    }
  } finally {
    setIsCreating(false);
  }
};
```

#### Acceptance Criteria

- [ ] "Create Leaf" button appears in commit detail view
- [ ] Clicking button opens creation dialog
- [ ] User can select leaf type from 4 options
- [ ] User can optionally enter a title
- [ ] Clicking "Create" calls the API successfully
- [ ] On success: dialog closes, toast appears, redirects to leaf detail
- [ ] On error: error toast displays with helpful message
- [ ] Loading state shows during API call
- [ ] Cancel button closes dialog without action

---

## Phase 2.3: Integration and Wrap-up

### Issue I1: Create E2E Runbook (Manual Run-Through Script)

**Priority**: P1
**Estimated Effort**: 1-2 hours
**Owner**: Coordinator
**Depends on**: A1-A3, B1-B3 substantially complete

#### Description

Create a comprehensive manual run-through script that any team member can execute to verify the full V4 flow works end-to-end. This serves as both documentation and a verification tool.

#### Deliverable

Create `docs/plans/v4-e2e-runbook.md`:

```markdown
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
    "project_id": "proj_xxxxxxxxx",
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
      "name": "Test User",
      "identity": "test@example.com",
      "verification": "none"
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
    "author": {...},
    "committed_at": "2024-...",
    "message": "Initial user preferences commit",
    "branch": "main"
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
   - NO constraints section (V4 feature)

---

## Step 3: Verify V3 Rejection

**API (should fail):**
```bash
curl -X POST http://localhost:8000/v1/commits-v4 \
  -H "Content-Type: application/json" \
  -d '{
    "schema": "t3x/commit/v3",
    "project_id": "'$PROJECT_ID'",
    "turn_window": {"start_turn_hash": "sha256:x", "end_turn_hash": "sha256:y"},
    "facet_snapshot": []
  }'
```

**Expected Response (400 error):**
```json
{
  "success": false,
  "error": {
    "code": "COMMIT_VERSION_UNSUPPORTED",
    "message": "Only V4 commits supported. Received schema: t3x/commit/v3"
  }
}
```

✅ If you see this error, V4-only validation is working correctly.

---

## Step 4: Create a Leaf

**API:**
```bash
curl -X POST http://localhost:8000/v1/leaves \
  -H "Content-Type: application/json" \
  -d '{
    "commit_hash": "'$COMMIT_HASH'",
    "type": "system_prompt",
    "title": "User Profile System Prompt",
    "project_id": "'$PROJECT_ID'",
    "constraints": [
      {
        "type": "require",
        "value": "dark mode",
        "match_mode": "semantic"
      },
      {
        "type": "require",
        "value": "bilingual support",
        "match_mode": "semantic"
      }
    ],
    "assertions": [
      {
        "type": "contains",
        "value": "dark",
        "description": "Output should mention dark mode preference"
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "leaf_xxxxxxxxx",
    "commit_hash": "sha256:abc...",
    "type": "system_prompt",
    "title": "User Profile System Prompt",
    "constraints": [
      {"id": "cst_xxx", "type": "require", "value": "dark mode", "match_mode": "semantic"},
      {"id": "cst_yyy", "type": "require", "value": "bilingual support", "match_mode": "semantic"}
    ],
    "assertions": [
      {"id": "ast_zzz", "type": "contains", "value": "dark", "description": "..."}
    ],
    "created_at": "2024-...",
    "updated_at": "2024-..."
  }
}
```

**Save the leaf_id:**
```bash
export LEAF_ID="leaf_xxxxxxxxx"
```

**WebUI Verification:**
1. From commit detail, click "Create Leaf" button
2. Select "System Prompt" type
3. Enter title
4. Click Create
5. Should redirect to leaf detail page
6. Verify constraints and assertions display

---

## Step 5: Pin the Leaf

**API:**
```bash
curl -X POST http://localhost:8000/v1/projects/$PROJECT_ID/pins \
  -H "Content-Type: application/json" \
  -d '{
    "type": "leaf",
    "ref_id": "'$LEAF_ID'",
    "selected_assertion_ids": ["ast_zzz"]
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
    "selected_assertion_ids": ["ast_zzz"],
    "created_at": "2024-..."
  }
}
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
    "message": "leaf leaf_xxx is already pinned in this project"
  }
}
```

**WebUI Verification:**
1. In leaf detail page, pin status should show "Pinned"
2. Pin/Unpin toggle should work

---

## Step 6: Create a Conversation and View Context

**API - Create Conversation:**
```bash
curl -X POST http://localhost:8000/v1/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "'$PROJECT_ID'",
    "title": "Test Conversation"
  }'
```

**Save conversation_id:**
```bash
export CONV_ID="conv_xxxxxxxxx"
```

**API - Get Memory/Context:**
```bash
curl http://localhost:8000/v1/conversations/$CONV_ID/memory
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "text": "...(built context string)...",
    "token_estimate": 150,
    "sources": [
      {"type": "commit", "hash": "sha256:..."},
      {"type": "leaf", "id": "leaf_..."}
    ]
  }
}
```

**WebUI Verification:**
1. Navigate to conversation page
2. Context Panel should show in sidebar
3. Should display pinned items
4. Edit dialog should allow selecting which pins to include

---

## Step 7: Export Context (If Implemented)

**API:**
```bash
# JSON format
curl "http://localhost:8000/v1/conversations/$CONV_ID/context-export?format=json"

# Markdown format
curl "http://localhost:8000/v1/conversations/$CONV_ID/context-export?format=markdown"
```

**WebUI Verification:**
1. Click Export button in Context Panel
2. Select format
3. File should download

---

## Cleanup

```bash
unset PROJECT_ID COMMIT_HASH LEAF_ID CONV_ID
```

---

## Troubleshooting

### "Connection refused" errors
- Check if services are running (`pnpm dev:webui`, `pnpm dev:api`)
- Check ports 3000 and 8000 are not in use

### "Project not found" errors
- Verify PROJECT_ID is set correctly
- Project may have been deleted - create a new one

### WebUI shows stale data
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear local storage if using state persistence

### Tests fail but API works manually
- Run `pnpm db:reset` to reset test database
- Check for orphaned test data
```

#### Acceptance Criteria

- [ ] Runbook is complete and executable
- [ ] Each step has clear expected output
- [ ] WebUI verification steps are included
- [ ] Troubleshooting section covers common issues
- [ ] New team member can complete in 15 minutes

---

### Issue I2: Implement Context Export (Downstream Action)

**Priority**: P1
**Estimated Effort**: 3-4 hours
**Owner**: Both developers (Backend + Frontend)
**Depends on**: I1 complete, B1 complete

#### Description

Implement the minimum downstream action: export the built context as JSON or Markdown file. This proves the full V4 pipeline produces usable output.

#### Detailed Tasks

**Backend Tasks (Developer A):**

**Task 1: Add export endpoint**

In `apps/api/src/routes/conversations.openapi.ts`:

```typescript
import { formatContextAsMarkdown } from '../lib/context-formatter';

// GET /v1/conversations/:id/context-export
app.get('/:id/context-export', async (c) => {
  const conversationId = c.req.param('id');
  const format = c.req.query('format') ?? 'json';

  // Get the conversation
  const conversation = await findConversationById(db, conversationId);
  if (!conversation) {
    return errorResponse(c, 'CONVERSATION_NOT_FOUND',
      `Conversation not found: ${conversationId}`);
  }

  // Build the context
  const builtContext = await buildConversationContext(db, conversationId);

  if (format === 'markdown') {
    const markdown = formatContextAsMarkdown(builtContext, conversation);
    const filename = `context-${conversationId.slice(0, 8)}-${Date.now()}.md`;

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // JSON format (default)
  const filename = `context-${conversationId.slice(0, 8)}-${Date.now()}.json`;
  return new Response(JSON.stringify(builtContext, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
```

**Task 2: Create markdown formatter**

Create `apps/api/src/lib/context-formatter.ts`:

```typescript
import type { BuiltContext } from '@t3x/core';

export function formatContextAsMarkdown(
  context: BuiltContext,
  conversation: { conversation_id: string; title?: string }
): string {
  const lines: string[] = [];

  lines.push(`# Context Export`);
  lines.push('');
  lines.push(`**Conversation:** ${conversation.title || conversation.conversation_id}`);
  lines.push(`**Exported at:** ${new Date().toISOString()}`);
  lines.push(`**Token estimate:** ${context.token_estimate}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Context Content');
  lines.push('');
  lines.push('```');
  lines.push(context.text);
  lines.push('```');
  lines.push('');

  if (context.sources && context.sources.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const source of context.sources) {
      if (source.type === 'commit') {
        lines.push(`- Commit: \`${source.hash}\``);
      } else if (source.type === 'leaf') {
        lines.push(`- Leaf: \`${source.id}\``);
      } else if (source.type === 'conversation') {
        lines.push(`- Conversation: \`${source.conversation_id}\``);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by T3X V4*');

  return lines.join('\n');
}
```

**Task 3: Add tests**

```typescript
// apps/api/src/__tests__/context-export.test.ts

describe('GET /v1/conversations/:id/context-export', () => {
  it('exports context as JSON by default', async () => {
    const { conversation } = await setupTestConversationWithContext();

    const res = await app.request(
      `/v1/conversations/${conversation.conversation_id}/context-export`
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const data = await res.json();
    expect(data).toHaveProperty('text');
    expect(data).toHaveProperty('token_estimate');
  });

  it('exports context as markdown when requested', async () => {
    const { conversation } = await setupTestConversationWithContext();

    const res = await app.request(
      `/v1/conversations/${conversation.conversation_id}/context-export?format=markdown`
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');

    const text = await res.text();
    expect(text).toContain('# Context Export');
    expect(text).toContain('## Context Content');
  });

  it('returns 404 for non-existent conversation', async () => {
    const res = await app.request(
      '/v1/conversations/conv_nonexistent/context-export'
    );

    expect(res.status).toBe(404);
  });
});
```

**Frontend Tasks (Developer B):**

**Task 4: Add Export button to ContextPanel**

```typescript
// In ContextPanel.tsx or ContextPanelWrapper.tsx

import { DownloadIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Add export functionality
const handleExport = (format: 'json' | 'markdown') => {
  const url = `${API_URL}/v1/conversations/${conversationId}/context-export?format=${format}`;
  window.open(url, '_blank');
};

// In the render:
<div className="flex items-center gap-2">
  <Button variant="outline" onClick={handleEditClick}>
    Edit
  </Button>

  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">
        <DownloadIcon className="w-4 h-4 mr-2" />
        Export
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => handleExport('json')}>
        Export as JSON
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleExport('markdown')}>
        Export as Markdown
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

**Task 5: Add copy-to-clipboard option**

```typescript
const handleCopyContext = async () => {
  try {
    const res = await fetch(
      `${API_URL}/v1/conversations/${conversationId}/context-export?format=json`
    );
    const context = await res.json();
    await navigator.clipboard.writeText(context.text);
    toast.success('Context copied to clipboard');
  } catch (err) {
    toast.error('Failed to copy context');
  }
};

// In dropdown:
<DropdownMenuItem onClick={handleCopyContext}>
  Copy to Clipboard
</DropdownMenuItem>
```

#### Acceptance Criteria

- [ ] `/context-export` endpoint returns JSON with correct headers
- [ ] `/context-export?format=markdown` returns formatted markdown
- [ ] File downloads work in browser
- [ ] Export includes commit sentences and pinned items
- [ ] Markdown format is human-readable
- [ ] Copy to clipboard works
- [ ] Tests pass

---

### Issue I3: Add WebUI E2E Acceptance Tests

**Priority**: P2
**Estimated Effort**: 2-3 hours
**Owner**: Frontend Developer
**Depends on**: I1, I2 complete

#### Description

Create acceptance tests for the WebUI to verify the V4 flow works correctly from a user perspective.

#### Option A: Manual Checklist (Recommended for First Pass)

Create `docs/plans/v4-webui-checklist.md`:

```markdown
# V4 WebUI Manual Verification Checklist

> Run this checklist after each significant UI change
> Prerequisites: Services running (webui + api)

## Setup
- [ ] `pnpm dev:webui` running on port 3000
- [ ] `pnpm dev:api` running on port 8000
- [ ] Database has test data (run runbook steps 1-5 first)

## Project List Page
- [ ] Projects load without console errors
- [ ] Project names display correctly
- [ ] Click project navigates to canvas

## Project Canvas
- [ ] Canvas loads without errors
- [ ] V4 commits display as nodes
- [ ] Nodes show commit message or hash
- [ ] Nodes show sentence count indicator
- [ ] Clicking node opens detail panel

## Commit Detail Panel
- [ ] Panel opens on node click
- [ ] Hash displays correctly
- [ ] Message displays (or "Untitled" if none)
- [ ] Branch name displays
- [ ] Author name and identity display
- [ ] Committed timestamp displays
- [ ] Sentences section shows with correct count
- [ ] Each sentence shows ID and text
- [ ] NO constraints section (V4 does not have)
- [ ] "Constraints are in Leaves" notice displays
- [ ] Source references show (if any)
- [ ] "Create Leaf" button is visible
- [ ] Close button works

## Leaf Creation
- [ ] "Create Leaf" button opens dialog
- [ ] Dialog shows leaf type options (4 types)
- [ ] Title input works
- [ ] Commit hash displays (read-only)
- [ ] Cancel closes dialog without action
- [ ] Create with no selection shows appropriate default
- [ ] Create navigates to leaf detail page
- [ ] Error during create shows toast message

## Leaf Detail Page
- [ ] Page loads for valid leaf ID
- [ ] Title displays
- [ ] Type displays
- [ ] Associated commit hash displays
- [ ] Constraints list shows (or "No constraints" message)
- [ ] Assertions list shows (or "No assertions" message)
- [ ] Pin button visible and functional
- [ ] Edit constraints works (if implemented)

## Pin Functionality
- [ ] Pin button shows correct state (Pinned/Unpinned)
- [ ] Click Pin changes state
- [ ] Toast confirms action
- [ ] Refresh preserves pin state

## Context Panel (Conversation Page)
- [ ] Panel displays in sidebar
- [ ] Shows "Context" header
- [ ] Lists pinned items
- [ ] Each pin shows type and reference
- [ ] "Edit" button opens dialog
- [ ] "Export" dropdown has options

## Edit Context Dialog
- [ ] Dialog opens correctly
- [ ] Shows all available pins
- [ ] Checkboxes work for selection
- [ ] "Use all" / "Custom" toggle works
- [ ] Save persists changes
- [ ] Cancel discards changes

## Export Functionality
- [ ] Export JSON downloads file
- [ ] Export Markdown downloads file
- [ ] Copy to clipboard works
- [ ] Downloaded files have content

## Error Handling
- [ ] 404 page shows for invalid project ID
- [ ] 404 page shows for invalid leaf ID
- [ ] Network error shows appropriate message
- [ ] Empty states have helpful text

## Performance
- [ ] Initial page load < 3 seconds
- [ ] No visible jank when scrolling
- [ ] No memory leaks (check DevTools)

## Accessibility
- [ ] All buttons have labels
- [ ] Dialogs trap focus
- [ ] Escape closes dialogs
- [ ] Color contrast is sufficient
```

#### Option B: Playwright Automated Tests

If time permits, create `apps/web/e2e/v4-flow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('V4 E2E Flow', () => {
  // Setup: Create test data via API before tests
  let projectId: string;
  let commitHash: string;
  let leafId: string;

  test.beforeAll(async ({ request }) => {
    // Create project
    const projectRes = await request.post('http://localhost:8000/v1/projects', {
      data: { name: 'E2E Test Project' },
    });
    const projectData = await projectRes.json();
    projectId = projectData.data.project_id;

    // Create commit
    const commitRes = await request.post('http://localhost:8000/v1/commits-v4', {
      data: {
        project_id: projectId,
        branch: 'main',
        sentences: [{ id: 's_1', text: 'Test sentence' }],
        author: { name: 'E2E', identity: 'e2e@test.com' },
      },
    });
    const commitData = await commitRes.json();
    commitHash = commitData.data.hash;

    // Create leaf
    const leafRes = await request.post('http://localhost:8000/v1/leaves', {
      data: {
        commit_hash: commitHash,
        type: 'system_prompt',
        project_id: projectId,
      },
    });
    const leafData = await leafRes.json();
    leafId = leafData.data.id;
  });

  test('displays project canvas with V4 commit', async ({ page }) => {
    await page.goto(`http://localhost:3000/project/${projectId}`);

    // Canvas should load
    await expect(page.locator('[data-testid="project-canvas"]')).toBeVisible();

    // Commit node should be visible
    const commitNode = page.locator(`[data-testid="commit-node-${commitHash}"]`);
    await expect(commitNode).toBeVisible();
  });

  test('opens commit detail on node click', async ({ page }) => {
    await page.goto(`http://localhost:3000/project/${projectId}`);

    // Click commit node
    await page.locator(`[data-testid="commit-node-${commitHash}"]`).click();

    // Detail panel should open
    await expect(page.locator('[data-testid="commit-detail-panel"]')).toBeVisible();

    // Should show sentences, not constraints
    await expect(page.getByText('Sentences')).toBeVisible();
    await expect(page.getByText('Constraints')).not.toBeVisible();
    await expect(page.getByText('Test sentence')).toBeVisible();
  });

  test('creates leaf from commit', async ({ page }) => {
    await page.goto(`http://localhost:3000/project/${projectId}`);

    // Open commit detail
    await page.locator(`[data-testid="commit-node-${commitHash}"]`).click();

    // Click create leaf
    await page.getByRole('button', { name: 'Create Leaf' }).click();

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select type and create
    await page.getByLabel('System Prompt').click();
    await page.getByRole('button', { name: 'Create Leaf' }).click();

    // Should navigate to leaf page
    await expect(page).toHaveURL(/\/leaf\/leaf_/);
  });

  test('pins and unpins leaf', async ({ page }) => {
    await page.goto(`http://localhost:3000/project/${projectId}/leaf/${leafId}`);

    // Find pin button
    const pinButton = page.getByRole('button', { name: /pin/i });

    // Click to pin
    await pinButton.click();
    await expect(page.getByText('Pinned')).toBeVisible();

    // Click to unpin
    await pinButton.click();
    await expect(page.getByText('Pin')).toBeVisible();
  });
});
```

#### Acceptance Criteria

- [ ] Manual checklist is complete and covers all V4 UI features
- [ ] (Optional) Playwright tests run without flakiness
- [ ] All checklist items pass
- [ ] No console errors during test runs

---

## GitHub Issue Creation Commands

```bash
# G1 - Gate (Acceptance Criteria)
gh issue create --title "docs: define V4 E2E acceptance criteria" \
  --label "e2e,v4,gate,documentation" \
  --body "Define the hard acceptance criteria for V4 run-through phase.

**Priority**: P0 (Gate)
**Owner**: Coordinator

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-g1-define-v4-run-through-acceptance-checklist"

# G2 - Gate (Contract Freeze)
gh issue create --title "chore: establish contract freeze and branch structure" \
  --label "e2e,v4,gate,infrastructure" \
  --body "Set up parallel development infrastructure.

**Priority**: P0 (Gate)
**Owner**: Coordinator
**Depends on**: G1

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-g2-establish-contract-freeze-and-branch-structure"

# A1 - Backend Tests
gh issue create --title "test(api): complete V4 API test coverage" \
  --label "e2e,v4,track-a,testing" \
  --body "Add comprehensive test coverage for all V4 API endpoints.

**Priority**: P0
**Owner**: Backend Developer
**Depends on**: G1, G2

Key areas:
- V3 rejection tests
- Branch HEAD management tests
- Constraint/Assertion ID generation tests
- Duplicate pin prevention tests

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-a1-complete-v4-api-test-coverage"

# A2 - Error Standardization
gh issue create --title "feat(api): standardize error responses for V4 endpoints" \
  --label "e2e,v4,track-a,api" \
  --body "Create centralized error handling with consistent format.

**Priority**: P1
**Owner**: Backend Developer

Deliverables:
- Error codes enum
- createError helper function
- Update all V4 routes to use standardized errors

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-a2-standardize-error-responses"

# A3 - V4-only Validation
gh issue create --title "feat(api): add explicit V4-only schema validation" \
  --label "e2e,v4,track-a,api" \
  --body "Add explicit validation to reject non-V4 commits.

**Priority**: P1
**Owner**: Backend Developer

Validates:
- Schema version field
- Required V4 fields
- Rejects constraints at commit level

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-a3-add-v4-only-schema-validation"

# B1 - Context Panel Integration
gh issue create --title "feat(web): integrate ContextPanel into conversation page" \
  --label "e2e,v4,track-b,frontend" \
  --body "Connect the ContextPanel component to the conversation page.

**Priority**: P0
**Owner**: Frontend Developer
**Depends on**: G1, G2

Tasks:
- Create/update conversation page route
- Integrate ContextPanel component
- Add context config state management
- Handle pin selection persistence

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-b1-integrate-context-panel-into-conversation-page"

# B2 - Commit V4 Adaptation
gh issue create --title "feat(web): adapt commit list/detail views for V4 schema" \
  --label "e2e,v4,track-b,frontend" \
  --body "Update commit UI components to work with V4 structure.

**Priority**: P1
**Owner**: Frontend Developer

Changes:
- Update TypeScript types for CommitV4
- Show sentences instead of constraints
- Add 'Constraints are in Leaves' notice
- Display source_refs

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-b2-adapt-commit-list-and-detail-views-for-v4"

# B3 - Leaf Creation Flow
gh issue create --title "feat(web): add leaf creation flow from commit view" \
  --label "e2e,v4,track-b,frontend" \
  --body "Implement the full leaf creation UX from commit detail.

**Priority**: P1
**Owner**: Frontend Developer

Deliverables:
- LeafCreationDialog component
- API client function for createLeaf
- Integration with commit detail panel
- Navigation to leaf detail on success

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-b3-add-leaf-creation-flow-from-commit"

# I1 - E2E Runbook
gh issue create --title "docs: create V4 E2E runbook for manual testing" \
  --label "e2e,v4,integration,documentation" \
  --body "Write comprehensive run-through script for verification.

**Priority**: P1
**Owner**: Coordinator
**Depends on**: A1-A3, B1-B3

The runbook should allow any team member to verify the full V4 flow in 10-15 minutes.

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-i1-create-e2e-runbook-manual-run-through-script"

# I2 - Context Export
gh issue create --title "feat: implement context export (JSON/Markdown)" \
  --label "e2e,v4,integration" \
  --body "Add the minimum downstream action: export context.

**Priority**: P1
**Owner**: Both developers
**Depends on**: I1, B1

Backend:
- Add /context-export endpoint
- Support JSON and Markdown formats

Frontend:
- Add Export dropdown to ContextPanel
- Add Copy to Clipboard option

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-i2-implement-context-export-downstream-action"

# I3 - WebUI Acceptance Tests
gh issue create --title "test(web): add V4 WebUI acceptance tests" \
  --label "e2e,v4,integration,testing" \
  --body "Create acceptance tests for WebUI V4 flow.

**Priority**: P2
**Owner**: Frontend Developer
**Depends on**: I1, I2

Options:
- Manual checklist (recommended first)
- Playwright automated tests (optional)

See full details: docs/plans/v4-e2e-runthrough-issues.md#issue-i3-add-webui-e2e-acceptance-tests"
```

---

## Quick Reference: Issue Dependencies

| Issue | Depends On | Blocks |
|-------|------------|--------|
| G1 | None | G2, All others |
| G2 | G1 | A1-A3, B1-B3 |
| A1 | G2 | I1 |
| A2 | G2 | I1 |
| A3 | G2 | I1 |
| B1 | G2 | I1, I2 |
| B2 | G2 | I1 |
| B3 | G2 | I1 |
| I1 | A1-A3, B1-B3 | I2, I3 |
| I2 | I1, B1 | I3 |
| I3 | I1, I2 | None |

---

## Parallel Development Checklist

Before starting work each day:

- [ ] Pull latest from integration branch
- [ ] Check if contract files were modified
- [ ] Announce your focus area in team channel
- [ ] Review any blocking issues

Before creating a PR:

- [ ] Rebase from integration branch
- [ ] Run `pnpm test` (all packages)
- [ ] Run `pnpm lint`
- [ ] Verify no changes to frozen files
- [ ] Tag other developer for review if touching shared areas

Integration checkpoints:

- [ ] **CP1**: After G1+G2 - Both developers aligned on criteria
- [ ] **CP2**: After A1+B2 - API types match frontend expectations
- [ ] **CP3**: After A2+B1 - Error handling works end-to-end
- [ ] **CP4**: After all Phase 2.2 - Full integration test
