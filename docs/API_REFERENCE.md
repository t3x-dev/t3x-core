# T3X API & Function Reference

A comprehensive dictionary of all APIs, functions, and their locations for project owners.

**Last Updated:** 2024-12-21

---

## Table of Contents

1. [API Endpoints](#1-api-endpoints)
2. [Storage Layer (@t3x/storage)](#2-storage-layer-t3xstorage)
3. [Core Layer (@t3x/core)](#3-core-layer-t3xcore)
4. [Provider Layer (lib/providers)](#4-provider-layer-libproviders)
5. [React Hooks](#5-react-hooks)
6. [State Stores](#6-state-stores)

---

## 1. API Endpoints

**Base URL:** `/api/v1`
**Location:** `t3x-webui/src/app/api/v1/`

### Projects

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/projects` | List all projects | `projects/route.ts` |
| POST | `/projects` | Create a project | `projects/route.ts` |
| GET | `/projects/{id}` | Get project by ID | `projects/[id]/route.ts` |
| PUT | `/projects/{id}` | Update project | `projects/[id]/route.ts` |
| DELETE | `/projects/{id}` | Delete project | `projects/[id]/route.ts` |

### Conversations

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/conversations` | List conversations | `conversations/route.ts` |
| POST | `/conversations` | Create conversation | `conversations/route.ts` |
| GET | `/conversations/{id}` | Get conversation | `conversations/[id]/route.ts` |
| PUT | `/conversations/{id}` | Update conversation | `conversations/[id]/route.ts` |
| DELETE | `/conversations/{id}` | Delete conversation | `conversations/[id]/route.ts` |

### Turns

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/turns` | List turns | `turns/route.ts` |
| POST | `/turns` | Create turn | `turns/route.ts` |
| GET | `/turns/{hash}` | Get turn by hash | `turns/[hash]/route.ts` |
| GET | `/turns/{hash}/chain` | Get turn chain | `turns/[hash]/chain/route.ts` |

### Commits

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/commits` | List commits | `commits/route.ts` |
| POST | `/commits` | Create commit | `commits/route.ts` |
| GET | `/commits/{hash}` | Get commit by hash | `commits/[hash]/route.ts` |

### Branches

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/branches` | List branches | `branches/route.ts` |
| POST | `/branches` | Create branch | `branches/route.ts` |
| GET | `/branches/current` | Get current branch | `branches/current/route.ts` |
| POST | `/branches/switch` | Switch branch | `branches/switch/route.ts` |

### Drafts

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/drafts` | List drafts | `drafts/route.ts` |
| POST | `/drafts` | Create draft | `drafts/route.ts` |
| GET | `/drafts/{id}` | Get draft | `drafts/[id]/route.ts` |
| DELETE | `/drafts/{id}` | Delete draft | `drafts/[id]/route.ts` |

### Agent Drafts (LLM-powered)

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/agent/drafts` | Create draft with LLM | `agent/drafts/route.ts` |
| GET | `/agent/drafts/{id}` | Get agent draft | `agent/drafts/[id]/route.ts` |
| PATCH | `/agent/drafts/{id}` | Regenerate with feedback | `agent/drafts/[id]/route.ts` |

### Diff

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/diff/two-way` | Two-way semantic diff | `diff/two-way/route.ts` |
| POST | `/diff/three-way` | Three-way semantic diff | `diff/three-way/route.ts` |

### Merge

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/merge` | Three-way merge | `merge/route.ts` |
| POST | `/merge/resolve` | Resolve conflicts | `merge/resolve/route.ts` |

### Chat

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| POST | `/chat` | Chat completion | `chat/route.ts` |
| POST | `/chat/stream` | Streaming chat | `chat/stream/route.ts` |
| GET | `/chat/providers` | List providers | `chat/providers/route.ts` |

### Export

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/export/cfpack` | Export as .cfpack | `export/cfpack/route.ts` |
| GET | `/export/ledger` | Export as JSONL | `export/ledger/route.ts` |

### System

| Method | Endpoint | Description | File |
|--------|----------|-------------|------|
| GET | `/health` | Health check | `health/route.ts` |
| GET | `/status` | System status | `status/route.ts` |

---

## 2. Storage Layer (@t3x/storage)

**Location:** `t3x-storage/src/queries/`
**Import:** `import { ... } from '@t3x/storage'`

### Projects (`projects.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertProject` | `(db, input: CreateProjectInput)` | Create a new project |
| `findProjectById` | `(db, projectId: string)` | Get project by ID |
| `findProjects` | `(db, options: ListProjectsOptions)` | List projects with pagination |
| `findProjectWithStats` | `(db, projectId: string)` | Get project with statistics |
| `updateProject` | `(db, projectId, input)` | Update project fields |
| `deleteProject` | `(db, projectId: string)` | Delete project |

**Types:**
- `CreateProjectInput` - `{ name, description?, metadata? }`
- `ListProjectsOptions` - `{ limit?, offset?, orderBy? }`
- `ProjectStats` - `{ conversationCount, turnCount, commitCount }`
- `ProjectWithStats` - `Project & { stats: ProjectStats }`

### Conversations (`conversations.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertConversation` | `(db, input: CreateConversationInput)` | Create conversation |
| `findConversationById` | `(db, conversationId: string)` | Get by ID |
| `findConversationsByProject` | `(db, { projectId, limit?, offset? })` | List by project |
| `updateConversation` | `(db, conversationId, input)` | Update conversation |
| `deleteConversation` | `(db, conversationId: string)` | Delete conversation |
| `getConversationTurnCount` | `(db, conversationId: string)` | Count turns |

**Types:**
- `CreateConversationInput` - `{ projectId, title?, metadata? }`
- `ListConversationsOptions` - `{ projectId, limit?, offset? }`
- `UpdateConversationInput` - `{ title?, metadata? }`

### Turns (`turns.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertTurn` | `(db, input: CreateTurnInput)` | Create turn (auto-hashes) |
| `findTurnByHash` | `(db, turnHash: string)` | Get by hash |
| `findTurnsByConversation` | `(db, { conversationId, limit?, order? })` | List by conversation |
| `findTurnsByProject` | `(db, { projectId, limit?, offset? })` | List by project |
| `findLastTurnInConversation` | `(db, conversationId: string)` | Get last turn |
| `findTurnChain` | `(db, turnHash: string)` | Get ancestor chain |
| `findTurnsInWindow` | `(db, startHash, endHash)` | Get turns in range |

**Types:**
- `CreateTurnInput` - `{ projectId, conversationId, role, content, language?, rings? }`
- `ListTurnsOptions` - `{ conversationId, limit?, offset?, order? }`
- `ListTurnsByProjectOptions` - `{ projectId, limit?, offset? }`

### Commits (`commits.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertCommit` | `(db, input: CreateCommitInput)` | Create commit |
| `findCommitByHash` | `(db, commitHash: string)` | Get by hash |
| `findCommitsByProject` | `(db, { projectId, branch?, limit? })` | List by project |
| `findCommitParents` | `(db, commitHash: string)` | Get parent commits |
| `findCommitHistory` | `(db, commitHash, limit?)` | Get commit history |
| `updateCommitPosition` | `(db, commitHash, position)` | Update DAG position |
| `findCommonAncestor` | `(db, hash1, hash2)` | Find merge base |

**Types:**
- `CreateCommitInput` - `{ projectId, branch, message, parentHashes, turnWindow, ... }`
- `ListCommitsOptions` - `{ projectId, branch?, limit?, offset? }`
- `TurnWindow` - `{ startTurnHash, endTurnHash }`

### Branches (`branches.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertBranch` | `(db, input: CreateBranchInput)` | Create branch |
| `findBranchByName` | `(db, projectId, name)` | Get by name |
| `findBranchById` | `(db, branchId: string)` | Get by ID |
| `findBranchesByProject` | `(db, { projectId, limit? })` | List by project |
| `findCurrentBranch` | `(db, projectId: string)` | Get active branch |
| `switchBranch` | `(db, projectId, branchName)` | Switch active branch |
| `updateBranchHead` | `(db, branchId, headHash)` | Update HEAD |
| `deleteBranch` | `(db, branchId: string)` | Delete branch |
| `ensureMainBranch` | `(db, projectId: string)` | Create main if missing |

**Types:**
- `CreateBranchInput` - `{ projectId, name, headCommitHash? }`
- `ListBranchesOptions` - `{ projectId, limit?, offset? }`

### Drafts (`drafts.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertDraft` | `(db, input: CreateDraftInput)` | Create draft |
| `findDraftById` | `(db, draftId: string)` | Get by ID |
| `findDraftsByProject` | `(db, { projectId, status?, limit? })` | List by project |
| `updateDraft` | `(db, draftId, input)` | Update draft content |
| `updateDraftStatus` | `(db, draftId, status)` | Change status |
| `adoptDraft` | `(db, draftId: string)` | Mark as adopted |
| `supersedeDraft` | `(db, draftId: string)` | Mark as superseded |
| `getDraftTextHash` | `(db, draftId: string)` | Get content hash |
| `deleteDraft` | `(db, draftId: string)` | Delete draft |

**Types:**
- `CreateDraftInput` - `{ projectId, conversationId, bridgeId, bridgePayload, text, ... }`
- `ListDraftsOptions` - `{ projectId, status?, limit?, offset? }`
- `UpdateDraftInput` - `{ text?, mustHave?, bridgePayload?, completedAt? }`
- `DraftStatus` - `'ephemeral' | 'adopted' | 'superseded'`

### Merge Results (`mergeResults.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `insertMergeResult` | `(db, input)` | Store merge result |
| `findMergeResultById` | `(db, mergeId: string)` | Get by ID |
| `findMergeResultByHashes` | `(db, baseHash, oursHash, theirsHash)` | Get by commit hashes |
| `findMergeResultsByProject` | `(db, projectId)` | List by project |
| `deleteMergeResult` | `(db, mergeId: string)` | Delete result |

**Types:**
- `CreateMergeResultInput` - `{ projectId, baseHash, oursHash, theirsHash, ... }`
- `MergeStatus` - `'pending' | 'resolved' | 'committed'`

### Segment Embeddings (`segmentEmbeddings.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateSegmentId` | `(turnHash, segmentIndex)` | Generate segment ID |
| `float32ArrayToBuffer` | `(arr: number[])` | Convert to buffer |
| `bufferToFloat32Array` | `(buf: Buffer)` | Convert from buffer |
| `insertSegmentEmbedding` | `(db, input)` | Store embedding |
| `insertSegmentEmbeddingsBatch` | `(db, input)` | Batch store |
| `findSegmentEmbeddingById` | `(db, segmentId)` | Get by ID |
| `findSegmentEmbeddingsByTurn` | `(db, turnHash)` | Get by turn |
| `findSegmentEmbeddingsByTurns` | `(db, turnHashes[])` | Get by multiple turns |
| `hasEmbeddingsForTurn` | `(db, turnHash)` | Check if exists |
| `deleteSegmentEmbeddingsByTurn` | `(db, turnHash)` | Delete by turn |
| `getEmbeddingsCountForTurn` | `(db, turnHash)` | Count embeddings |
| `findEmbeddingsByModel` | `(db, model)` | Get by model name |

---

## 3. Core Layer (@t3x/core)

**Location:** `t3x-core/src/`
**Import:** `import { ... } from '@t3x/core'`

### Diff Engine (`diff/`)

| Export | Type | Description |
|--------|------|-------------|
| `DiffEngine` | Class | Semantic diff engine |
| `createDiffEngine` | Factory | `(config?) => DiffEngine` |
| `calculateDiffStats` | Function | Compute diff statistics |
| `DiffType` | Enum | `added`, `removed`, `modified`, `unchanged` |
| `SegmentDiff` | Type | Single segment diff result |
| `DiffResult` | Type | Full diff output |
| `DiffStats` | Type | Statistics summary |

**Usage:**
```typescript
const engine = createDiffEngine({ similarityThreshold: 0.8 });
const result = engine.computeTwoWay(baseSegments, targetSegments);
const threeWay = engine.computeThreeWay(base, ours, theirs);
```

### Merge Engine (`merge/`)

| Export | Type | Description |
|--------|------|-------------|
| `MergeEngine` | Class | Three-way merge engine |
| `createMergeEngine` | Factory | `(options?) => MergeEngine` |
| `ConflictType` | Enum | `content`, `structure`, `semantic` |
| `MergeConflict` | Type | Conflict details |
| `MergeResult` | Type | Full merge output |
| `MergeStats` | Type | Statistics summary |

**Usage:**
```typescript
const engine = createMergeEngine({ autoResolve: true });
const result = engine.merge(baseFacets, oursFacets, theirsFacets);
const resolved = engine.resolveConflicts(result, resolutions);
```

### Ring Extractors (`extractors/`)

| Export | Type | Description |
|--------|------|-------------|
| `RingExtractor` | Class | Semantic extraction |
| `createRingExtractor` | Factory | `(config?) => RingExtractor` |
| `PolarityRuleEngine` | Class | Polarity detection |
| `createPolarityRuleEngine` | Factory | `() => PolarityRuleEngine` |
| `Ring1Output` | Type | Keywords, entities, temporal |
| `Ring2Output` | Type | Intent, relations, facets |
| `Ring3Output` | Type | Sentence segments |
| `RingOutput` | Type | Combined ring output |
| `createEmptyRing1/2/3` | Functions | Create empty ring objects |

**Usage:**
```typescript
const extractor = createRingExtractor({ nlpProvider });
const rings = await extractor.extract(text);
```

### Provider Interfaces (`providers/`, `llm/`)

| Export | Type | Description |
|--------|------|-------------|
| `NLPProvider` | Interface | NLP analysis provider |
| `NLPProviderError` | Class | NLP error type |
| `EmbeddingProvider` | Interface | Text embedding provider |
| `EmbeddingProviderError` | Class | Embedding error type |
| `LLMProvider` | Interface | Language model provider |
| `LLMProviderError` | Class | LLM error type |
| `cosineSimilarity` | Function | `(vecA, vecB) => number` |

### Utilities (`common/`)

| Export | Type | Description |
|--------|------|-------------|
| `canonText` | Function | Canonicalize text |
| `hashText` | Function | Hash text content |
| `sha256` | Function | SHA-256 hash |
| `computeTurnHash` | Function | Generate turn hash |
| `computeTextHash` | Function | Generate content hash |
| `generateProjectId` | Function | Generate project ID |
| `generateDraftId` | Function | Generate draft ID |

---

## 4. Provider Layer (lib/providers)

**Location:** `t3x-webui/src/lib/providers/`
**Import:** `import { ... } from '@/lib/providers'`

### Claude Provider (`claude.provider.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `ClaudeProvider` | Class | Claude API wrapper |
| `createClaudeProvider` | Factory | `(config) => ClaudeProvider` |
| `ClaudeProviderConfig` | Type | `{ apiKey, model?, baseUrl? }` |

**Usage:**
```typescript
const provider = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5-20250929',
});
const response = await provider.generate(prompt, { temperature: 0.7 });
```

### Embedding Providers (`embedding.provider.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `GoogleAIEmbeddingProvider` | Class | Google AI embeddings |
| `createGoogleAIEmbeddingProvider` | Factory | `(config) => GoogleAIEmbeddingProvider` |
| `CachedEmbeddingProvider` | Class | Caching wrapper |
| `createCachedEmbeddingProvider` | Factory | `(inner, db) => CachedEmbeddingProvider` |

**Usage:**
```typescript
const googleProvider = createGoogleAIEmbeddingProvider({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});
const cached = createCachedEmbeddingProvider(googleProvider, db);
const embeddings = await cached.embedBatch(texts);
```

---

## 5. React Hooks

**Location:** `t3x-webui/src/hooks/`

| Hook | File | Description |
|------|------|-------------|
| `useApi` | `useApi.ts` | API client with error handling |

**Usage:**
```typescript
const { data, loading, error, refetch } = useApi('/api/v1/projects');
```

---

## 6. State Stores

**Location:** `t3x-webui/src/store/`
**Library:** Zustand

| Store | File | Description |
|-------|------|-------------|
| `useProjectStore` | `projectStore.ts` | Project state management |
| `useCanvasStore` | `canvasStore.ts` | Canvas/node state |
| `useAgentDemoStore` | `agentDemoStore.ts` | Agent demo state |

**Usage:**
```typescript
const { projects, currentProject, setCurrentProject } = useProjectStore();
const { nodes, edges, addNode, updateNode } = useCanvasStore();
```

---

## Quick Lookup by Task

### "I want to..."

| Task | Function/Endpoint |
|------|-------------------|
| Create a project | `POST /projects` → `insertProject()` |
| List all projects | `GET /projects` → `findProjects()` |
| Add a conversation turn | `POST /turns` → `insertTurn()` |
| Get conversation history | `GET /turns?conversation_id=X` → `findTurnsByConversation()` |
| Compare two versions | `POST /diff/two-way` → `DiffEngine.computeTwoWay()` |
| Merge branches | `POST /merge` → `MergeEngine.merge()` |
| Generate with LLM | `POST /agent/drafts` → `ClaudeProvider.generate()` |
| Export project | `GET /export/cfpack` → (route handler) |
| Get embeddings | `CachedEmbeddingProvider.embedBatch()` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-21 | Initial version |
