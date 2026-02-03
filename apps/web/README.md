# t3x-webui

Web frontend for T3X, a canvas-based semantic version control interface built with Next.js.

**Last Updated:** 2026-01-29 (V4 Pins + Conversation Context)

## Tech Stack

| Category | Current Usage |
|----------|--------------|
| Framework | Next.js 16 + React 19 (App Router) |
| Canvas | xyflow v12 (ReactFlow) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | Zustand |
| Animation | Framer Motion |
| Layout | ELK.js (auto layout) |

## Directory Structure

```
src/
├── app/                      # Next.js App Router
│   ├── page.tsx              # Home page (project list)
│   ├── layout.tsx            # Root layout
│   ├── project/[projectId]/  # Project canvas page
│   │   └── merge/[mergeId]/  # Merge Workspace page (NEW)
│   ├── agent-demo/           # Agent Demo page
│   ├── api/                  # API proxy routes
│   ├── deploy/               # Deploy page (A/B Test Compare)
│   ├── dev/                  # Development debug routes
│   ├── eval/                 # Evaluation page
│   ├── health/               # Health check page
│   └── insights/             # Insights page
├── components/
│   ├── canvas/               # Canvas related components
│   │   ├── CanvasWorkspace.tsx   # Main canvas container
│   │   ├── CanvasNodes.tsx       # Node renderer
│   │   ├── NodeModal/            # Node detail modal (split into sub-components)
│   │   │   ├── NodeModal.tsx         # Shell: routing by node kind/status
│   │   │   ├── ConversationView.tsx  # Conversation (staging unit) view
│   │   │   ├── PendingCommitView.tsx # Pending commit editing view
│   │   │   ├── CommittedCommitView.tsx # Committed commit read-only view
│   │   │   ├── shared.tsx            # Shared sections (source context, leaves, etc.)
│   │   │   └── helpers.tsx           # Utility functions
│   │   ├── AnimatedEdge.tsx      # Animated edge
│   │   └── ...
│   ├── merge/                # Merge UI components (NEW)
│   │   ├── MergeWorkspace.tsx    # Main merge workspace
│   │   ├── MergePanel.tsx        # Decision panel
│   │   ├── MergeSimilarPairCard.tsx  # Similar pair card
│   │   ├── WordDiffDisplay.tsx   # Word-level diff display
│   │   └── ...
│   ├── optimiser/            # Agent Optimiser components (NEW)
│   │   ├── RunsTable.tsx         # Runs list
│   │   ├── E2ETestCard.tsx       # E2E test card
│   │   └── ...
│   ├── ui/                   # shadcn/ui components
│   ├── Sidebar.tsx           # Sidebar
│   └── CommandPalette.tsx    # Command palette
├── store/
│   ├── canvasStore.ts        # Canvas store (core state + slice composition)
│   ├── canvasStoreTypes.ts   # Shared CanvasState type + slice interfaces
│   ├── canvasStoreUtils.ts   # Pure utility functions (layout, position, graph)
│   ├── canvasMergeSlice.ts   # Merge domain slice (state + methods + selectors)
│   ├── canvasLeafSlice.ts    # Leaf panel domain slice
│   ├── projectStore.ts       # Project state (list, current project)
│   ├── pinsStore.ts          # Pin state management (V4)
│   ├── agentDemoStore.ts     # Agent Demo state
│   ├── mergeWorkspaceStore.ts # Merge Workspace state
│   └── optimiserStore.ts     # Agent Optimiser state
├── lib/
│   ├── api.ts                # API client
│   ├── bridgeQueries.ts      # Bridge template query definitions
│   ├── db.ts                 # Database utilities
│   ├── elkLayout.ts          # ELK auto layout
│   ├── motion.ts             # Animation config
│   ├── theme.ts              # Theme utilities
│   ├── utils.ts              # General utilities
│   └── providers/            # Provider wrappers
├── utils/
│   └── tokenizer.ts          # Text tokenizer utilities
├── hooks/
│   ├── useApi.ts             # Data fetching hook
│   └── useReducedMotion.ts   # Animation preference hook
└── types/
    ├── nodes.ts              # Node type definitions
    ├── display-spec.ts       # Display spec types
    ├── semantic.ts           # Semantic data types
    └── merge.ts              # Merge type definitions (NEW)
```

## API Connection

WebUI calls the standalone Hono API service via `lib/api.ts`:

| Environment | API Address |
|-------------|-------------|
| Development | `http://localhost:8000/api/v1` |

## State Management

| Store | Purpose |
|-------|---------|
| `canvasStore` | Nodes, edges, selection state, canvas operations |
| `projectStore` | Project list, current project, CRUD operations |
| `agentDemoStore` | Agent Demo page state |
| `mergeWorkspaceStore` | Merge Workspace state (decisions, preview) |
| `optimiserStore` | Agent Optimiser state (runs, filter) |
| `pinsStore` | Pin state management (fetch, add, remove, update) |

## Getting Started

```bash
# Need to start API service simultaneously
pnpm dev:api     # Terminal 1 - API (port 8000)
pnpm dev:webui   # Terminal 2 - WebUI (port 3000)
```

## Testing

```bash
pnpm --filter t3x-webui test
```

## Module Boundaries

Evaluate impact before modifying the following exported interfaces:

### lib/api.ts (High Stability)
- **Type definitions**: `Project`, `Conversation`, `Turn`, `Commit`, `Branch`, `Draft`, `DiffResult`, `MergeResult`
- **CommitV3 API types**: `CommitV3`, `CommitV3Sentence`, `CommitV3Constraint`, `CommitV3Author`, `CommitV3ListData`
- **CommitV3 API functions**: `listCommitsV3()`, `getCommitV3()`
- **Anchor API types**: `ApiAnchorCandidate`, `ApiConfirmedAnchor`, `ApiSentenceWithAnchors`, `ApiCommitAnchors`
- **Transform functions**: `parseApiAnchorCandidates()`, `parseApiConfirmedAnchor()`, `parseApiSentenceWithAnchors()`, `parseApiCommitAnchors()`
- **API function signatures**: All `export async function xxx()` parameters and return types

### store/canvasStore.ts (Medium Stability)
- **State fields**: `nodes`, `edges`, `projectId`, `loading`, `openNodeId`, `modalViewMode`
- **Public Actions**: `loadProjectData`, `addNode`, `updateNode`, `onNodesChange`, `onEdgesChange`, `onConnect`, `openNodeModal`, `closeNodeModal`
- **Slice architecture**: Core state in `canvasStore.ts`, merge domain in `canvasMergeSlice.ts`, leaf domain in `canvasLeafSlice.ts`, shared types in `canvasStoreTypes.ts`, utilities in `canvasStoreUtils.ts`
- **Selectors** (re-exported from slices): `selectIsMerging`, `selectCanExecuteMerge`, `selectUnresolvedCount`, `selectMergeCounts`

### store/projectStore.ts (Medium Stability)
- **State fields**: `projects`, `loading`
- **Public Actions**: `fetchProjects`, `addProject`, `deleteProject`

### store/mergeWorkspaceStore.ts (Medium Stability) (NEW)
- **State fields**: `draftId`, `prepared`, `decisions`, `preview`
- **Public Actions**: `loadMergeDraft`, `setDecision`, `updatePreview`, `commitMerge`

### store/optimiserStore.ts (Medium Stability)
- **State fields**: `runs`, `filters`, `configurations`
- **Public Actions**: `fetchRuns`, `setFilter`, `compareConfigurations`

### store/pinsStore.ts (Medium Stability)
- **State fields**: `pins`, `loading`
- **Public Actions**: `fetchPins`, `addPin`, `removePin`, `updatePinAssertions`
- **Selectors**: `isPinned()`, `getPinByRef()`

### types/nodes.ts (High Stability)
- **Node types**: `NodeKind`, `CanvasNodeData`, `LeafType`, `BranchType`
- **CommitV3 types**: `CommitV3Display`, `SentenceDisplay`, `ConstraintDisplay`, `AuthorDisplay`
- **Anchor types**: `AnchorType`, `AnchorConstraint`, `AnchorCandidate`, `ConfirmedAnchor`, `SentenceWithAnchors`, `CommitAnchors`
- **Pending types**: `PendingCommitSource`, `PendingCommitSentence`

### types/merge.ts (High Stability) (NEW)
- **Merge types**: `MergeDraft`, `MergeSimilarPair`, `MergeDecision`, `MergePreview`
- **Word Diff types**: `WordDiffSegment`, `WordDiffType`

---

Internal implementations (non-exported functions, private helpers) can be refactored freely.
