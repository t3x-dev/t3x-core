# T3X Product Overview: Engineering & Implementation Layer

> This document describes T3X's codebase structure, specific file
> implementations, testing strategy, deployment configuration,
> development workflow, and tooling — for someone who cannot read the
> source code but needs to understand how the system is built and
> maintained.
>
> Last updated: 2026-02-09

---

## Table of Contents

1. [Technology Stack](#1-technology-stack)
2. [Package-by-Package Implementation](#2-package-by-package-implementation)
3. [API Server Implementation](#3-api-server-implementation)
4. [WebUI Implementation](#4-webui-implementation)
5. [Runner Implementation](#5-runner-implementation)
6. [CLI Implementation](#6-cli-implementation)
7. [Testing Strategy](#7-testing-strategy)
8. [Build System & Tooling](#8-build-system--tooling)
9. [Docker & Deployment](#9-docker--deployment)
10. [Development Workflow](#10-development-workflow)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [Known Pitfalls & Debugging](#12-known-pitfalls--debugging)

---

## 1. Technology Stack

### 1.1 Core Technologies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Language** | TypeScript | 5.x | All packages and apps |
| **Runtime** | Node.js | 20+ | Server-side execution |
| **Package Manager** | pnpm | 9.x | Monorepo workspace management |
| **Monorepo** | Turborepo | 2.x | Build orchestration & caching |
| **Linter/Formatter** | Biome | 1.x | Replaces ESLint + Prettier |

### 1.2 Frontend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16 | React framework (App Router) |
| React | 19 | UI library |
| XYFlow (ReactFlow) | 12.x | Canvas graph visualization |
| Tailwind CSS | 4.x | Utility-first CSS |
| shadcn/ui | — | Component library (Radix + Tailwind) |
| Zustand | 5.x | State management |
| Framer Motion | 12.x | Animations |
| Lucide | — | Icon library |
| next-themes | — | Dark/light theme |
| ELK.js | — | Graph auto-layout |

### 1.3 Backend Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Hono | 4.x | HTTP framework (API server) |
| @hono/zod-openapi | 1.x | OpenAPI schema generation |
| @scalar/hono-api-reference | — | Interactive API docs |
| Drizzle ORM | 0.38+ | Database access layer |
| PGLite | — | In-process PostgreSQL (WASM) |
| PostgreSQL | 16 | Production database |
| Zod | 3.x | Schema validation |

### 1.4 Runner Stack

| Technology | Purpose |
|-----------|---------|
| Express | HTTP server for Runner |
| pino + pino-pretty | Structured logging |
| js-yaml | YAML rule file parsing |
| node-fetch | HTTP client for n8n/Engine |
| @anthropic-ai/sdk | LLM assertions (optional) |

### 1.5 CLI Stack

| Technology | Purpose |
|-----------|---------|
| Commander.js | CLI framework |
| chalk | Colored terminal output |
| ora | Loading spinners |
| table | ASCII table formatting |
| @t3x/api-client | Type-safe API calls |

### 1.6 Testing Stack

| Technology | Purpose |
|-----------|---------|
| Vitest | Unit and integration testing |
| Playwright | End-to-end browser testing |
| PGLite (test mode) | Isolated test databases |
| vi.mock() | Module mocking |
| @testing-library/react | React component testing |

---

## 2. Package-by-Package Implementation

### 2.1 @t3x/core (`packages/core/`)

The deterministic semantic engine. Zero external dependencies on LLMs.

#### File Structure

```
packages/core/src/
├── common/
│   ├── hash.ts              # SHA-256, hashText, computeCommitV3Hash
│   ├── canon.ts             # canonText — NFKC normalize, lowercase, trim
│   └── stopwords.ts         # 270+ English stop words list
│
├── extractors/
│   ├── ringExtractor.ts     # Main RingExtractor class
│   ├── types.ts             # RingOutput, Ring1/2/3 types
│   ├── polarityRules.ts     # Verb polarity rule engine
│   └── anchorCandidates.ts  # Phrase pattern matching for anchors
│
├── diff/
│   ├── diffCommits.ts       # Main 4-stage diff pipeline
│   ├── jaccard.ts           # Jaccard similarity + threshold constant
│   ├── hungarian.ts         # Kuhn-Munkres optimal matching
│   ├── lcs.ts               # Longest Common Subsequence + wordDiff
│   └── tokenize.ts          # Word tokenization for diff
│
├── merge/
│   ├── prepareMerge.ts      # Phase 1: analyze and prepare merge
│   └── executeMerge.ts      # Phase 2: apply decisions and create commit
│
├── context/
│   └── builder.ts           # buildConversationContext, buildLeafContext
│
├── leaf/
│   ├── generate.ts          # generateLeafOutput with auto-retry
│   ├── build-prompt.ts      # buildLeafPrompt, formatConstraints
│   └── validate-constraints.ts  # Exact + semantic validation
│
├── storage/
│   └── hash-v4.ts           # computeCommitV4Hash
│
├── types/
│   ├── index.ts             # Re-exports
│   ├── v4/
│   │   └── index.ts         # CommitV4, Sentence, Leaf, Pin, Constraint,
│   │                        # Assertion, ConversationContext, BuiltContext
│   └── v3/
│       └── index.ts         # CommitV3 (legacy types)
│
└── index.ts                 # Package entry point (re-exports everything)
```

#### Key Constants

```typescript
// diff/jaccard.ts
JACCARD_THRESHOLD = 0.3          // Min word overlap for "similar"

// leaf/validate-constraints.ts
SEMANTIC_REQUIRE_THRESHOLD = 0.85 // Cosine sim for require
SEMANTIC_EXCLUDE_THRESHOLD = 0.70 // Cosine sim for exclude

// leaf/generate.ts
MAX_GENERATION_ATTEMPTS = 3       // Auto-retry count
DEFAULT_MODEL = "claude-sonnet-4-20250514"
DEFAULT_TEMPERATURE = 0.7

// extractors/ringExtractor.ts
MIN_ENTITY_SALIENCE = 0.01       // Min NLP entity confidence
KEYWORD_POS_TAGS = ["NOUN", "PROPN", "VERB", "ADJ"]
```

#### Key Exports

The package exports approximately 40 functions and types:

**Functions:**
- `sha256(payload)`, `hashText(text)`, `canonText(text)`
- `computeCommitV3Hash(commit)`, `computeCommitV4Hash(commit)`
- `diffCommits(source, target)`, `jaccard(a, b)`, `wordDiff(from, to)`
- `prepareMerge(source, target)`, `executeMerge(prepared, ...)`
- `buildConversationContext(input)`, `buildLeafContext(commit)`
- `generateLeafOutput(options)`, `buildLeafPrompt(options)`
- `validateConstraints(options)`, `validateConstraintsExactOnly(output, constraints)`
- `RingExtractor` class

**Types:**
- `CommitV4`, `CommitV3`, `Sentence`, `Leaf`, `Pin`, `Constraint`
- `Assertion`, `ConversationContext`, `BuiltContext`
- `CommitDiff`, `SentencePair`, `WordDiffSegment`
- `Merge2WayResult`, `MergeSimilarPair`, `MergeCandidate`
- `RingOutput`, `Ring1Data`, `Ring2Data`, `Ring3Data`

### 2.2 @t3x/storage (`packages/storage/`)

PostgreSQL persistence layer with Drizzle ORM.

#### File Structure

```
packages/storage/src/
├── adapters/
│   ├── pglite.ts            # PGLite adapter (WASM PostgreSQL)
│   ├── postgres.ts          # Standard PostgreSQL adapter
│   └── supabase.ts          # Supabase adapter
│
├── queries/
│   ├── projects.ts          # 6 functions: insert, find, findAll, update, delete, findWithStats
│   ├── conversations.ts     # 6 functions: insert, find, findByProject, update, delete, getTurnCount
│   ├── turns.ts             # 7 functions: insert, find, findByConv, findByProject, findLast, findChain, findWindow
│   ├── branches.ts          # 9 functions: insert, findByName, findById, findByProject, findCurrent,
│   │                        #              switch, updateHead, delete, ensureMain
│   ├── commits-v3.ts        # 9 functions: create, get, list, updatePosition, delete, getParents,
│   │                        #              getByHashes, findHistory, findCommonAncestor
│   ├── commits-v4.ts        # 11 functions: create, find, findByProject, findByBranch, updatePosition,
│   │                        #               delete, getByHashes, getParents, findHistory,
│   │                        #               validateMainBranchLinearity, computeHash
│   ├── leaves.ts            # 10 functions: create, find, findByCommit, findByProject, update,
│   │                        #               updateOutput, updateAtomic, updateAssertions, delete, getByIds
│   ├── pins.ts              # 9 functions: create, find, findByProject, findByRef, updateAssertions,
│   │                        #              delete, deleteByRef, getByIds, findByType
│   ├── conversation-contexts.ts # 3 functions: get, set, delete
│   ├── leaf-history.ts      # 6 functions: create, find, findByLeaf, count, delete, deleteByLeaf
│   ├── drafts.ts            # 9 functions: insert, find, findByProject, update, updateStatus,
│   │                        #              adopt, supersede, getTextHash, delete
│   ├── merge-drafts.ts      # 7 functions: create, get, list, update, commit, cancel, delete,
│   │                        #              findPending
│   ├── deployAgents.ts      # 6 functions: insert, find, findAll, update, delete, updateRunStatus
│   ├── runs.ts              # 10 functions: insert, get, list, update, getByRunnerRunId, delete,
│   │                        #               getTimedOut, markTimeout, getFilterOptions, getConfigStats
│   └── segmentEmbeddings.ts # 9 functions: insert, insertBatch, find, findByTurn, findByTurns,
│                            #              hasForTurn, delete, count, findByModel
│
├── migrations/
│   └── migrate-v2-to-v3.ts  # V2→V3 commit migration script
│
├── schema.ts                # Legacy table definitions (projects, conversations, turns_v2,
│                            # branches, commits_v2, commits_v3, drafts_v2, merge_drafts,
│                            # deploy_agents, runs, segment_embeddings)
│
├── schema-v4.ts             # V4 table definitions (commits_v4, leaves, leaf_history,
│                            # pins, conversation_contexts)
│
└── index.ts                 # Re-exports all adapters, queries, schemas, types
```

#### Query Function Pattern

All query functions follow the same signature pattern:

```typescript
async function queryName(
  db: AnyDB,           // Database instance (PGLite, Postgres, or Supabase)
  ...params            // Function-specific parameters
): Promise<ReturnType> // Typed return value
```

`AnyDB` is a union type of all supported database adapters, allowing
the same queries to work with any backend.

#### Total Query Count

The storage package exports approximately **117 query functions** across
14 query files, plus 3 adapter creation functions, schema definitions,
and TypeScript types.

### 2.3 @t3x/api-client (`packages/api-client/`)

Type-safe HTTP client for the T3X API.

```
packages/api-client/src/
├── client.ts            # Main client class
├── types.ts             # Request/response types
└── index.ts             # Exports
```

Used by the CLI package to make API calls with proper typing.

### 2.4 @t3x/runner (shared) (`packages/runner/`)

Shared schemas and types for the Runner, used by both `apps/runner`
and `apps/api`.

```
packages/runner/src/
├── schemas.ts           # Zod schemas for RunRecord, StepRecord, EvalRules, etc.
├── types.ts             # TypeScript types derived from schemas
└── index.ts             # Exports
```

---

## 3. API Server Implementation

### 3.1 File Structure

```
apps/api/src/
├── index.ts                 # Entry point: create Hono app, mount routes, start server
│
├── routes/
│   ├── projects.openapi.ts  # Project CRUD (5 endpoints)
│   ├── conversations.openapi.ts  # Conversation CRUD + context (8 endpoints)
│   ├── turns.openapi.ts     # Turn CRUD + chain + context (4 endpoints)
│   ├── commits-v3.openapi.ts # V3 commits (3 endpoints, legacy)
│   ├── commits-v4.openapi.ts # V4 commits (6 endpoints)
│   ├── leaves.openapi.ts    # Leaf CRUD + generate + validate + batch (10 endpoints)
│   ├── pins.openapi.ts      # Pin CRUD (5 endpoints)
│   ├── branches.openapi.ts  # Branch CRUD + switch (4 endpoints)
│   ├── diff.openapi.ts      # Two-way + three-way diff (2 endpoints)
│   ├── merge.openapi.ts     # Prepare + execute + drafts (5 endpoints)
│   ├── chat.openapi.ts      # Chat + stream + providers (3 endpoints)
│   ├── drafts.openapi.ts    # Agent draft generation (3 endpoints)
│   ├── curate.openapi.ts    # Curate preview (1 endpoint)
│   ├── export.openapi.ts    # CFPack + ledger export (2 endpoints)
│   ├── deploy-agents.openapi.ts  # Deploy agent CRUD (5 endpoints)
│   ├── runs.openapi.ts      # Runs CRUD + compare + filters (8 endpoints)
│   └── runner.openapi.ts    # Runner proxy endpoints (6 endpoints)
│
├── schemas/
│   ├── v4-contracts.ts      # V4 API contracts (Zod schemas for request/response)
│   ├── common.ts            # Shared error/success response schemas
│   └── pagination.ts        # Pagination query param schemas
│
├── middleware/
│   ├── cors.ts              # CORS middleware (localhost + configurable origins)
│   └── logger.ts            # Request logging middleware
│
├── lib/
│   ├── db.ts                # Database singleton (PGLite or Postgres based on env)
│   └── runner-client.ts     # HTTP client for Runner service
│
└── __tests__/               # API route tests
    ├── projects.test.ts
    ├── conversations.test.ts
    ├── turns.test.ts
    ├── commits-v3.test.ts
    ├── commits-v4.test.ts
    ├── leaves.test.ts
    ├── pins.test.ts
    ├── branches.test.ts
    ├── diff.test.ts
    ├── merge.test.ts
    ├── chat.test.ts
    ├── runs.test.ts
    └── deploy-agents.test.ts
```

### 3.2 Route Definition Pattern

All routes use the `@hono/zod-openapi` pattern:

```typescript
// 1. Define the route with OpenAPI spec
const getProject = createRoute({
  method: 'get',
  path: '/api/v1/projects/{id}',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ProjectResponseSchema } },
      description: 'Project found',
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Project not found',
    },
  },
})

// 2. Implement the handler
app.openapi(getProject, async (c) => {
  const { id } = c.req.valid('param')
  const db = await getDB()
  const project = await findProjectById(db, id)
  if (!project) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '...' } }, 404)
  }
  return c.json({ success: true, data: project }, 200)
})
```

### 3.3 Database Initialization

```typescript
// apps/api/src/lib/db.ts
let dbInstance: AnyDB | null = null

export async function getDB(): Promise<AnyDB> {
  if (dbInstance) return dbInstance

  if (process.env.DATABASE_URL) {
    // Production: connect to PostgreSQL
    dbInstance = await createPostgresStorage({
      connectionString: process.env.DATABASE_URL
    })
  } else {
    // Development: use PGLite (in-process WASM PostgreSQL)
    dbInstance = await createPGLiteStorage({
      dataDir: '.t3x/database'
    })
  }
  return dbInstance
}
```

### 3.4 Server Startup

```typescript
// apps/api/src/index.ts
const app = new OpenAPIHono()

// Middleware
app.use('*', corsMiddleware)
app.use('*', loggerMiddleware)

// Mount routes
app.route('/', projectRoutes)
app.route('/', conversationRoutes)
app.route('/', turnRoutes)
// ... all other routes

// OpenAPI docs
app.doc('/api/openapi.json', { openapi: '3.1.0', info: { title: 'T3X API', version: '1.0.0' } })
app.get('/api/docs', apiReference({ spec: { url: '/api/openapi.json' } }))

// Start server
serve({ fetch: app.fetch, port: Number(process.env.PORT || 8000) })
```

---

## 4. WebUI Implementation

### 4.1 File Structure

```
apps/web/src/
├── app/                              # Next.js App Router pages
│   ├── layout.tsx                    # Root layout (ThemeProvider, font)
│   ├── page.tsx                      # Home/projects page
│   ├── project/
│   │   └── [projectId]/
│   │       ├── page.tsx              # Canvas workspace
│   │       ├── leaf/[leafId]/
│   │       │   └── page.tsx          # Leaf detail
│   │       ├── merge/[mergeId]/
│   │       │   └── page.tsx          # Merge workspace
│   │       └── conversation/[conversationId]/
│   │           └── page.tsx          # Conversation detail
│   ├── insights/
│   │   └── page.tsx                  # Cross-project analytics
│   ├── deploy/
│   │   ├── page.tsx                  # Deploy dashboard
│   │   ├── [runId]/
│   │   │   └── page.tsx              # Run detail
│   │   └── compare/
│   │       └── page.tsx              # A/B comparison
│   ├── eval/[runId]/
│   │   └── page.tsx                  # Evaluation results
│   ├── agent-demo/
│   │   ├── chat/page.tsx             # Agent chat demo
│   │   └── optimiser/page.tsx        # Agent optimiser
│   ├── dev/db/page.tsx               # DB inspector (dev only)
│   ├── test-source-context/page.tsx  # Component test page
│   └── api/                          # Next.js API routes (minimal)
│       ├── v1/chat/stream/route.ts   # Chat streaming proxy
│       └── dev/sql/route.ts          # SQL query (dev only)
│
├── components/
│   ├── ui/                           # shadcn/ui base components (~30 files)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── textarea.tsx
│   │   ├── toast.tsx
│   │   ├── tooltip.tsx
│   │   └── ... (more shadcn components)
│   │
│   ├── canvas/                       # Canvas workspace components (~21 files)
│   │   ├── CanvasWorkspace.tsx        # Main canvas container (XYFlow provider)
│   │   ├── CanvasFlow.tsx             # XYFlow graph rendering
│   │   ├── ConversationNode.tsx       # Conversation node type
│   │   ├── CommitNode.tsx             # Commit node type (V3/V4)
│   │   ├── LeafNode.tsx               # Leaf node type
│   │   ├── NodeDetailModal.tsx        # Click-to-open node detail
│   │   ├── NodePalette.tsx            # Right-side creation palette
│   │   ├── CanvasControls.tsx         # Bottom control bar
│   │   ├── BranchFilter.tsx           # Branch selector
│   │   ├── CreateCommitModal.tsx      # Commit creation dialog
│   │   ├── CreateConversationModal.tsx # Conversation creation dialog
│   │   ├── CreateLeafModal.tsx        # Leaf creation dialog
│   │   ├── DeleteNodeDialog.tsx       # Delete confirmation
│   │   ├── MemoryContextModal.tsx     # Memory/context viewer
│   │   ├── MergeInitiateModal.tsx     # Merge initiation dialog
│   │   ├── DraftCommitPanel.tsx       # Pending commit editor
│   │   ├── CommitSourceContext.tsx    # Source context in commit modal
│   │   ├── KeyboardShortcuts.tsx      # Shortcut help overlay
│   │   ├── ExecutionModeView.tsx      # Placeholder for v2.0
│   │   ├── CustomEdge.tsx             # Styled edge component
│   │   └── index.ts                   # Barrel exports
│   │
│   ├── merge/                        # Merge workspace components (~16 files)
│   │   ├── MergeWorkspace.tsx         # Full-screen merge page layout
│   │   ├── MergeHeader.tsx            # Source/target info + actions
│   │   ├── MergeProgress.tsx          # Resolution progress bar
│   │   ├── IdenticalSection.tsx       # Auto-kept sentences section
│   │   ├── SimilarPairsSection.tsx    # Conflict resolution section
│   │   ├── OnlyInSection.tsx          # Unique sentences section
│   │   ├── SentenceCard.tsx           # Individual sentence display
│   │   ├── ResolutionButtons.tsx      # Source/Target/Both/Edit buttons
│   │   ├── WordDiffDisplay.tsx        # Word-level diff highlighting
│   │   ├── EditResolutionModal.tsx    # Custom text editor for "Edit" resolution
│   │   ├── MergeSourceContext.tsx     # Source context for merge sentences
│   │   ├── MergeCommitDialog.tsx      # Final commit dialog
│   │   ├── MergeCancelDialog.tsx      # Cancel confirmation
│   │   ├── MergeStats.tsx             # Merge statistics summary
│   │   ├── EmptyMerge.tsx             # No conflicts state
│   │   └── index.ts
│   │
│   ├── leaf/                         # Leaf components (~2 files)
│   │   ├── LeafConstraintSourceContext.tsx  # Source context for constraints
│   │   └── LeafConstraintSelector.tsx      # Constraint creation UI
│   │
│   ├── conversation/                 # Conversation components (~3 files)
│   │   ├── ContextPanelWrapper.tsx    # Memory context sidebar
│   │   ├── ContextEditPanel.tsx       # Pin selection editor
│   │   └── TurnMessage.tsx            # Chat bubble component
│   │
│   ├── shared/                       # Shared components (~3 files)
│   │   ├── TurnBubble.tsx             # Turn content with role badge
│   │   ├── SourceContextView.tsx      # Reusable source context viewer
│   │   └── SourceContextLink.tsx      # Clickable source reference
│   │
│   ├── diff/                         # Diff visualization
│   │   └── WordDiff.tsx               # Word-level diff with highlighting
│   │
│   ├── memory/                       # Memory components
│   │   └── MemoryContextModal.tsx     # Context assembly viewer
│   │
│   └── optimiser/                    # Agent evaluation UI (~7 files)
│       ├── RunsTable.tsx              # Runs list with filters
│       ├── QuickStatsBar.tsx          # Summary statistics
│       ├── E2ETestCard.tsx            # Test execution card
│       ├── ChartToggle.tsx            # Radar/bar chart toggle
│       ├── TraceTimeline.tsx          # Execution trace timeline
│       ├── AssertionsSection.tsx      # Assertion results
│       └── MetricsDelta.tsx           # Metric comparison display
│
├── store/                            # Zustand state management
│   ├── canvasStore.ts                # Main canvas store (~1500 lines)
│   ├── canvasStoreTypes.ts           # Shared CanvasState type + slice interfaces
│   ├── canvasStoreUtils.ts           # Pure utility functions
│   ├── canvasMergeSlice.ts           # Merge domain slice
│   ├── canvasLeafSlice.ts            # Leaf panel domain slice
│   ├── projectStore.ts               # Project state management
│   ├── pinsStore.ts                  # V4 pin management
│   ├── mergeWorkspaceStore.ts        # Full-screen merge workspace
│   ├── agentDemoStore.ts             # Agent demo chat state
│   └── optimiserStore.ts             # Evaluation UI (persisted)
│
├── hooks/                            # React hooks
│   ├── useApi.ts                     # API fetch wrapper with loading/error
│   ├── useBranchCommits.ts           # Branch commit data fetching
│   └── useReducedMotion.ts           # Accessibility: reduced motion
│
├── lib/                              # Utilities
│   ├── api.ts                        # 50+ API client functions
│   ├── bridgeQueries.ts              # Storage bridge for SSR
│   ├── db.ts                         # Database singleton for WebUI
│   ├── diffUtils.ts                  # Client-side diff (Jaccard + LCS)
│   ├── elkLayout.ts                  # ELK.js graph layout
│   ├── highlightUtils.ts             # Text highlighting with positions
│   ├── export.ts                     # Leaf/commit export formatters
│   ├── motion.ts                     # Framer Motion animation configs
│   ├── theme.ts                      # Theme utilities
│   ├── truncationUtils.ts            # Smart text truncation
│   └── utils.ts                      # Common helpers (cn, formatDate)
│
└── __tests__/                        # Tests
    ├── setup.ts                      # PGLite test setup
    ├── api/                          # API route tests
    ├── hooks/                        # Hook tests
    └── e2e/                          # Playwright E2E tests
```

### 4.2 API Client Functions (lib/api.ts)

This file contains 50+ functions for API communication:

```typescript
// Project operations
listProjects(limit?, offset?)
getProject(projectId)
createProject(name, metadata?)
updateProject(projectId, data)
deleteProject(projectId)

// Conversation operations
listConversations(projectId, limit?, offset?)
getConversation(conversationId)
createConversation(data)
updateConversation(conversationId, data)
deleteConversation(conversationId)
getConversationContext(conversationId)
updateConversationContext(conversationId, pinIds)
getConversationMemory(conversationId)
exportConversationContext(conversationId, format)

// Turn operations
listTurns(conversationId, limit?, offset?, order?)
getTurn(turnHash)
createTurn(data)
getTurnChain(turnHash, limit?)
getTurnContext(turnHash, before?, after?, highlightStart?, highlightEnd?)

// Commit operations (V4)
listCommitsV4(projectId, branch?, limit?, offset?)
getCommitV4(hash)
createCommitV4(data)
updateCommitV4Position(hash, x, y)
deleteCommitV4(hash)
getCommitV4History(hash, limit?)

// Leaf operations
getLeaf(leafId)
createLeaf(data)
updateLeaf(leafId, data)
deleteLeaf(leafId)
listLeavesByCommit(commitHash, type?, limit?, offset?)
listLeavesByProject(projectId, type?, limit?, offset?)
generateLeafOutput(leafId)
validateLeafOutput(leafId, useSemantic?)
batchCreateLeaves(commitHash, data)
getLeafHistory(leafId, limit?, offset?)
restoreLeafFromHistory(leafId, historyId)
deleteLeafHistory(historyId)

// Pin operations
listPins(projectId, type?, limit?, offset?)
getPin(pinId)
createPin(projectId, data)
updatePinAssertions(pinId, assertionIds)
deletePin(pinId)

// Branch operations
listBranches(projectId, limit?, offset?)
createBranch(data)
getCurrentBranch(projectId)
switchBranch(projectId, branchName, createIfMissing?)

// Diff operations
diffTwoWay(data)
diffThreeWay(data)

// Merge operations
prepareMerge(data)
executeMerge(data)
createMergeDraft(data)
getMergeDraft(draftId)
updateMergeDraft(draftId, data)
commitMergeDraft(draftId, message, branch)
deleteMergeDraft(draftId)

// Chat operations
chatStream(messages, options?)
getChatProviders()

// Export operations
exportCFPack(projectId)
exportLedger(projectId)

// Deploy agent operations
listDeployAgents(projectId?)
createDeployAgent(data)
getDeployAgent(agentId)
updateDeployAgent(agentId, data)
deleteDeployAgent(agentId)

// Run operations
createEngineRun(data)
listEngineRuns(filters?)
getEngineRun(runId)
deleteRun(runId)
getRunFilterOptions()
getConfigurations(projectId?)
compareConfigurations(data)

// Runner proxy
checkRunnerHealth()
getRunTrace(runId)
runEval(runId, rules)
```

### 4.3 Canvas Store Architecture

The canvas store uses Zustand's slice pattern for modularity:

```
canvasStore.ts
  ├── createCanvasStore()
  │     ├── Core state (nodes, edges, projectId, loading)
  │     ├── Core actions (loadProject, addNode, removeNode, etc.)
  │     ├── createMergeSlice() — from canvasMergeSlice.ts
  │     │     ├── State: mergeSourceHash, mergeTargetHash, mergePrepared
  │     │     ├── Actions: prepareMerge, executeMerge, cancelMerge
  │     │     └── Selectors: canMerge, getMergePreview
  │     └── createLeafSlice() — from canvasLeafSlice.ts
  │           ├── State: selectedLeafId, leafPanelOpen
  │           └── Actions: openLeafPanel, closeLeafPanel, selectLeaf
  │
  ├── canvasStoreTypes.ts — shared CanvasState interface
  └── canvasStoreUtils.ts — pure utility functions
        ├── calculateNodePosition()
        ├── buildGraphFromData()
        ├── findUpstreamNodes()
        ├── findDownstreamNodes()
        └── isNodeLocked()
```

### 4.4 ELK.js Layout

The auto-layout feature uses ELK.js (Eclipse Layout Kernel):

```typescript
// lib/elkLayout.ts
async function calculateElkLayout(nodes, edges): Promise<LayoutResult> {
  const elk = new ELK()
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',           // Top-to-bottom flow
      'elk.spacing.nodeNode': '80',       // Horizontal spacing
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',  // Vertical spacing
    },
    children: nodes.map(n => ({ id: n.id, width: 280, height: 120 })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
  }
  return elk.layout(graph)
}
```

### 4.5 Diff Utilities (Client-Side)

The WebUI includes a client-side diff implementation in `lib/diffUtils.ts`
that mirrors the core algorithm:

```typescript
// Used for real-time diff preview without API calls
function clientSideDiff(sourceText: string, targetText: string): DiffResult {
  // 1. Tokenize both texts
  // 2. Compute Jaccard similarity
  // 3. If similar enough, compute LCS word diff
  // 4. Return segments with type (unchanged/added/removed)
}
```

---

## 5. Runner Implementation

### 5.1 File Structure

```
apps/runner/src/
├── index.ts                 # Entry point: exports observer + evalEngine
├── server.ts                # Express HTTP server (port 8080)
│
├── observer.ts              # Agent I/O observation (SDK proxy mode)
│   ├── registerAgent(config)
│   ├── startRun(agentId, input)
│   ├── recordLLMCall(runId, prompt, response, model, tokens)
│   ├── recordToolCall(runId, toolName, input, output)
│   └── completeRun(runId, output, status)
│
├── evaluator/
│   ├── index.ts             # EvalEngine class
│   │   ├── evaluate(runRecord, rules): EvalResult
│   │   ├── evaluateWithLeaf(runRecord, leaf): EvalResult
│   │   └── loadRules(rulesRef): EvalRules
│   │
│   └── operators.ts         # Rule checking operators
│       ├── exists, not_empty, equals, contains, regex
│       ├── range, some, all, none
│       └── expected_tools, no_unknown_tools, step_count,
│           no_repeated_steps, total_tokens, total_latency_ms
│
├── trace/
│   └── n8n-mapper.ts        # n8n execution → RunRecord conversion
│       ├── mapN8nExecution(execution): RunRecord
│       ├── mapN8nNode(node): StepRecord
│       ├── inferSpanKind(nodeType): SpanKind
│       └── extractTokenUsage(nodeData): TokenUsage
│
├── asserter.ts              # LLM-powered assertion generation (optional)
│   ├── generateAssertions(evalResult, runRecord): AssertionResult
│   └── Status: success | skipped | unavailable | error
│
├── engine-client.ts         # HTTP client for Engine API
│   ├── getRunByRunnerRunId(runnerRunId): RunDetails
│   └── getEngineCallbackUrl(): string
│
├── n8n-client.ts            # HTTP client for n8n API
│   ├── triggerWebhook(webhookId, payload): WebhookResponse
│   └── getExecution(executionId): ExecutionData
│
└── resources/
    └── rules/
        ├── default.yml      # Default evaluation rules
        └── ...              # Custom rule files
```

### 5.2 n8n Callback Processing

The most complex flow in the Runner:

```typescript
// POST /callbacks/n8n
app.post('/callbacks/n8n', async (req, res) => {
  // Phase 1: Immediate response (don't block n8n)
  const { executionId, metadata } = req.body
  res.json({ received: true })

  // Phase 2: Async processing
  try {
    // 1. Get run details from Engine
    const run = await engineClient.getRunByRunnerRunId(metadata?.run_id)

    // 2. Fetch full execution trace from n8n API
    const execution = await n8nClient.getExecution(executionId)

    // 3. Map n8n data to standard RunRecord
    const runRecord = n8nMapper.mapN8nExecution(execution)

    // 4. Load evaluation rules
    const rules = evalEngine.loadRules(run?.leaf?.rules_ref)

    // 5. Run deterministic evaluation
    const evalResult = evalEngine.evaluate(runRecord, rules)

    // 6. Optional: Generate LLM assertions
    const assertions = await asserter.generateAssertions(evalResult, runRecord)

    // 7. Build trace summary (lightweight)
    const traceSummary = buildTraceSummary(runRecord)

    // 8. Determine full trace storage (based on policy)
    const fullTrace = shouldStoreFullTrace(evalResult) ? runRecord : null

    // 9. Send results back to Engine
    await fetch(engineClient.getEngineCallbackUrl(), {
      method: 'POST',
      body: JSON.stringify({
        run_id: run.run_id,
        runner_run_id: metadata?.run_id,
        status: evalResult.passed ? 'completed' : 'failed',
        run_report: evalResult,
        assertions: assertions?.data,
        trace_summary: traceSummary,
        full_trace: fullTrace,
        metadata: { model: extractModel(runRecord) }
      })
    })
  } catch (error) {
    logger.error('Callback processing failed:', error)
  }
})
```

### 5.3 Trace Policy

Controls when full traces (large) are stored:

```typescript
function shouldStoreFullTrace(evalResult: EvalResult): boolean {
  const policy = process.env.TRACE_POLICY || 'always'
  switch (policy) {
    case 'always': return true
    case 'on_failure': return !evalResult.passed
    case 'on_violation': return evalResult.violations.length > 0
  }
}
```

---

## 6. CLI Implementation

### 6.1 File Structure

```
apps/cli/src/
├── index.ts                 # Entry point: Commander.js program
├── commands/
│   ├── projects.ts          # project list/get/create/delete
│   ├── branches.ts          # branch list/create/switch/current
│   └── commits.ts           # commit list/show
└── utils.ts                 # Spinner, table, formatting helpers
```

### 6.2 Command Hierarchy

```
t3x
├── health                   # Check API connectivity
├── status                   # Get API status details
├── projects (alias: p)
│   ├── list (alias: ls)     # List all projects
│   ├── get <id>             # Get project details
│   ├── create <name>        # Create project
│   └── delete <id> --force  # Delete project
├── branches (alias: b)
│   ├── list (alias: ls)     # List branches (-p required)
│   ├── create <name>        # Create branch (-p required)
│   ├── switch <name>        # Switch branch (-p required)
│   └── current              # Show current branch (-p required)
└── commits (alias: c)
    ├── list (alias: ls)     # List commits (-p required)
    └── show <hash>          # Show commit details
```

### 6.3 Current Limitations

The CLI currently lacks commands for:
- Creating turns and conversations
- Creating commits (only listing/viewing)
- Creating/managing leaves
- Merge operations
- Pin management
- Diff operations

This makes the CLI suitable for read operations and basic project
management, but not for the full T3X workflow.

---

## 7. Testing Strategy

### 7.1 Testing Pyramid

```
              ┌─────────┐
              │  E2E    │  Playwright (browser)
              │  Tests  │  ~20 tests
              ├─────────┤
              │  API    │  Vitest (mock storage)
              │  Route  │  ~80 tests
              │  Tests  │
              ├─────────┤
              │  Unit   │  Vitest (PGLite / pure)
              │  Tests  │  ~200+ tests
              └─────────┘
```

### 7.2 Unit Tests

**Core Package Tests:**

Location: `packages/core/src/__tests__/`

Tests cover:
- Hash computation (determinism, canonical form)
- Text canonicalization
- Diff algorithm (exact match, Jaccard, Hungarian, LCS)
- Merge algorithm (prepare, execute, edge cases)
- Constraint validation (exact, semantic)
- Context builder
- Ring extraction (with NLP mocks)

**Storage Package Tests:**

Location: `packages/storage/src/__tests__/`

Tests use PGLite for isolated test databases:

```typescript
// packages/storage/src/__tests__/setup.ts
import { createPGLiteStorage } from '../adapters/pglite'

export async function setupTestDB() {
  const db = await createPGLiteStorage({ inMemory: true })
  // Tables are auto-created by PGLite adapter
  return db
}
```

Tests cover all query functions for:
- Projects (CRUD + stats)
- Conversations (CRUD + turn count)
- Turns (insert, chain, window)
- Branches (CRUD + switch + linearity)
- Commits V3 and V4 (CRUD + history + parents)
- Leaves (CRUD + output + assertions)
- Pins (CRUD + unique constraint + assertions)
- Conversation contexts (get/set/delete)
- Leaf history (CRUD + counts)
- Merge drafts (CRUD + status transitions)
- Deploy agents (CRUD + run status)
- Runs (CRUD + filters + configs + stats)

**Runner Package Tests:**

Location: `apps/runner/src/__tests__/`

```typescript
// Runner tests require mocking pino logger
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })
}))
```

Tests cover:
- Evaluator (rule evaluation, scoring, dimensions)
- Operators (all operator types)
- n8n mapper (execution → RunRecord conversion)
- Asserter (LLM assertion generation)
- Observer (trace collection)

### 7.3 API Route Tests

Location: `apps/api/src/__tests__/`

Pattern: Mock the storage layer, test HTTP handling:

```typescript
// Mock the database
vi.mock('../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB))
}))

// Mock specific storage queries
vi.mock('@t3x/storage', async () => {
  const actual = await vi.importActual('@t3x/storage')
  return {
    ...actual,
    findProjectById: vi.fn(),
    insertProject: vi.fn(),
    // ... other mocked queries
  }
})

// Test the endpoint
test('GET /api/v1/projects/:id returns 404 for missing project', async () => {
  findProjectById.mockResolvedValue(null)

  const response = await app.request('/api/v1/projects/proj_missing')

  expect(response.status).toBe(404)
  const body = await response.json()
  expect(body.success).toBe(false)
  expect(body.error.code).toBe('NOT_FOUND')
})
```

### 7.4 WebUI Tests

**Hook Tests:**

Location: `apps/web/src/__tests__/hooks/`

```typescript
// useApi tests
test('useApi returns loading state during fetch', async () => {
  const { result } = renderHook(() => useApi('/api/test'))
  expect(result.current.loading).toBe(true)
  // ... wait for resolution
})

// useBranchCommits tests
test('useBranchCommits fetches commits for branch', async () => {
  const { result } = renderHook(() =>
    useBranchCommits('proj_123', 'main')
  )
  // ... verify fetched data
})
```

**E2E Tests (Playwright):**

Location: `apps/web/src/__tests__/e2e/`

```typescript
// Playwright tests run in serial mode
test.describe.serial('Project Management', () => {
  test('create a new project', async ({ page }) => {
    await page.goto('/')
    await page.click('text=New Project')
    await page.fill('input[name="name"]', 'Test Project')
    await page.click('text=Create')
    await expect(page.locator('text=Test Project')).toBeVisible()
  })

  test('delete the project', async ({ page }) => {
    await page.goto('/')
    // ... delete flow
  })
})
```

### 7.5 Running Tests

```bash
# All tests
pnpm test                         # Run all tests across monorepo

# Package-specific
pnpm test:core                    # Core package tests
pnpm test:storage                 # Storage package tests
pnpm test:webui                   # WebUI tests
pnpm test:runner                  # Runner tests

# Single file
cd apps/api && vitest run src/__tests__/leaves.test.ts

# Single test by name
cd apps/api && vitest run -t "should create leaf"

# E2E tests
cd apps/web && npx playwright test

# Watch mode
cd packages/core && vitest
```

### 7.6 Test Coverage Summary

| Package | Test Files | Approx. Tests | Coverage Focus |
|---------|-----------|---------------|----------------|
| @t3x/core | ~15 | ~80 | Algorithms, hash, diff, merge |
| @t3x/storage | ~14 | ~100 | All CRUD queries |
| @t3x/api | ~13 | ~80 | HTTP endpoints |
| @t3x/runner | ~5 | ~30 | Evaluator, operators, mapper |
| t3x-webui | ~5 | ~35 | Hooks, E2E flows |
| **Total** | **~52** | **~325** | |

---

## 8. Build System & Tooling

### 8.1 Turborepo Configuration

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],     // Build dependencies first
      "outputs": ["dist/**", ".next/**"],
      "cache": true                 // Cache build artifacts
    },
    "test": {
      "dependsOn": ["build"],      // Build before testing
      "cache": true
    },
    "lint": {
      "cache": true
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true            // Long-running dev server
    }
  }
}
```

**Build Order Enforcement:**

`"dependsOn": ["^build"]` means "build all workspace dependencies first".
This ensures:
1. `@t3x/core` builds first (no dependencies)
2. `@t3x/storage` builds second (depends on core)
3. `apps/api` and `apps/web` build last (depend on storage)

### 8.2 Biome Configuration

```jsonc
// biome.json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "quoteStyle": "single"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "overrides": [
    {
      "include": ["*.ts", "*.tsx"],
      "linter": {
        "rules": {
          "suspicious": {
            "noExplicitAny": "warn"     // Allow but warn
          },
          "style": {
            "noNonNullAssertion": "off"  // Allow ! operator
          },
          "correctness": {
            "useExhaustiveDependencies": "off"  // React hooks
          }
        }
      }
    }
  ],
  "vcs": {
    "enabled": true,
    "clientKind": "git"
  }
}
```

**Usage:**
```bash
pnpm check           # Lint + format check (no changes)
pnpm check:fix       # Lint + format auto-fix
pnpm lint             # Lint only
pnpm lint:fix         # Lint auto-fix

# On new test files (must run to fix formatting)
npx biome check --write src/__tests__/new.test.ts
```

### 8.3 pnpm Workspace

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

**Workspace Protocol:**
```jsonc
// Any package.json
{
  "dependencies": {
    "@t3x/core": "workspace:*",      // Always latest from workspace
    "@t3x/storage": "workspace:*"
  }
}
```

### 8.4 TypeScript Configuration

Each package has its own `tsconfig.json` extending a base config:

```jsonc
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

---

## 9. Docker & Deployment

### 9.1 Docker Compose Services

```yaml
# docker-compose.yml (simplified)
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: t3x
      POSTGRES_USER: t3x
      POSTGRES_PASSWORD: t3x_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  t3x-api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://t3x:t3x_password@postgres:5432/t3x
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on: [postgres]

  t3x-webui:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://t3x-api:8000
    depends_on: [t3x-api]

  # Optional services (activated by profiles)
  t3x-runner:
    profiles: [runner]
    build:
      context: .
      dockerfile: apps/runner/Dockerfile
    ports: ["8080:8080"]
    environment:
      T3X_ENGINE_URL: http://t3x-api:8000
      N8N_API_URL: http://n8n:5678

  agent-demo:
    profiles: [agent-demo]
    build:
      context: .
      dockerfile: apps/agent-demo/Dockerfile
    ports: ["9000:9000"]

  n8n:
    profiles: [n8n]
    image: docker.n8n.io/n8nio/n8n
    ports: ["5678:5678"]
    volumes:
      - n8n_data:/home/node/.n8n
```

### 9.2 Docker Usage

```bash
# Default stack (postgres + api + webui)
docker compose up -d --build

# With runner
docker compose --profile runner up -d --build

# With n8n
docker compose --profile n8n up -d

# Full stack (all services)
docker compose --profile runner --profile agent-demo --profile n8n up -d --build

# Tear down
docker compose down

# Tear down with data deletion
docker compose down -v
```

### 9.3 Port Mapping

| Service | Internal Port | External Port |
|---------|--------------|---------------|
| PostgreSQL | 5432 | 5432 |
| API Server | 8000 | 8000 |
| WebUI | 3000 | 3000 |
| Runner | 8080 | 8080 |
| Agent Demo | 9000 | 9000 |
| n8n | 5678 | 5678 |

### 9.4 Local Development (No Docker)

```bash
# 1. Install dependencies
pnpm install

# 2. Build packages (dependency order enforced by Turborepo)
pnpm build

# 3. Start API server (uses PGLite, no PostgreSQL needed)
pnpm dev:api        # http://localhost:8000

# 4. Start WebUI
pnpm dev:webui      # http://localhost:3000

# 5. (Optional) Start Runner
cd apps/runner && pnpm dev   # http://localhost:8080

# 6. (Optional) Start Agent Demo
cd apps/agent-demo && pnpm dev  # http://localhost:9000
```

---

## 10. Development Workflow

### 10.1 Adding a New Feature

**Recommended Workflow:**

```
1. Understand existing patterns
   ├── Search for similar implementations (Grep/Glob)
   ├── Read related files
   └── Identify impact scope

2. Modify contract files (if needed)
   ├── packages/core/src/types/v4/index.ts (TypeScript types)
   ├── packages/storage/src/schema-v4.ts (DB schema)
   └── apps/api/src/schemas/v4-contracts.ts (API contracts)

3. Implement bottom-up
   ├── packages/core/ (if algorithm changes)
   ├── packages/storage/ (if storage changes)
   ├── apps/api/ (if API changes)
   └── apps/web/ (if UI changes)

4. Rebuild dependency chain
   └── pnpm build:core && pnpm build:storage && pnpm build:api

5. Write tests
   ├── Unit tests for new functions
   ├── API route tests for new endpoints
   └── E2E tests for new user flows

6. Format and lint
   └── pnpm check:fix

7. Verify
   ├── pnpm test (all tests pass)
   └── Manual testing in browser
```

### 10.2 Commit Convention

```
<type>(<scope>): <description> [Track].(#issue)

# Types
feat    # New feature
fix     # Bug fix
test    # Test related
docs    # Documentation
refactor # Refactoring (no behavior change)
chore   # Build/toolchain

# Scopes
core, storage, api, web, runner, cli

# Track markers
[A1], [A2] = Track A (Storage/Core)
[B1], [B2] = Track B (API/UI)

# Examples
feat(api): add V4 leaves endpoint [B1].(#123)
fix(web): resolve canvas node drag issue [B2]
test(storage): add commits-v4 query tests [A1]
```

### 10.3 PR Checklist

Before submitting a pull request:

```
[ ] pnpm check passes (lint + format)
[ ] Related tests pass (pnpm test:xxx)
[ ] New code has corresponding tests
[ ] No console.log introduced (remove debug logs)
[ ] Types are correct (no any escapes)
[ ] API changes updated OpenAPI schema
[ ] Breaking changes documented in PR description
```

### 10.4 File Naming Conventions

| File Type | Convention | Example |
|-----------|-----------|---------|
| React component | PascalCase.tsx | `CanvasWorkspace.tsx` |
| Utility function | camelCase.ts | `diffUtils.ts` |
| Store | camelCase + Store.ts | `canvasStore.ts` |
| Hook | use + PascalCase.ts | `useApi.ts` |
| Test | *.test.ts | `leaves.test.ts` |
| API route | *.openapi.ts | `leaves.openapi.ts` |
| Schema | schema*.ts | `schema-v4.ts` |
| Query | camelCase.ts | `commits-v4.ts` |

### 10.5 Import Conventions

```typescript
// From workspace packages — use package name
import { CommitV4, Leaf, Pin } from '@t3x/core'
import { findProjectById } from '@t3x/storage'

// Within a package — use relative paths
import { sha256 } from '../common/hash'
import { JACCARD_THRESHOLD } from './jaccard'

// Never redefine types locally that exist in @t3x/core
// ❌ interface Leaf { ... }
// ✅ import { Leaf } from '@t3x/core'
```

---

## 11. Environment Variables Reference

### 11.1 Required for Core Functionality

| Variable | Service | Default | Purpose |
|----------|---------|---------|---------|
| `PORT` | API | 8000 | API server port |
| `DATABASE_URL` | API | (none, uses PGLite) | PostgreSQL connection string |

### 11.2 Required for LLM Features

| Variable | Service | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | API, Runner | Claude API for leaf generation and assertions |
| `GOOGLE_AI_STUDIO_KEY` | API | Embeddings for semantic constraint validation |
| `GOOGLE_CLOUD_NLP_KEY` | API | NLP provider for Ring extraction |

### 11.3 Optional Configuration

| Variable | Service | Default | Purpose |
|----------|---------|---------|---------|
| `NEXT_PUBLIC_API_URL` | WebUI | `http://localhost:8000` | API server URL |
| `CORS_ORIGINS` | API | localhost | Allowed CORS origins |
| `RUNNER_URL` | API | `http://t3x-runner:8080` | Runner service URL |
| `ENGINE_CALLBACK_URL` | Runner | `http://t3x-api:8000/api/v1/runs/ingest` | Engine callback |
| `RUNNER_CALLBACK_URL` | API | `http://t3x-runner:8080/callbacks/n8n` | Runner callback |
| `N8N_BASE_URL` | Runner | `http://localhost:5678` | n8n URL |
| `N8N_API_URL` | Runner | `http://n8n:5678` | n8n API URL |
| `N8N_API_KEY` | Runner | (none) | n8n API key |
| `TRACE_POLICY` | Runner | `always` | `always`, `on_failure`, `on_violation` |
| `HTTPS_PROXY` | API | (none) | Proxy for Claude API calls |

---

## 12. Known Pitfalls & Debugging

### 12.1 Common Issues

| Problem | Cause | Solution |
|---------|-------|---------|
| **DELETE route returns 404** | `index.ts` imports wrong file (`.ts` instead of `.openapi.ts`) | Verify import path in route index |
| **API call fails from WebUI** | Assuming API is in Next.js (old architecture) | API is at port 8000, WebUI at 3000 |
| **Tests can't find module** | Dependency packages not built | Run `pnpm build:core && pnpm build:storage` first |
| **Tailwind styles not working** | Global styles in `globals.css` not in `@layer` | Wrap global resets in `@layer base` |
| **PGLite data lost** | Process killed with SIGKILL | Use `pnpm stop:api` for graceful stop |
| **Port already in use** | Previous process still running | `kill -TERM $(lsof -ti:8000)` |
| **Build fails after core change** | Storage/API using stale core build | Rebuild chain: `pnpm build:core && pnpm build:storage` |
| **Merge conflicts in hash** | Non-deterministic field in hash | Check that only first-class fields are in hash |

### 12.2 Debug Commands

```bash
# Check port usage
lsof -i :8000                    # API port
lsof -i :3000                    # WebUI port
lsof -i :8080                    # Runner port

# View API logs
pnpm dev:api 2>&1 | tee api.log

# Database status (PGLite)
ls -la .t3x/database/

# Clean rebuild
pnpm clean && pnpm install && pnpm build

# Test a single file
cd apps/api && pnpm vitest run src/__tests__/leaves.test.ts

# Test specific case
cd apps/api && pnpm vitest run -t "should create leaf"

# Check WebUI with Playwright
npx playwright screenshot --wait-for-timeout=3000 \
  "http://localhost:3000/project/proj_xxx" /tmp/screenshot.png

# Database SQL (dev only)
# Visit http://localhost:3000/dev/db in browser
```

### 12.3 Performance Characteristics

| Operation | Typical Latency | Complexity |
|-----------|----------------|------------|
| Turn creation | ~5ms | O(1) |
| Commit creation (10 sentences) | ~10ms | O(N) sentences |
| Diff (100 sentences each) | ~50ms | O(N*M) Jaccard |
| Diff (1000 sentences each) | ~200ms | O(N*M) + O(n³) Hungarian |
| Merge prepare | ~60ms | Same as diff |
| Merge execute | ~10ms | O(N) sentences |
| Leaf generation | ~2-10s | LLM API call |
| Exact constraint validation | ~1ms | O(N) constraints |
| Semantic constraint validation | ~500ms | Embedding API |
| ELK layout (50 nodes) | ~100ms | ELK internal |
| ELK layout (200 nodes) | ~500ms | ELK internal |
| Context building (20 pins) | ~20ms | O(P) pins |

### 12.4 Data Volume Limits

| Entity | Practical Limit | Notes |
|--------|----------------|-------|
| Sentences per commit | ~500 | Beyond this, diff gets slow |
| Turns per conversation | ~1000 | PGLite handles well |
| Commits per project | ~1000 | Canvas may lag above 200 nodes |
| Leaves per commit | ~50 | No technical limit |
| Pins per project | ~100 | Context building stays fast |
| Projects | ~100 | PGLite capacity |
| Concurrent users | 1 | No auth = no multi-user |

### 12.5 Security Considerations

**Current State (Development/Alpha):**

| Area | Status | Risk |
|------|--------|------|
| Authentication | Not implemented | Anyone can access |
| Authorization | Not implemented | No role-based access |
| Rate limiting | Not implemented | DoS vulnerability |
| Input validation | Zod schemas on API | Good for known endpoints |
| SQL injection | Drizzle ORM (parameterized) | Protected |
| XSS | React auto-escaping | Protected |
| CORS | Configured for localhost | Production needs config |
| API keys | Stored in env vars | Not exposed to client |
| Dev SQL endpoint | Only in development mode | Protected by NODE_ENV |

**Before Production:**
- Add user authentication (OAuth, JWT, or similar)
- Add API rate limiting
- Configure CORS for production domain
- Add request size limits
- Add security headers (Helmet.js or equivalent)
- Remove dev-only endpoints
- Add audit logging

---

*End of Document 3: Engineering & Implementation Layer*
*Total: ~1000 lines*
