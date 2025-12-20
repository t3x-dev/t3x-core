# T3X Naming Convention Audit

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
