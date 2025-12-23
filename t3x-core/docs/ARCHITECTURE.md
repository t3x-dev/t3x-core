# T3X Architecture Overview

**"Git for Meaning" — Semantic Version Control for AI Conversations**

---

## 1. Product Vision

> **T3X is "Git for Meaning"** — enabling any conversation to be versioned, traced, verified, and shared like code.
>
> LLMs are pluggable components, not the core. The deterministic layer never depends on LLMs.

---

## 2. Three-Layer Architecture

| Layer | Package | Responsibility | Requires LLM? |
|-------|---------|----------------|---------------|
| **Framework Core** | `@t3x/core` | Deterministic extraction, diff, merge, hash computation | No |
| **Storage Layer** | `@t3x/storage` | PostgreSQL persistence (PGLite/Postgres/Supabase) | No |
| **Product Layer** | `t3x-webui` | Next.js 15 WebUI with REST API, ReactFlow canvas | Optional |

### Package Dependencies

```
t3x-webui ──depends──► @t3x/storage ──depends──► @t3x/core
```

---

## 3. Repository Structure

```
t3x/
├── t3x-core/           # Deterministic semantic engine (TypeScript)
│   ├── src/
│   │   ├── common/     # Hash, canonicalization utilities
│   │   ├── diff/       # Two-way and three-way semantic diff
│   │   ├── merge/      # Three-way merge with conflict detection
│   │   ├── extractors/ # Ring 1/2/3 semantic extraction
│   │   ├── providers/  # NLP and Embedding provider interfaces
│   │   ├── llm/        # LLM provider interface
│   │   └── storage/    # Storage types and pure utilities
│   └── docs/           # Architecture documentation
│
├── t3x-storage/        # PostgreSQL persistence layer (Drizzle ORM)
│   ├── src/
│   │   ├── adapters/   # PGLite, Postgres, Supabase adapters
│   │   ├── queries/    # CRUD operations for all entities
│   │   └── schema.ts   # Drizzle table definitions
│   └── drizzle/        # Migrations
│
├── t3x-webui/          # Next.js 15 frontend (App Router + ReactFlow)
│   ├── src/
│   │   ├── app/        # Next.js App Router
│   │   │   ├── api/v1/ # REST API routes
│   │   │   └── project/# Project canvas page
│   │   ├── components/ # React components
│   │   ├── store/      # Zustand state management
│   │   ├── hooks/      # Data fetching hooks
│   │   └── lib/        # API client, database singleton
│   └── public/         # Static assets
│
├── t3x-runner/         # Agent evaluation engine
├── agent-demo/         # Demo agent for testing
└── docker-compose.yml  # Container orchestration
```

---

## 4. Framework Core Design (`@t3x/core`)

### 4.1 Core Responsibilities

The core package provides deterministic, reproducible semantic operations:

- **Hash Chain**: SHA-256 hashing with JCS canonicalization for turns and commits
- **Extractor Rings**: Ring 1 (keywords/entities), Ring 2 (facets), Ring 3 (segments)
- **Semantic Diff**: Two-way and three-way diff using embedding similarity
- **Three-Way Merge**: Conflict detection with auto-merge for non-conflicting changes

### 4.2 Extractor Rings

Every turn is processed through three extraction rings:

| Ring | Purpose | Output |
|------|---------|--------|
| **Ring 1** | Topic spine | Keywords, entities, temporal anchors, polarity tags |
| **Ring 2** | Light relations | Intent seeds, facets, preferences |
| **Ring 3** | Sentence structure | Sentence-level segments for diff/merge |

```typescript
interface RingOutput {
  ring1: {
    keywords: Keyword[];      // Lemmatized keywords with polarity
    entities: Entity[];       // Named entities (PERSON, ORG, GPE, etc.)
    timeAnchor: string | null;
    topic: string | null;
  };
  ring2: {
    facets: Facet[];          // Semantic facets (goal, preference, constraint)
    intentSeed: string | null;
  };
  ring3: {
    segments: Segment[];      // Sentence-level segments
  };
}
```

### 4.3 Hash Computation

All hashes use JCS (JSON Canonicalization Scheme) + SHA-256:

```typescript
// Turn hash includes all semantic content + schema version
function computeTurnHash(data: TurnPayload): string {
  return computeJCSHash({
    parent_turn_hash: data.parent_turn_hash,
    project_id: data.project_id,
    conversation_id: data.conversation_id,
    role: data.role,
    content: data.content,
    language: data.language,
    rings_json: data.rings_json,
    created_at: data.created_at,
    schema_version: 'turn_v1',  // Included in hash
  });
}

// Commit hash includes full commit data + schema version
function computeCommitHash(data: CommitPayload): string {
  return computeJCSHash({
    project_id: data.project_id,
    branch: data.branch,
    parents_json: data.parents_json,
    turn_window_json: data.turn_window_json,
    facet_snapshot_json: data.facet_snapshot_json,
    pipeline_config_json: data.pipeline_config_json,
    draft_id: data.draft_id,
    draft_text_hash: data.draft_text_hash,
    signature_json: data.signature_json,
    created_at: data.created_at,
    schema_version: 'commit_v1',  // Included in hash
  });
}
```

### 4.4 Diff Engine

The diff engine compares Ring 3 segments using embedding similarity:

```typescript
interface DiffResult {
  baseId: string;
  targetId: string;
  segmentDiffs: SegmentDiff[];
  stats: DiffStats;
}

enum DiffType {
  UNCHANGED = 'unchanged',
  MODIFIED = 'modified',
  ADDED = 'added',
  DELETED = 'deleted',
}
```

### 4.5 Merge Engine

Three-way merge with automatic conflict detection:

```typescript
interface MergeResult {
  baseId: string;
  sourceId: string;
  targetId: string;
  autoMerged: AutoMergedFacet[];   // Non-conflicting changes
  conflicts: MergeConflict[];       // Requires resolution
  mergedSegments: Segment[];        // Final merged content
  conflictCount: number;
}

enum ConflictType {
  BOTH_MODIFIED = 'both_modified',
  SOURCE_DELETED = 'source_deleted',
  TARGET_DELETED = 'target_deleted',
}
```

### 4.6 Provider Interfaces

Providers are pluggable for NLP, embedding, and LLM functionality:

```typescript
// NLP Provider (for Ring extraction)
interface NLPProvider {
  analyze(text: string): Promise<NLPAnalysis>;
}

// Embedding Provider (for diff/merge similarity)
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  similarity(a: number[], b: number[]): number;
}

// LLM Provider (optional, for SummaryAgent/MergeAgent)
interface LLMProvider {
  generate(prompt: string, options?: LLMGenerateOptions): Promise<string>;
}
```

---

## 5. Storage Layer Design (`@t3x/storage`)

### 5.1 Database Backends

T3X supports multiple PostgreSQL backends via Drizzle ORM:

| Backend | Use Case | Configuration |
|---------|----------|---------------|
| **PGLite** | Local development | `createPGLiteStorage({ dataDir: '.t3x/database' })` |
| **PostgreSQL** | Docker/production | `createPostgresStorage({ connectionString })` |
| **Supabase** | Cloud deployment | `createSupabaseStorage({ connectionString })` |

### 5.2 Database Schema

```sql
-- Core tables
projects          -- Top-level containers
conversations     -- Turn containers within projects
turns_v2          -- Individual turns with hash chain
branches          -- Git-like branches
commits_v2        -- Semantic snapshots (DAG structure)
drafts_v2         -- LLM-generated drafts
merge_results     -- Cached merge computations
segment_embeddings -- Pre-computed vectors for Ring 3
```

### 5.3 Key Data Structures

**Turn Record:**
```typescript
interface Turn {
  turnHash: string;           // Primary key (sha256:...)
  parentTurnHash: string | null;
  projectId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  language: string | null;
  ringsJson: string | null;   // JSON-encoded RingOutput
  createdAt: Date;
}
```

**Commit Record:**
```typescript
interface Commit {
  commitHash: string;         // Primary key (sha256:...)
  projectId: string;
  branch: string;
  message: string | null;
  parentsJson: string;        // JSON array of parent hashes
  turnWindowJson: string;     // { start_turn_hash, end_turn_hash }
  facetSnapshotJson: string;  // Semantic extraction result
  sourceRefsJson: string | null; // Multi-source references
  createdAt: Date;
}
```

### 5.4 Hash Chains

- **Turn Chain**: `parent_turn_hash → turn_hash` (linked list per conversation)
- **Commit Chain**: `parent_hashes[] → commit_hash` (DAG with branching/merging)

---

## 6. Product Layer Design (`t3x-webui`)

### 6.1 Technology Stack

- **Framework**: Next.js 15 (App Router)
- **State Management**: Zustand
- **Canvas**: ReactFlow
- **Styling**: Tailwind CSS
- **Data Fetching**: Custom hooks with fetch API

### 6.2 REST API Routes

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/v1/projects` | GET, POST | List/create projects |
| `/api/v1/projects/[id]` | GET, PUT, DELETE | Project CRUD |
| `/api/v1/conversations` | GET, POST | List/create conversations |
| `/api/v1/conversations/[id]` | GET, PUT, DELETE | Conversation CRUD |
| `/api/v1/turns` | GET, POST | List/create turns |
| `/api/v1/turns/[hash]` | GET | Get turn by hash |
| `/api/v1/turns/[hash]/chain` | GET | Get turn chain |
| `/api/v1/commits` | GET, POST | List/create commits |
| `/api/v1/commits/[hash]` | GET | Get commit by hash |
| `/api/v1/branches` | GET, POST | List/create branches |
| `/api/v1/branches/current` | GET | Get current branch |
| `/api/v1/branches/switch` | POST | Switch branch |
| `/api/v1/drafts` | GET, POST | List/create drafts |
| `/api/v1/drafts/[id]` | GET, PUT, DELETE | Draft CRUD |
| `/api/v1/diff/two-way` | POST | Two-way diff |
| `/api/v1/diff/three-way` | POST | Three-way diff |
| `/api/v1/merge` | POST | Execute merge |
| `/api/v1/merge/resolve` | POST | Resolve conflicts |
| `/api/v1/export/cfpack` | GET | Export to .cfpack |
| `/api/v1/health` | GET | Health check |
| `/api/v1/status` | GET | System status |

### 6.3 API Response Format

```typescript
// Success response
{ success: true, data: { ... } }

// Error response
{ success: false, error: { code: string, message: string } }
```

API uses snake_case for JSON fields, internal code uses camelCase.

### 6.4 Canvas Architecture

The project canvas uses ReactFlow for visual representation:

- **Nodes**: Conversations, commits (pending/committed), leaf nodes
- **Edges**: Data flow connections
- **Locking**: Committed commits and upstream nodes are immutable

---

## 7. Agentic Layer (Optional)

### 7.1 SummaryAgent

Generates narrative summaries from semantic findings:

- **Input**: Conversation diff, facet snapshot, evidence index
- **Output**: Narrative draft with citations
- **Providers**: OpenAI, Claude, local LLMs, or template-based

### 7.2 MergeAgent

Suggests conflict resolutions for three-way merges:

- **Input**: Base/source/target commits, conflict list
- **Output**: Resolution suggestions with confidence scores
- **Human-in-loop**: User approves/rejects suggestions

---

## 8. Development Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Quick Start

```bash
# Clone and install
git clone https://github.com/t3x-dev/t3x
cd t3x
npm install

# Build packages
npm run build:core
npm run build:storage
npm run build:webui

# Run tests
npm run test:core     # 169 tests
npm run test:storage  # 160 tests
npm run test:webui    # 165 tests

# Start development server
cd t3x-webui
npm run dev           # http://localhost:3000
```

### Docker

```bash
docker-compose up     # Start all services
```

Ports: WebUI (3000), Core API (8000), Runner API (8080), Demo Agent (9000)

---

## 9. Design Principles

1. **Determinism First**: The core layer is 100% reproducible
2. **LLM as Plugin**: Core never depends on specific LLMs
3. **Evidence-Backed**: Every semantic finding traces to source turns
4. **Git-Like UX**: Familiar version control mental model
5. **Progressive Enhancement**: Works offline, improves with models
6. **Minimal Core**: Small inner core, extend via plugins

---

## 10. Key Metrics

### Technical

- Deterministic reproducibility: **100%**
- Test coverage: **494 tests across 3 packages**
- Hash chain integrity: **Cryptographically verified**

### Architecture

- Packages: **3 main + 2 auxiliary**
- API endpoints: **27 routes**
- Database tables: **8 tables**

---

## 11. Comparison

| Feature | ChatGPT | Notion AI | Git | T3X |
|---------|---------|-----------|-----|-----|
| Conversation storage | Yes | Yes | No | Yes |
| Version control | No | No | Yes | Yes |
| Evidence-backed | No | No | No | Yes |
| Verifiable (hashes) | No | No | Yes | Yes |
| Semantic diffing | No | No | No | Yes |
| Branching/merging | No | No | Yes | Yes |
| LLM-agnostic | No | No | N/A | Yes |

---

_Document Version: 3.0_
_Last Updated: 2025-12-23_
