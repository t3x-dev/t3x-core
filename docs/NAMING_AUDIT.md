# T3X Naming Convention Audit

## 0. Industry Standards Validation

Our naming conventions were validated against popular open source projects:

### Prisma ORM ([docs](https://www.prisma.io/docs/orm/reference/prisma-client-reference))
| Prisma Pattern | T3X Pattern | Match |
|----------------|-------------|-------|
| `prisma.user.findUnique()` | `findProjectById()` | Similar (we use `find*ById`) |
| `prisma.user.findMany()` | `findProjects()` | Similar |
| `prisma.user.create()` | `insertProject()` | Different (we use `insert*`) |
| `prisma.user.update()` | `updateProject()` | Match |
| `prisma.user.delete()` | `deleteProject()` | Match |
| PascalCase models | PascalCase types | Match |
| camelCase properties | camelCase properties | Match |

**Decision**: Keep `insert*` for database operations (SQL-oriented), `create*` for factories.

### NestJS ([guide](https://mahabub-r.medium.com/mastering-file-and-folder-naming-conventions-in-nestjs-for-a-scalable-backend-0edb1115033d))
| NestJS Pattern | T3X Pattern | Match |
|----------------|-------------|-------|
| `users.controller.ts` | `route.ts` | Different (Next.js convention) |
| `users.service.ts` | `*.ts` (flat) | Different |
| `create-user.dto.ts` | `CreateUserInput` (inline) | Similar |
| kebab-case files | Mixed | Needs review |
| PascalCase classes | PascalCase types | Match |

**Decision**: Follow Next.js App Router conventions for routes; consider service layer if complexity grows.

### REST API Standards ([Medium](https://medium.com/@nadinCodeHat/rest-api-naming-conventions-and-best-practices-1c4e781eb6a5), [API Gov AU](https://api.gov.au/sections/naming-conventions.html))
| Standard | T3X Pattern | Match |
|----------|-------------|-------|
| Plural nouns for resources | `/projects`, `/turns` | Match |
| kebab-case for URI paths | `/two-way`, `/three-way` | Match |
| snake_case OR camelCase (consistent) | snake_case in responses | Match |
| No verbs in URIs | `/branches/switch` (verb) | Minor issue |

**Decision**: `/branches/switch` is acceptable as a command endpoint; alternative is `PUT /branches/current`.

---

## 1. API Routes (Current)

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/status` | GET | System status |
| `/api/v1/projects` | GET, POST | List/create projects |
| `/api/v1/projects/[id]` | GET, PUT, DELETE | Single project CRUD |
| `/api/v1/conversations` | GET, POST | List/create conversations |
| `/api/v1/conversations/[id]` | GET, PUT, DELETE | Single conversation CRUD |
| `/api/v1/turns` | GET, POST | List/create turns |
| `/api/v1/turns/[hash]` | GET | Get turn by hash |
| `/api/v1/turns/[hash]/chain` | GET | Get turn chain |
| `/api/v1/commits` | GET, POST | List/create commits |
| `/api/v1/commits/[hash]` | GET | Get commit by hash |
| `/api/v1/branches` | GET, POST | List/create branches |
| `/api/v1/branches/current` | GET | Get current branch |
| `/api/v1/branches/switch` | POST | Switch branch |
| `/api/v1/drafts` | GET, POST | List/create drafts |
| `/api/v1/drafts/[id]` | GET, PATCH, DELETE | Single draft CRUD |
| `/api/v1/agent/drafts` | POST | Create agent draft (LLM) |
| `/api/v1/agent/drafts/[id]` | GET, PATCH | Agent draft with regeneration |
| `/api/v1/diff/two-way` | POST | Two-way semantic diff |
| `/api/v1/diff/three-way` | POST | Three-way semantic diff |
| `/api/v1/merge` | POST | Three-way merge |
| `/api/v1/merge/resolve` | POST | Resolve merge conflicts |
| `/api/v1/chat` | POST | Chat completion |
| `/api/v1/chat/stream` | POST | Streaming chat |
| `/api/v1/chat/providers` | GET | List chat providers |
| `/api/v1/export/cfpack` | GET | Export as .cfpack |
| `/api/v1/export/ledger` | GET | Export as JSONL ledger |

---

## 2. Storage Layer Functions (@t3x/storage)

### Projects
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertProject` | `(db, input: CreateProjectInput)` | Create project |
| `findProjectById` | `(db, projectId: string)` | Get by ID |
| `findProjects` | `(db, options: ListProjectsOptions)` | List projects |
| `findProjectWithStats` | `(db, projectId: string)` | Get with stats |
| `updateProject` | `(db, projectId, input)` | Update project |
| `deleteProject` | `(db, projectId: string)` | Delete project |

### Conversations
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertConversation` | `(db, input: CreateConversationInput)` | Create conversation |
| `findConversationById` | `(db, conversationId: string)` | Get by ID |
| `findConversationsByProject` | `(db, options: {projectId, limit?, offset?})` | List by project |
| `updateConversation` | `(db, conversationId, input)` | Update |
| `deleteConversation` | `(db, conversationId: string)` | Delete |
| `getConversationTurnCount` | `(db, conversationId: string)` | Count turns |

### Turns
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertTurn` | `(db, input: CreateTurnInput)` | Create turn |
| `findTurnByHash` | `(db, turnHash: string)` | Get by hash |
| `findTurnsByConversation` | `(db, {conversationId, limit?})` | List by conversation |
| `findTurnsByProject` | `(db, projectId, limit?, offset?)` | List by project |
| `findLastTurnInConversation` | `(db, conversationId: string)` | Get last turn |
| `findTurnChain` | `(db, turnHash: string)` | Get chain |
| `findTurnsInWindow` | `(db, startHash, endHash)` | Get window |

### Commits
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertCommit` | `(db, input: CreateCommitInput)` | Create commit |
| `findCommitByHash` | `(db, commitHash: string)` | Get by hash |
| `findCommitsByProject` | `(db, {projectId, branch?, limit?})` | List by project |
| `findCommitParents` | `(db, commitHash: string)` | Get parents |
| `findCommitHistory` | `(db, commitHash, limit?)` | Get history |
| `updateCommitPosition` | `(db, commitHash, position)` | Update position |
| `findCommonAncestor` | `(db, hash1, hash2)` | Find common ancestor |

### Branches
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertBranch` | `(db, input: CreateBranchInput)` | Create branch |
| `findBranchByName` | `(db, projectId, name)` | Get by name |
| `findBranchById` | `(db, branchId: string)` | Get by ID |
| `findBranchesByProject` | `(db, {projectId, limit?})` | List by project |
| `findCurrentBranch` | `(db, projectId: string)` | Get current |
| `switchBranch` | `(db, projectId, branchName)` | Switch branch |
| `updateBranchHead` | `(db, branchId, headHash)` | Update head |
| `deleteBranch` | `(db, branchId: string)` | Delete |
| `ensureMainBranch` | `(db, projectId: string)` | Ensure main exists |

### Drafts
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertDraft` | `(db, input: CreateDraftInput)` | Create draft |
| `findDraftById` | `(db, draftId: string)` | Get by ID |
| `findDraftsByProject` | `(db, {projectId, status?, limit?})` | List by project |
| `updateDraft` | `(db, draftId, input)` | Update draft |
| `updateDraftStatus` | `(db, draftId, status)` | Update status |
| `adoptDraft` | `(db, draftId: string)` | Mark as adopted |
| `supersedeDraft` | `(db, draftId: string)` | Mark as superseded |
| `getDraftTextHash` | `(db, draftId: string)` | Get text hash |
| `deleteDraft` | `(db, draftId: string)` | Delete |

### Merge Results
| Function | Signature | Description |
|----------|-----------|-------------|
| `insertMergeResult` | `(db, input)` | Create merge result |
| `findMergeResultById` | `(db, mergeId: string)` | Get by ID |
| `findMergeResultByHashes` | `(db, baseHash, oursHash, theirsHash)` | Get by hashes |
| `findMergeResultsByProject` | `(db, projectId)` | List by project |
| `deleteMergeResult` | `(db, mergeId: string)` | Delete |

### Segment Embeddings
| Function | Signature | Description |
|----------|-----------|-------------|
| `generateSegmentId` | `()` | Generate ID |
| `float32ArrayToBuffer` | `(arr)` | Convert to buffer |
| `bufferToFloat32Array` | `(buf)` | Convert from buffer |
| `insertSegmentEmbedding` | `(db, input)` | Create embedding |
| `insertSegmentEmbeddingsBatch` | `(db, input)` | Batch create |
| `findSegmentEmbeddingById` | `(db, segmentId)` | Get by ID |
| `findSegmentEmbeddingsByTurn` | `(db, turnHash)` | Get by turn |
| `findSegmentEmbeddingsByTurns` | `(db, turnHashes)` | Get by turns |
| `hasEmbeddingsForTurn` | `(db, turnHash)` | Check exists |
| `deleteSegmentEmbeddingsByTurn` | `(db, turnHash)` | Delete by turn |
| `getEmbeddingsCountForTurn` | `(db, turnHash)` | Count |
| `findEmbeddingsByModel` | `(db, model)` | Get by model |

---

## 3. Core Layer Functions (@t3x/core)

### Diff Engine
| Function | Signature | Description |
|----------|-----------|-------------|
| `createDiffEngine` | `(options?)` | Create diff engine |
| `calculateDiffStats` | `(segmentDiffs)` | Calculate stats |

### Merge Engine
| Function | Signature | Description |
|----------|-----------|-------------|
| `createMergeEngine` | `(options?)` | Create merge engine |

### Ring Extractor
| Function | Signature | Description |
|----------|-----------|-------------|
| `createRingExtractor` | `(options?)` | Create extractor |
| `createEmptyRing1` | `()` | Empty Ring1 |
| `createEmptyRing2` | `()` | Empty Ring2 |
| `createEmptyRing3` | `()` | Empty Ring3 |
| `createEmptyRingOutput` | `(turnId)` | Empty output |

### Utilities
| Function | Signature | Description |
|----------|-----------|-------------|
| `canonText` | `(s: string)` | Canonicalize text |
| `hashText` | `(input: string)` | Hash text |
| `sha256` | `(payload: unknown)` | SHA256 hash |
| `cosineSimilarity` | `(vecA, vecB)` | Cosine similarity |

---

## 4. Provider Functions

### LLM Providers
| Function | Signature | Description |
|----------|-----------|-------------|
| `createClaudeProvider` | `(config: ClaudeProviderConfig)` | Create Claude provider |

### Embedding Providers
| Function | Signature | Description |
|----------|-----------|-------------|
| `createGoogleAIEmbeddingProvider` | `(config)` | Create Google AI provider |
| `createCachedEmbeddingProvider` | `(inner, db)` | Wrap with cache |

---

## 5. API Response Field Naming (Current)

### Pattern: snake_case in responses, camelCase internally

```typescript
// Internal (TypeScript/DB)     →  API Response (JSON)
project.projectId               →  project_id
project.createdAt               →  created_at
draft.draftId                   →  draft_id
draft.conversationId            →  conversation_id
draft.baseCommitHash            →  base_commit_hash
turn.turnHash                   →  turn_hash
turn.parentTurnHash             →  parent_turn_hash
commit.commitHash               →  commit_hash
```

---

## 6. Inconsistencies Found

### A. Function Signature Inconsistencies
| Function | Status |
|----------|--------|
| `findTurnsByProject` | `(db, {projectId, limit?, offset?})` ✓ FIXED |
| `findTurnsByConversation` | `(db, {conversationId, limit?})` ✓ |
| `findConversationsByProject` | `(db, {projectId, limit?, offset?})` ✓ |
| `findCommitsByProject` | `(db, {projectId, branch?, limit?})` ✓ |

### B. Route Naming Inconsistencies
| Current | Issue | Proposed |
|---------|-------|----------|
| `/api/v1/agent/drafts` | Nested under `/agent/` | Keep or move to `/api/v1/drafts/agent`? |
| `/api/v1/diff/two-way` | Hyphenated | `/api/v1/diff/two-way` ✓ |
| `/api/v1/branches/switch` | Action as path | Could be `POST /api/v1/branches/current` |

### C. Error Code Naming
| Current | Style |
|---------|-------|
| `INVALID_JSON` | SCREAMING_SNAKE_CASE |
| `NOT_FOUND` | SCREAMING_SNAKE_CASE |
| `DRAFT_CREATE_FAILED` | SCREAMING_SNAKE_CASE |
| `LLM_ERROR` | SCREAMING_SNAKE_CASE |

All error codes use SCREAMING_SNAKE_CASE ✓

---

## 7. Proposed Conventions

### API Routes
- Use plural nouns for resources: `/projects`, `/conversations`, `/turns`
- Use kebab-case for multi-word paths: `/two-way`, `/three-way`
- Use path params for IDs: `/projects/[id]`, `/turns/[hash]`
- Actions as sub-paths: `/branches/switch`, `/merge/resolve`

### Function Naming
- CRUD: `insert*`, `find*`, `update*`, `delete*`
- Single item: `findXxxById`, `findXxxByHash`, `findXxxByName`
- Multiple items: `findXxxsByProject`, `findXxxsByConversation`
- Factory functions: `createXxxEngine`, `createXxxProvider`

### Response Fields
- API responses: snake_case (`project_id`, `created_at`)
- Internal TypeScript: camelCase (`projectId`, `createdAt`)
- Maintain transformation layer between the two

### Error Codes
- SCREAMING_SNAKE_CASE: `INVALID_REQUEST`, `NOT_FOUND`, `LLM_ERROR`

---

## 8. Codebase Audit Results

### Storage Layer (@t3x/storage) ✓ GOOD

**Function Prefix Distribution:**
| Prefix | Count | Status |
|--------|-------|--------|
| `find*` | 29 | ✓ Consistent |
| `insert*` | 9 | ✓ Consistent |
| `update*` | 6 | ✓ Consistent |
| `delete*` | 6 | ✓ Consistent |
| `get*` | 3 | Review: should be `find*`? |
| Other | 6 | Domain-specific (adopt, supersede, etc.) |

**Type Naming:** ✓ All follow patterns
- `Create*Input` (9 types)
- `List*Options` (7 types)
- `Update*Input` (2 types)

**Issues Found:**
| Current | Issue | Recommendation |
|---------|-------|----------------|
| `getConversationTurnCount` | Uses `get*` | Keep (returns computed value, not entity) |
| `getDraftTextHash` | Uses `get*` | Keep (returns computed value) |
| `getEmbeddingsCountForTurn` | Uses `get*` | Keep (returns computed value) |

**Verdict:** `get*` is acceptable for computed/derived values. `find*` for entity retrieval.

---

### API Routes ✓ GOOD

**Error Codes:** All use SCREAMING_SNAKE_CASE
- `INVALID_REQUEST`, `INVALID_JSON`
- `NOT_FOUND`, `BRANCH_NOT_FOUND`
- `*_FAILED` pattern for operation errors
- `*_ERROR` pattern for external service errors

**Response Fields:** All use snake_case
- `project_id`, `conversation_id`, `draft_id`
- `created_at`, `updated_at`, `completed_at`
- `base_commit_hash`, `turn_anchor_hash`

---

### File Naming - NEEDS REVIEW

**Current State:**
| Pattern | Files | Status |
|---------|-------|--------|
| PascalCase components | `Sidebar.tsx`, `NodeModal.tsx` | ✓ React convention |
| camelCase stores | `projectStore.ts`, `canvasStore.ts` | ✓ Good |
| camelCase hooks | `useApi.ts` | ✓ React convention |
| Mixed lib files | `claude.ts`, `db.ts` | Review |

**Recommendations:**
| Current | Proposed | Reason |
|---------|----------|--------|
| `lib/providers/claude.ts` | `lib/providers/claude.provider.ts` | Clarity |
| `lib/providers/embedding.ts` | `lib/providers/embedding.provider.ts` | Clarity |
| `lib/db.ts` | Keep | Short, clear |

---

### Core Package (@t3x/core) - LEGACY CODE

**Note:** Some functions in @t3x/core follow older patterns from SQLite-based storage.
These are being superseded by @t3x/storage (Drizzle-based).

| Legacy Function | Status |
|-----------------|--------|
| `listTurnsV1`, `listDraftsV1` | Deprecated - use @t3x/storage |
| `updateDraftV1` | Deprecated - use @t3x/storage |
| `openDB`, `closeDB`, `getDb` | SQLite-specific, not used by webui |

---

## 9. Summary

### What's Aligned with Industry Standards ✓
1. **Prisma-like query naming**: `find*ById`, `find*sByProject`
2. **REST API conventions**: Plural nouns, kebab-case paths
3. **Response field naming**: Consistent snake_case
4. **Error codes**: Consistent SCREAMING_SNAKE_CASE
5. **Type naming**: `Create*Input`, `List*Options`, `*Response`
6. **Factory pattern**: `create*Engine`, `create*Provider`

### Minor Deviations (Acceptable)
1. **`insert*` vs `create*`**: We use `insert*` for DB ops, `create*` for factories (clearer distinction)
2. **`/branches/switch`**: Verb in path, but acceptable for command endpoints
3. **`get*` for computed values**: Different from `find*` for entities (semantic clarity)

### Action Items
| Priority | Item | Effort |
|----------|------|--------|
| Low | Rename provider files to `*.provider.ts` | Small |
| None | Everything else | Already consistent |

### Conclusion
**The T3X codebase is well-aligned with industry naming conventions.** No major refactoring needed.
