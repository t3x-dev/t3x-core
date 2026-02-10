# T3X Product Overview: Architecture & Design Layer

> This document describes T3X's system architecture, data models, core
> algorithms, API design, and state management — for someone who cannot
> read the source code but needs to understand how the system works
> internally.
>
> Last updated: 2026-02-09

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Three-Layer Design Philosophy](#2-three-layer-design-philosophy)
3. [Data Models](#3-data-models)
4. [Database Schema](#4-database-schema)
5. [Hash Chain & Integrity](#5-hash-chain--integrity)
6. [Core Algorithms](#6-core-algorithms)
7. [API Design](#7-api-design)
8. [State Management (Frontend)](#8-state-management-frontend)
9. [Runner Architecture](#9-runner-architecture)
10. [Data Flow Diagrams](#10-data-flow-diagrams)

---

## 1. System Architecture

### 1.1 Service Topology

T3X is composed of six services, three of which are mandatory and three
optional:

```
┌─────────────────────────────────────────────────────────┐
│                     MANDATORY                            │
│                                                          │
│  ┌──────────┐    HTTP     ┌──────────┐    SQL      ┌──────────┐
│  │  WebUI   │ ──────────> │   API    │ ──────────> │ Database │
│  │ Next.js  │             │  Hono    │             │ Postgres │
│  │ :3000    │ <────────── │  :8000   │ <────────── │ :5432    │
│  └──────────┘    JSON     └──────────┘   Drizzle   └──────────┘
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                │ HTTP (optional)
                                v
┌───────────────────────────────────────────────────────────────────┐
│                      OPTIONAL                                     │
│                                                                   │
│  ┌──────────┐   Webhook    ┌──────────┐   Workflow   ┌──────────┐
│  │  Runner  │ <──────────> │   n8n    │ ──────────>  │  Agent   │
│  │ Express  │   Callback   │ Workflow │   LLM+Tools  │  Demo    │
│  │ :8080    │              │  :5678   │              │  :9000   │
│  └──────────┘              └──────────┘              └──────────┘
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 1.2 Communication Patterns

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| WebUI → API | HTTP REST | All CRUD operations, diff, merge |
| WebUI → API | Server-Sent Events | Streaming chat responses |
| API → Database | SQL (Drizzle ORM) | Data persistence |
| API → Runner | HTTP POST | Trigger evaluation runs |
| Runner → n8n | HTTP Webhook | Trigger agent workflows |
| n8n → Runner | HTTP POST Callback | Return execution results |
| Runner → API | HTTP POST | Ingest evaluation results |
| CLI → API | HTTP REST | Command-line operations |

### 1.3 Database Modes

T3X supports three database backends, all accessed through the same
Drizzle ORM abstraction:

**PGLite (Local Development)**
- PostgreSQL compiled to WebAssembly (WASM)
- Runs in-process — no separate database server needed
- Data stored in `.t3x/database/` directory
- Supports all PostgreSQL features (JSONB, indexes, etc.)
- Caveat: Data can corrupt if process is killed with SIGKILL

**PostgreSQL (Docker / Production)**
- Standard PostgreSQL 16 server
- Connection via `DATABASE_URL` environment variable
- Used in Docker Compose configuration

**Supabase (Cloud)**
- Supabase-hosted PostgreSQL
- Disables prepared statements for Transaction Pool mode compatibility
- Same schema, different connection adapter

### 1.4 Monorepo Structure

```
t3x/
├── packages/                    # Shared libraries
│   ├── core/                    # @t3x/core — Deterministic engine
│   │   ├── src/
│   │   │   ├── common/          # Hash, canonicalization
│   │   │   ├── extractors/      # Ring extraction
│   │   │   ├── diff/            # Diff algorithm
│   │   │   ├── merge/           # Merge algorithm
│   │   │   ├── context/         # Context builder
│   │   │   ├── leaf/            # Leaf generation & validation
│   │   │   ├── storage/         # Hash V4 computation
│   │   │   └── types/           # TypeScript type definitions
│   │   └── dist/                # Built output
│   │
│   ├── storage/                 # @t3x/storage — Database layer
│   │   ├── src/
│   │   │   ├── adapters/        # PGLite, Postgres, Supabase
│   │   │   ├── queries/         # CRUD query functions
│   │   │   ├── migrations/      # V2→V3 migration
│   │   │   ├── schema.ts        # Legacy table definitions
│   │   │   └── schema-v4.ts     # V4 table definitions
│   │   └── dist/
│   │
│   ├── api-client/              # @t3x/api-client — TypeScript client
│   └── runner/                  # @t3x/runner — Shared runner schemas
│
├── apps/                        # Applications
│   ├── web/                     # t3x-webui — Next.js 16 frontend
│   ├── api/                     # @t3x/api — Hono API server
│   ├── runner/                  # @t3x/runner — Evaluation engine
│   ├── cli/                     # @t3x/cli — Command line tool
│   └── agent-demo/              # Demo agent for testing
│
├── biome.json                   # Biome linter/formatter config
├── turbo.json                   # Turborepo pipeline config
├── docker-compose.yml           # Docker service definitions
└── pnpm-workspace.yaml          # pnpm workspace config
```

### 1.5 Dependency Graph

Build order matters — lower packages must be built before higher ones:

```
Level 0 (no deps):     @t3x/core
                            │
Level 1:               @t3x/storage
                        │       │
Level 2:          @t3x/api   t3x-webui   @t3x/cli
                     │                       │
                  (uses @t3x/runner)    (uses @t3x/api-client)
```

Rebuild chain after changes:
- After `@t3x/core` changes: `core → storage → api`
- After `@t3x/storage` changes: `storage → api`
- After `apps/api` changes: `api` only (or just restart dev server)

---

## 2. Three-Layer Design Philosophy

### 2.1 Overview

T3X's architecture enforces strict separation between three layers:

```
┌───────────────────────────────────────────────────────┐
│                  PRODUCT LAYER                         │
│  WebUI, API Server, CLI, Runner                       │
│  Can use LLMs for generation and evaluation           │
├───────────────────────────────────────────────────────┤
│                  STORAGE LAYER                         │
│  PostgreSQL persistence via Drizzle ORM               │
│  No LLM dependency — pure database operations         │
├───────────────────────────────────────────────────────┤
│                  FRAMEWORK CORE                        │
│  Semantic extraction, diff, merge, hash, context      │
│  100% deterministic — NEVER depends on LLMs           │
└───────────────────────────────────────────────────────┘
```

### 2.2 Why This Matters

**Determinism guarantee**: Any operation in the core layer is reproducible.
Given the same inputs, it always produces the same outputs. This means:

- Hash computations are verifiable
- Diff results are consistent
- Merge results are predictable
- No API keys needed for core operations

**LLMs are optional plugins, not dependencies**:

| Operation | Uses LLM? | Module |
|-----------|-----------|--------|
| Ring extraction | Yes (NLP provider) | Core layer (pluggable) |
| Hash computation | No | Core layer |
| Diff computation | No | Core layer |
| Merge preparation | No | Core layer |
| Merge execution | No | Core layer |
| Context building | No | Core layer |
| Constraint validation (exact) | No | Core layer |
| Constraint validation (semantic) | Yes (embeddings) | Core layer (pluggable) |
| Leaf output generation | Yes (Claude API) | Product layer |
| Agent evaluation (rules) | No | Runner |
| Agent evaluation (assertions) | Yes (Claude API) | Runner (optional) |
| Database CRUD | No | Storage layer |

### 2.3 V4 Architecture: Knowledge vs Application

The V4 architecture introduced the most important design decision:
**separating pure knowledge from application concerns**.

**Before V4 (V3):**
```
CommitV3 = {
  sentences: [...],      // Knowledge
  constraints: [...]     // Application concerns (mixed in!)
}
```

**After V4:**
```
CommitV4 = {
  content: {
    sentences: [...]     // ONLY knowledge — pure and reusable
  }
}

Leaf = {
  commit_hash: "...",    // Points to knowledge source
  constraints: [...],    // Application concerns (owned by Leaf)
  output: "...",         // Generated output
  assertions: [...]      // Validation results
}
```

This separation means:
- **One commit, many leaves**: The same knowledge base can produce a tweet,
  an email, and an agent prompt — each with different constraints.
- **Knowledge is reusable**: Commits are pure knowledge, uncontaminated by
  how they'll be used.
- **Application concerns are local**: Constraints, generation config, and
  validation belong to the leaf, not the knowledge.

---

## 3. Data Models

### 3.1 Entity Relationship Overview

```
Project (1) ───────< Conversation (N)
  │                      │
  │                      └───────< Turn (N)
  │
  ├───────< Branch (N)
  │
  ├───────< CommitV4 (N) ────────< Leaf (N) ────────< LeafHistory (N)
  │            │
  │            └── parents[] ──> CommitV4 (DAG structure)
  │
  ├───────< Pin (N)
  │
  └───────< Run (N)

Conversation ──── ConversationContext (1:1)

Leaf ───> CommitV4 (many-to-one via commit_hash)
Pin  ───> Conversation | Leaf (polymorphic via type + ref_id)
```

### 3.2 CommitV4 (Pure Knowledge)

The central data structure. Contains only sentences (knowledge).

```typescript
CommitV4 = {
  // === First-class fields (included in hash computation) ===
  hash: string              // "sha256:" + hex — computed, not user-set
  schema: "t3x/commit/v4"   // Schema version identifier
  parents: string[]          // Parent commit hashes — forms DAG
  author: {
    type: "human" | "agent"
    id?: string              // Author identifier
    name?: string            // Display name
  }
  committed_at: string       // ISO 8601 timestamp
  content: {
    sentences: Sentence[]    // The knowledge payload
  }

  // === Second-class fields (NOT included in hash) ===
  project_id?: string        // Which project owns this
  message?: string           // Human-readable commit message
  branch?: string            // Branch name
  source_refs?: SourceRef[]  // What informed this commit
  position_x?: number        // Canvas X coordinate
  position_y?: number        // Canvas Y coordinate
  created_at?: string        // Record creation time
}
```

**Why the first-class / second-class distinction?**

Only first-class fields are included in the SHA-256 hash. This means:
- Moving a commit on the canvas doesn't change its hash
- Changing the commit message doesn't change its hash
- Reassigning to a different project doesn't change its hash
- The hash uniquely identifies the **knowledge content**

### 3.3 Sentence

The atomic unit of knowledge:

```typescript
Sentence = {
  id: string               // "s_" + nanoid(12), e.g., "s_k8m2n4p7q9"
  text: string              // The knowledge statement
  confidence?: number       // 0.0-1.0, extraction confidence
  source_ref?: {             // Where this sentence came from
    conversation_id: string
    turn_hash: string
    start_char: number       // Start position in turn content
    end_char: number         // End position in turn content
  }
  inherited_from?: string    // Parent commit hash (if inherited)
}
```

**Sentence Inheritance:**

When creating a new commit with a parent, sentences from the parent can
be automatically inherited:

```
Parent Commit (hash: sha256:aaa):
  sentences: [
    { id: "s_001", text: "User likes blue", source_ref: {...} }
    { id: "s_002", text: "Budget is $3000", source_ref: {...} }
  ]

Child Commit (hash: sha256:bbb, parents: ["sha256:aaa"]):
  sentences: [
    { id: "s_new1", text: "Budget is $5000", source_ref: {...} }  // NEW (overrides)
    { id: "s_inh1", text: "User likes blue", inherited_from: "sha256:aaa" }  // INHERITED
  ]
```

Deduplication by text: if a new sentence has the same text as an inherited
one, the new sentence takes priority.

### 3.4 Leaf (Application Layer)

```typescript
Leaf = {
  id: string               // "leaf_" + nanoid(12)
  commit_hash: string       // Source commit for knowledge
  type: LeafType            // Output format type
  title?: string            // Human-readable title
  constraints: Constraint[] // Validation rules
  config: {
    model?: string           // LLM model to use
    max_tokens?: number      // Generation token limit
    temperature?: number     // LLM temperature
    prompt_template?: string // Custom prompt template
    user_instruction?: string // Additional user guidance
  }
  output?: string           // Generated text
  generated_at?: string     // When output was generated
  assertions?: Assertion[]  // Validation results
  project_id: string
  created_at: string
  created_by?: string
}

LeafType = "deploy_agent" | "tweet" | "weibo" | "wechat"
         | "email" | "article" | "slack" | "eval"
```

### 3.5 Constraint

```typescript
// Require constraint: output MUST contain this
RequireConstraint = {
  id: string               // "cst_" + nanoid(12)
  type: "require"
  match_mode: "exact" | "semantic"
  value: string             // The required content
  description?: string      // Human-readable description
  source_sentence_id?: string // Linked commit sentence
}

// Exclude constraint: output MUST NOT contain this
ExcludeConstraint = {
  id: string
  type: "exclude"
  match_mode: "exact" | "semantic"
  value: string             // The forbidden content
  description?: string
  reason?: string            // Why this is excluded
}
```

### 3.6 Assertion

```typescript
Assertion = {
  id: string               // "ast_" + nanoid(12)
  constraint_id: string     // Which constraint was validated
  passed: boolean           // Did it pass?
  details: string           // Human-readable explanation
  lesson?: string           // Feedback for future improvement
}
```

### 3.7 Pin

```typescript
Pin = {
  id: string               // "pin_" + nanoid(12)
  project_id: string
  type: "conversation" | "leaf"
  ref_id: string            // conversation_id or leaf_id
  selected_assertion_ids?: string[] // For leaf pins only
  pinned_at: string
  pinned_by?: string
}
```

### 3.8 ConversationContext

```typescript
ConversationContext = {
  conversation_id: string
  selected_pin_ids: string[] | null  // null = all project pins
  updated_at: string
}
```

### 3.9 Turn

```typescript
Turn = {
  turn_hash: string         // SHA-256 of canonicalized content
  parent_turn_hash: string | null
  project_id: string
  conversation_id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  language?: string
  rings?: RingOutput        // Semantic extraction result (optional)
  created_at: string
}
```

### 3.10 Branch

```typescript
Branch = {
  branch_id: string
  project_id: string
  name: string              // e.g., "main", "feature/research"
  parent_branch?: string
  head_commit_hash?: string
  description?: string
  is_current: boolean       // Only one branch per project is current
  created_at: string
  updated_at: string
}
```

### 3.11 Source Reference (CommitSourceRef)

```typescript
CommitSourceRef = {
  type: "conversation" | "leaf"
  id: string                // conversation_id or leaf_id
  title?: string            // Display name
  assertion_lessons?: string[] // For leaf sources
}
```

### 3.12 ID Prefix Convention

All entity IDs use prefixes for type safety:

| Entity | Prefix | Example | Generator |
|--------|--------|---------|-----------|
| Project | `proj_` | `proj_abc123` | nanoid |
| Conversation | `conv_` | `conv_def456` | nanoid |
| Sentence | `s_` | `s_k8m2n4` | nanoid(12) |
| Constraint | `cst_` | `cst_p7q9r2` | nanoid(12) |
| Assertion | `ast_` | `ast_t5u3v1` | nanoid(12) |
| Leaf | `leaf_` | `leaf_w8x6y4` | nanoid(12) |
| LeafHistory | `lhist_` | `lhist_z2a0b9` | nanoid(12) |
| Pin | `pin_` | `pin_c3d7e5` | nanoid(12) |
| Branch | `branch_` | `branch_f1g8h6` | nanoid |
| Run | `run_` | `run_i4j2k0` | nanoid |
| Commit | `sha256:` | `sha256:abc123...` | SHA-256 hash |
| Turn | `sha256:` | `sha256:def456...` | SHA-256 hash |

---

## 4. Database Schema

### 4.1 Table Inventory

The database contains 16 tables organized in two groups:

**V4 Tables (Current Architecture):**

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `commits_v4` | Pure knowledge snapshots | `hash` TEXT |
| `leaves` | Application-layer outputs | `id` TEXT |
| `leaf_history` | Generation version history | `id` TEXT |
| `pins` | Source/context selection | `id` TEXT |
| `conversation_contexts` | Per-conversation context config | `conversation_id` TEXT |

**Legacy Tables (Still Active):**

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `projects` | Project containers | `project_id` TEXT |
| `conversations` | Recorded dialogues | `conversation_id` TEXT |
| `turns_v2` | Individual messages | `turn_hash` TEXT |
| `branches` | Branch pointers | `branch_id` TEXT |
| `commits_v3` | V3 knowledge snapshots (legacy) | `hash` TEXT |
| `drafts_v2` | LLM-generated drafts | `draft_id` TEXT |
| `merge_drafts` | Pending merge operations | `draft_id` TEXT |
| `deploy_agents` | Registered agents | `deploy_agent_id` TEXT |
| `runs` | Evaluation run records | `run_id` TEXT |
| `segment_embeddings` | Pre-computed vectors | `segment_id` TEXT |
| `commits_v2` | Deprecated V2 commits | `commit_hash` TEXT |

### 4.2 Key Table Details

#### commits_v4

```sql
CREATE TABLE commits_v4 (
  hash           TEXT PRIMARY KEY,        -- "sha256:" + hex
  schema         TEXT NOT NULL DEFAULT 't3x/commit/v4',
  parents        JSONB NOT NULL DEFAULT '[]',  -- string[]
  author         JSONB NOT NULL,          -- { type, id?, name? }
  committed_at   TIMESTAMPTZ NOT NULL,
  content        JSONB NOT NULL,          -- { sentences: Sentence[] }
  project_id     TEXT,                    -- FK to projects (nullable)
  message        TEXT,
  branch         TEXT,
  source_refs    JSONB,                   -- CommitSourceRef[]
  position_x     REAL,
  position_y     REAL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commits_v4_project ON commits_v4 (project_id);
CREATE INDEX idx_commits_v4_branch ON commits_v4 (branch);
CREATE INDEX idx_commits_v4_created_at ON commits_v4 (created_at);
```

#### leaves

```sql
CREATE TABLE leaves (
  id             TEXT PRIMARY KEY,         -- "leaf_" + nanoid
  commit_hash    TEXT NOT NULL,            -- FK to commits_v4 (logical)
  type           TEXT NOT NULL,            -- LeafType enum
  title          TEXT,
  constraints    JSONB NOT NULL DEFAULT '[]',
  config         JSONB NOT NULL DEFAULT '{}',
  output         TEXT,
  generated_at   TIMESTAMPTZ,
  assertions     JSONB,
  project_id     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT
);

CREATE INDEX idx_leaves_commit ON leaves (commit_hash);
CREATE INDEX idx_leaves_project ON leaves (project_id);
CREATE INDEX idx_leaves_type ON leaves (type);
```

#### pins

```sql
CREATE TABLE pins (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  type                   TEXT NOT NULL,     -- 'conversation' | 'leaf'
  ref_id                 TEXT NOT NULL,
  selected_assertion_ids JSONB,
  pinned_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pinned_by              TEXT
);

CREATE INDEX idx_pins_project ON pins (project_id);
CREATE UNIQUE INDEX idx_pins_unique ON pins (project_id, type, ref_id);
```

### 4.3 Cascade Delete Chains

```
DELETE project
  → DELETE conversations
    → DELETE turns_v2
      → DELETE segment_embeddings
    → DELETE conversation_contexts
  → DELETE commits_v3
  → DELETE branches
  → DELETE pins
  → DELETE deploy_agents
  → DELETE runs
  → DELETE drafts_v2

DELETE leaf
  → DELETE leaf_history
```

Note: `commits_v4` and `leaves` do NOT have foreign key constraints to
projects — they use logical references (`project_id` column) but no
database-enforced FK. This is intentional for flexibility.

### 4.4 JSONB Usage

T3X uses JSONB columns extensively for flexible schema-within-schema:

| Table | Column | JSONB Content |
|-------|--------|---------------|
| commits_v4 | parents | `string[]` |
| commits_v4 | author | `{ type, id?, name? }` |
| commits_v4 | content | `{ sentences: Sentence[] }` |
| commits_v4 | source_refs | `CommitSourceRef[]` |
| leaves | constraints | `Constraint[]` |
| leaves | config | `LeafConfig` |
| leaves | assertions | `Assertion[]` |
| pins | selected_assertion_ids | `string[]` |
| conversation_contexts | selected_pin_ids | `string[] | null` |
| runs | result_json | `{ run_report, assertions, evidence_pack }` |
| runs | metadata_json | `{ model, prompt_version, ... }` |
| runs | trace_summary_json | `{ trajectory, tokens, latency_ms }` |

---

## 5. Hash Chain & Integrity

### 5.1 Turn Hash Chain

Turns form a singly-linked list via parent hashes:

```
Turn 1: hash=sha256:aaa, parent=null
  ↑
Turn 2: hash=sha256:bbb, parent=sha256:aaa
  ↑
Turn 3: hash=sha256:ccc, parent=sha256:bbb
```

**Turn hash computation:**
1. Create a JSON object with: `role`, `content`, `parent_turn_hash`,
   `conversation_id`, `project_id`
2. Canonicalize using JCS (RFC 8785)
3. Compute SHA-256 of the canonical JSON
4. Prefix with `"sha256:"`

This ensures:
- Same conversation content always produces the same hash
- Modifying any turn invalidates all subsequent hashes
- Hash chain is cryptographically verifiable

### 5.2 Commit Hash Chain (DAG)

Commits form a Directed Acyclic Graph (DAG), not a simple chain:

```
            C1 (root)
           / \
          C2   C3      ← branching
          |    |
          C4   C5
           \ /
            C6          ← merge commit (two parents)
```

**CommitV4 hash computation:**

Only first-class fields are included:

```typescript
function computeCommitV4Hash(commit: CommitV4FirstClass): string {
  const payload = {
    schema: commit.schema,           // "t3x/commit/v4"
    parents: commit.parents,          // ["sha256:aaa", ...]
    author: commit.author,            // { type, id?, name? }
    committed_at: commit.committed_at, // ISO 8601
    content: {
      sentences: commit.content.sentences.map(s => ({
        id: s.id,
        text: s.text,
        confidence: s.confidence,
        source_ref: s.source_ref
        // NOTE: inherited_from is EXCLUDED from hash
      }))
    }
  }
  const canonical = JCS.canonicalize(payload)
  return "sha256:" + SHA256(canonical)
}
```

**Excluded from hash:**
- `project_id` — organizational metadata
- `message` — human-readable, not content
- `branch` — pointer, not content
- `source_refs` — metadata about sources
- `position_x`, `position_y` — UI coordinates
- `created_at` — record timestamp
- `inherited_from` on sentences — inheritance metadata

### 5.3 Text Canonicalization

Before hashing text, T3X normalizes it:

```typescript
function canonText(s: string): string {
  return s
    .normalize('NFKC')           // Unicode compatibility normalization
    .toLowerCase()                // Case normalization
    .trim()                       // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ')        // Collapse multiple spaces
}
```

This ensures that trivial formatting differences don't produce
different hashes.

### 5.4 JSON Canonicalization (JCS)

T3X uses RFC 8785 JSON Canonicalization Scheme:

- Keys sorted alphabetically
- No unnecessary whitespace
- Numbers in shortest representation
- Unicode escape normalization

This ensures the same JSON object always serializes to the exact same
byte sequence, regardless of key order or formatting.

---

## 6. Core Algorithms

### 6.1 Semantic Extraction (Ring System)

The `RingExtractor` class processes turn content in three levels:

#### Ring 1: Keyword Axis

**Input:** Turn text content
**Output:** Keywords, entities, polarity, time anchor, topic, anchor candidates

**Process:**

1. **NLP Analysis**: Send text to NLP provider (Google Cloud NLP) for
   dependency parsing, entity recognition, and sentence segmentation.

2. **Keyword Extraction**:
   - Filter tokens by POS tags: NOUN, PROPN, VERB, ADJ
   - Deduplicate by lemma (lowercase)
   - Filter 270+ stop words
   - Annotate with entity type and confidence

3. **Polarity Annotation**:
   - Analyze dependency tree for verb-object relations
   - Positive polarity (+1): "likes", "prefers", "wants"
   - Negative polarity (-1): "hates", "avoids", "dislikes"
   - Neutral (0): default

4. **Named Entity Recognition**:
   - Extract entities: PERSON, ORGANIZATION, LOCATION, DATE, etc.
   - Filter by minimum salience (0.01)

5. **Time Anchor**:
   - Extract DATE/TIME entities
   - Select most salient date entity

6. **Topic Detection**:
   - First NOUN/PROPN that isn't a stop word

7. **Anchor Candidates** (v1.1):
   - Phase patterns with regex (money, percent, duration, date, number)
   - Named entities with positions
   - Term tokens (high-salience nouns/proper nouns)
   - Priority: Phrase > Entity > Term (with overlap prevention)

**Confidence Scores:**

| Pattern | Confidence |
|---------|-----------|
| Money ($5000) | 0.95 |
| Percent (15%) | 0.95 |
| Duration (30 days) | 0.90 |
| Date (January 2025) | 0.90 |
| Number (123) | 0.70 |

#### Ring 2: Facets (Light Relations)

**Input:** Ring 1 data + dependency tree
**Output:** Intent seeds, time windows, preferences, question slots

**Facet Types:**

| Facet | Detection | Confidence |
|-------|-----------|-----------|
| `intent_seed` | ROOT verb → category mapping | 0.9 |
| `time_window` | DATE entities → range | 0.8 |
| `preference_soft` | Polarity keywords → prefer/avoid | 0.7 |
| `unknown_slot` | Question words (what, who, etc.) | 0.6 |

**Intent Mapping:**

| Root Verb Pattern | Intent Category |
|-------------------|----------------|
| ask, request, want | request |
| like, prefer, love | preference |
| plan, schedule, arrange | planning |
| book, reserve | booking |
| search, find, look | search |
| compare, vs | comparison |
| buy, purchase, order | purchase |

#### Ring 3: Sentence Structure

**Input:** NLP sentence segmentation result
**Output:** Segment list with IDs and positions

```typescript
Segment = {
  segmentId: "s-1" | "s-2" | ...  // 1-indexed
  text: string
  startChar: number
  endChar: number
}
```

Ring 3 segments are the candidates for commit sentences.

### 6.2 Diff Algorithm

The diff algorithm compares two commits at the sentence level using a
**4-stage pipeline**:

#### Stage 1: Exact Match — O(N+M)

Uses hash sets for fast lookup. Any sentence that appears in both commits
with identical text (case-sensitive) is classified as "identical".

```
Source: ["A", "B", "C"]
Target: ["B", "D", "A"]
Identical: ["A", "B"]
Unmatched Source: ["C"]
Unmatched Target: ["D"]
```

#### Stage 2: Jaccard Similarity Matrix — O(N×M)

For all unmatched sentences, compute pairwise Jaccard similarity:

```
Jaccard(A, B) = |words(A) ∩ words(B)| / |words(A) ∪ words(B)|
```

**Tokenization:**
1. Convert to lowercase
2. Split by whitespace
3. Filter empty strings
4. Keep punctuation attached to words

**Example:**
```
A = "The budget is $3000"
B = "The budget is $5000"

words(A) = {"the", "budget", "is", "$3000"}
words(B) = {"the", "budget", "is", "$5000"}
intersection = {"the", "budget", "is"} → 3
union = {"the", "budget", "is", "$3000", "$5000"} → 5
Jaccard = 3/5 = 0.6
```

**Threshold:** Jaccard >= 0.3 means the sentences are related enough
to be considered "similar". Below 0.3, there's too little word overlap
for a meaningful comparison.

#### Stage 3: Hungarian Algorithm — O(n³)

The Jaccard matrix may have multiple candidate matches for each sentence.
The Hungarian algorithm (Kuhn-Munkres) finds the globally optimal
one-to-one matching that maximizes total similarity.

```
Similarity Matrix:
           Target1   Target2   Target3
Source1    [0.6       0.2       0.0]
Source2    [0.1       0.8       0.3]
Source3    [0.0       0.1       0.5]

Optimal matching:
  Source1 ↔ Target1 (0.6)
  Source2 ↔ Target2 (0.8)
  Source3 ↔ Target3 (0.5)
Total: 1.9 (maximum possible)
```

Only pairs with Jaccard >= 0.3 are kept. Lower matches are discarded
and the sentences go to "only in source" or "only in target".

**Implementation Details:**
- Non-square matrices are padded to square
- Converts to minimization: `cost = maxSimilarity - similarity`
- Results sorted by source index

#### Stage 4: LCS Word Diff — O(K × W²)

For each matched pair, compute word-level differences using the Longest
Common Subsequence (LCS) algorithm:

**LCS Algorithm:**
```
Input:  from = ["budget", "is", "$3000"]
        to   = ["budget", "is", "$5000"]

LCS = ["budget", "is"]  (longest common subsequence)

Word Diff:
  [unchanged: "budget"] [unchanged: "is"] [removed: "$3000"] [added: "$5000"]
```

**Complexity:** O(W²) per sentence pair, where W is word count. For K
matched pairs, total is O(K × W²).

**Remaining Classification:**
- Unmatched source sentences → `onlyInSource`
- Unmatched target sentences → `onlyInTarget`

#### Diff Output Structure

```typescript
CommitDiff = {
  identical: DiffableSentence[]     // Exact text match
  similar: SentencePair[]           // Jaccard >= 0.3, with word diff
  onlyInSource: DiffableSentence[]  // Only in source commit
  onlyInTarget: DiffableSentence[]  // Only in target commit
}

SentencePair = {
  source: DiffableSentence
  target: DiffableSentence
  similarity: number                // Jaccard score (0.3-1.0)
  wordDiff: WordDiffSegment[]       // Word-level changes
}

WordDiffSegment = {
  type: "unchanged" | "added" | "removed"
  text: string
}
```

### 6.3 Merge Algorithm

Two-phase process: prepare (analyze) → user decisions → execute (apply).

#### Phase 1: prepareMerge

**Input:** Source commit sentences, target commit sentences
**Output:** Merge preparation with four categories

```typescript
Merge2WayResult = {
  identical: DiffableSentence[]
  similarPairs: MergeSimilarPair[]
  onlyInSource: MergeCandidate[]
  onlyInTarget: MergeCandidate[]
}

MergeSimilarPair = {
  source: DiffableSentence
  target: DiffableSentence
  wordDiff: WordDiffSegment[]
  resolution?: "source" | "target"   // User must set this
}

MergeCandidate = {
  sentence: DiffableSentence
  keep: boolean | null               // User must decide
}
```

Internally calls `diffCommits()` and maps the result.

#### Phase 2: executeMerge

**Input:** Prepared merge with all resolutions set
**Output:** New CommitV4 with two parents

**Process:**

1. **Validate**: Throw error if any `similarPair` has no resolution.

2. **Collect sentences**:
   - Add all `identical` sentences (from source)
   - For each `similarPair`:
     - `resolution === 'source'` → add source sentence
     - `resolution === 'target'` → add target sentence
   - For each `onlyInSource` where `keep === true` → add
   - For each `onlyInTarget` where `keep === true` → add

3. **Generate new IDs**: Deterministic ID generation:
   ```
   newId = "s_" + sha256(sourceHash + ":" + targetHash + ":" + originalId).slice(0, 12)
   ```
   This ensures the same merge of the same commits always produces the
   same sentence IDs.

4. **Preserve source_ref**: Each sentence keeps its original source
   reference for traceability.

5. **Create commit**: Build CommitV4 with:
   - `parents: [sourceHash, targetHash]`
   - `schema: "t3x/commit/v4"`
   - Compute hash from first-class fields

### 6.4 Context Builder

Assembles LLM context from commits and pins.

#### buildConversationContext

**Input:** Current commit, project pins, conversation context config
**Output:** Built context with text, token estimate, and sources

**Assembly Order:**

```
## Current Knowledge
[Commit sentences, numbered]

## Recent Discussions
[Pinned conversation turns, by conversation]

## Previous Outputs & Lessons
[Pinned leaf outputs (truncated to 200 chars) + assertion lessons]
```

**Pin Filtering:**
- Config `null` → all project pins included
- Config `[]` → no pins included
- Config `["pin_a", "pin_b"]` → only these pins

**Token Estimation:**
```
tokens ≈ ceil(text.length / 4)
```

### 6.5 Leaf Generation

#### Prompt Building

For each leaf type, the prompt is structured as:

```
System: [Type-specific instructions]

User:
## Source Knowledge
1. [Sentence 1]
2. [Sentence 2]
...

## Constraints
- MUST include EXACTLY: "value"
- MUST NOT include exactly: "value" (Reason: ...)

## Context
[Leaf title if present]

## Additional Instructions
[User instructions if provided]

## Task
Generate [leaf type] based on the above knowledge and constraints.
```

**Type-Specific Instructions:**

| Type | Key Instructions |
|------|-----------------|
| `tweet` | 280 char max, concise, hashtags sparingly |
| `weibo` | Chinese, 2000 char max, emojis okay |
| `wechat` | Chinese, clear formatting |
| `article` | Title, headings, intro/conclusion |
| `email` | Greeting, professional, sign-off |
| `slack` | Conversational, scannable, basic formatting |
| `deploy_agent` | Structured, precise, unambiguous |
| `eval` | Comprehensive evaluation content |

#### Auto-Retry with Constraint Validation

```
MAX_GENERATION_ATTEMPTS = 3

Attempt 1: Generate → Validate
  ├── All passed → Return
  └── Some failed → Build retry feedback

Attempt 2: Generate (with feedback) → Validate
  ├── All passed → Return
  └── Some failed → Build retry feedback

Attempt 3: Generate (with feedback) → Validate
  └── Return regardless (with validation results)
```

The retry uses multi-turn conversation format — each failed attempt's
feedback is appended to the message history so the LLM can learn from
its mistakes.

### 6.6 Constraint Validation

**Validation Thresholds:**

| Constraint | Match Mode | Rule | Threshold |
|------------|------------|------|-----------|
| REQUIRE | exact | Case-insensitive substring search | — |
| REQUIRE | semantic | Cosine similarity of embeddings | >= 0.85 |
| EXCLUDE | exact | String must NOT appear | — |
| EXCLUDE | semantic | Cosine similarity of embeddings | < 0.70 |

**Exact Validation:**
```
REQUIRE exact "budget": output.toLowerCase().includes("budget")
EXCLUDE exact "competitor": !output.toLowerCase().includes("competitor")
```

**Semantic Validation:**
```
REQUIRE semantic "affordable pricing":
  cosine(embed(output), embed("affordable pricing")) >= 0.85

EXCLUDE semantic "offensive language":
  cosine(embed(output), embed("offensive language")) < 0.70
```

The gap between 0.85 (require) and 0.70 (exclude) is intentional:
- Require needs high confidence (similar meaning present)
- Exclude allows more tolerance (some topical overlap is okay,
  only truly similar content should fail)

---

## 7. API Design

### 7.1 Design Principles

**RESTful with OpenAPI:**
- Every endpoint has an OpenAPI specification
- Interactive docs at `/api/docs` (Scalar UI)
- Machine-readable spec at `/api/openapi.json`

**Consistent Response Format:**
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

**Naming Convention:**
- API JSON fields: `snake_case` (e.g., `project_id`, `turn_hash`)
- JavaScript variables: `camelCase` (e.g., `projectId`, `turnHash`)

### 7.2 Endpoint Categories

The API has approximately 65+ endpoints organized into these groups:

| Category | Count | Base Path |
|----------|-------|-----------|
| Health/Status | 2 | `/health`, `/api/v1/status` |
| Projects | 5 | `/api/v1/projects` |
| Conversations | 8 | `/api/v1/conversations` |
| Turns | 4 | `/api/v1/turns` |
| Commits V3 (legacy) | 3 | `/api/v1/commits-v3` |
| Commits V4 | 6 | `/api/v1/commits-v4` |
| Leaves | 10 | `/api/v1/leaves` |
| Pins | 5 | `/api/v1/projects/:id/pins` |
| Branches | 4 | `/api/v1/branches` |
| Diff | 2 | `/api/v1/diff` |
| Merge | 5 | `/api/v1/merge` |
| Chat | 3 | `/api/v1/chat` |
| Draft Generation | 3 | `/api/v1/agent/drafts` |
| Curate Preview | 1 | `/api/v1/curate/preview` |
| Export | 2 | `/api/v1/export` |
| Deploy Agents | 5 | `/api/v1/deploy-agents` |
| Runs | 8 | `/api/v1/runs` |
| Runner Proxy | 6 | `/api/v1/runner` |

### 7.3 Key Endpoint Flows

#### Commit Creation Flow

```
POST /api/v1/commits-v4
  Body: { parents, author, sentences, project_id, branch, ... }

Server:
  1. Validate project exists
  2. Validate parent commits exist (if strict mode)
  3. If main branch: validate linearity
  4. If inherit_parent_sentences: merge parent sentences
  5. Compute SHA-256 hash from first-class fields
  6. Insert into commits_v4 table
  7. Update branch head
  8. Return CommitV4 with computed hash
```

#### Leaf Generation Flow

```
POST /api/v1/leaves/:id/generate
  Body: {} (empty)

Server:
  1. Load leaf from database
  2. Load source commit (by leaf.commit_hash)
  3. Build prompt: sentences + constraints + type instructions
  4. Call Claude API (up to 3 attempts with retry on constraint failure)
  5. Validate output against constraints (exact only in auto-retry)
  6. Save output to leaf
  7. Save generation to leaf_history
  8. Return { output, validation results }
```

#### Merge Flow

```
Step 1: POST /api/v1/merge/prepare
  Body: { source_hash, target_hash }
  Returns: { identical, similarPairs, onlyInSource, onlyInTarget }

Step 2: User resolves all conflicts in WebUI

Step 3: POST /api/v1/merge/execute
  Body: { source_hash, target_hash, prepared (with resolutions), message }
  Returns: New CommitV4 with two parents
```

### 7.4 Error Code Taxonomy

| Category | Codes | HTTP Status |
|----------|-------|-------------|
| Client Errors | `INVALID_REQUEST`, `INVALID_JSON` | 400 |
| Not Found | `NOT_FOUND`, `*_NOT_FOUND` | 404 |
| Conflicts | `DUPLICATE_PIN`, `MAIN_ROOT_EXISTS`, `MAIN_NOT_HEAD` | 409 |
| Configuration | `GENERATION_NOT_CONFIGURED`, `SEMANTIC_NOT_CONFIGURED` | 400 |
| Rate Limiting | `RATE_LIMITED` | 429 |
| Auth | `AUTH_ERROR` | 401 |
| Server | `INTERNAL_ERROR`, `*_FAILED` | 500 |
| Upstream | `UPSTREAM_ERROR`, `PROXY_ERROR` | 500/502 |

---

## 8. State Management (Frontend)

### 8.1 Overview

The WebUI uses **Zustand** for state management with a slice pattern
for modular organization.

### 8.2 Store Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    canvasStore                           │
│  (Main workspace state)                                 │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Core State   │  │ Merge Slice  │  │ Leaf Slice   │  │
│  │  - nodes      │  │ - merge ops  │  │ - leaf panel │  │
│  │  - edges      │  │ - selectors  │  │ - methods    │  │
│  │  - actions    │  │ - state      │  │ - state      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ projectStore │  │  pinsStore   │  │ mergeWork-   │
│ - projects   │  │ - pins CRUD  │  │ spaceStore   │
│ - CRUD       │  │ - caching    │  │ - merge draft│
│ - API errors │  │ - selectors  │  │ - resolutions│
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ agentDemo-   │  │ optimiser-   │
│ Store        │  │ Store        │
│ - chat sim   │  │ - persisted  │
│ - feedback   │  │ - chart prefs│
│ - sandbox    │  │ - comparison │
└──────────────┘  └──────────────┘
```

### 8.3 Canvas Store (Main)

The canvas store manages the XYFlow graph and all workspace operations:

**Core State:**
- `nodes`: XYFlow node array (conversations, commits, leaves)
- `edges`: XYFlow edge array (connections between nodes)
- `projectId`: Current project
- `loading`: Loading states
- `error`: Error states

**Key Actions:**
- `loadProject(projectId)`: Fetch all data and build graph
- `createConversation(title)`: Add conversation node
- `createCommitV4(data)`: Create and add commit node
- `createLeaf(data)`: Create and add leaf node
- `deleteNode(nodeId)`: Remove node with confirmation
- `autoLayout()`: Run ELK.js layout algorithm

**Slice: canvasMergeSlice**
- State: `mergeSourceHash`, `mergeTargetHash`, `mergePrepared`
- Methods: `prepareMerge()`, `executeMerge()`, `cancelMerge()`
- Selectors: `canMerge()`, `getMergePreview()`

**Slice: canvasLeafSlice**
- State: `selectedLeafId`, `leafPanelOpen`
- Methods: `openLeafPanel()`, `closeLeafPanel()`, `selectLeaf()`

### 8.4 Pins Store

Manages V4 pin operations with per-project caching:

**State:**
- `pinsByProject`: Map<projectId, Pin[]>
- `loading`: boolean
- `error`: string | null

**Actions:**
- `loadPins(projectId)`: Fetch pins from API
- `createPin(projectId, type, refId)`: Pin an item
- `deletePin(pinId)`: Unpin an item
- `updatePinAssertions(pinId, assertionIds)`: Update selections
- `isPinned(projectId, type, refId)`: Check pin status

### 8.5 Merge Workspace Store

Manages the full-screen merge workspace:

**State:**
- `draft`: MergeDraft (source, target, prepared, status)
- `resolutions`: Map of user decisions
- `autoSaving`: boolean
- `sourceContextCache`: Map of cached source contexts

**Actions:**
- `loadDraft(draftId)`: Load merge draft from API
- `setResolution(pairIndex, resolution)`: Set conflict resolution
- `toggleKeep(category, index)`: Toggle keep/discard for unique sentences
- `commitMerge()`: Execute merge and create commit
- `cancelMerge()`: Cancel and return to canvas

### 8.6 Data Flow Pattern

```
User Action (click button)
  → Store Action (canvasStore.createCommitV4)
    → API Call (api.createCommitV4)
      → HTTP POST to Hono server
        → Storage Query (createCommitV4 in @t3x/storage)
          → Database INSERT
        ← Return CommitV4
      ← Return JSON response
    ← Update store state
  ← Re-render components
```

---

## 9. Runner Architecture

### 9.1 Design Philosophy

The Runner follows T3X's core principle: **deterministic evaluation
without LLM dependency**.

```
┌─────────────────────────────────────────────────┐
│              DETERMINISTIC LAYER                 │
│  (same inputs → same outputs, always)           │
│                                                  │
│  Observer → EvalEngine → Operators               │
│  (collect)   (evaluate)   (check rules)          │
├─────────────────────────────────────────────────┤
│              OPTIONAL LLM LAYER                  │
│  (assertions only, never affects pass/fail)      │
│                                                  │
│  LLM Asserter → Human-readable explanations     │
└─────────────────────────────────────────────────┘
```

### 9.2 Execution Model

**Three-Phase Process:**

1. **Collection**: Capture agent execution trace
   - n8n mode: Fetch execution data via n8n REST API
   - SDK mode: Intercept calls via Observer class

2. **Evaluation**: Apply deterministic rules
   - Load rules from YAML/JSON file
   - Run each rule against the trace
   - Calculate weighted scores
   - Determine pass/fail

3. **Assertion** (optional): Generate explanations
   - Requires ANTHROPIC_API_KEY
   - Generates human-readable assertion text
   - Does NOT affect pass/fail judgment

### 9.3 Rule System

**Rule File Format (YAML):**

```yaml
version: "1.0"
name: "weather-agent-eval"
pass_threshold: 0.7
rules:
  - id: "output_exists"
    type: "basic"
    target: "output"
    check: "exists"
    weight: 0.2
    severity: "error"

  - id: "uses_weather_api"
    type: "tool_use"
    check: "expected_tools"
    expected: ["weather_api"]
    weight: 0.3
    severity: "error"

  - id: "efficient_trajectory"
    type: "trajectory"
    check: "step_count"
    max: 5
    weight: 0.2
    severity: "warning"
```

**Score Calculation:**
```
score = sum(passed_rule.weight) / sum(all_rules.weight)
passed = score >= pass_threshold
```

**Dimension Scoring:**

Rules map to five evaluation dimensions:
- `basic` rules → `task_completion` dimension
- `tool_use` rules → `tool_use` dimension
- `trajectory` rules → `trajectory_efficiency` dimension
- `cost` rules → `cost_efficiency` dimension
- `performance` rules → `latency` dimension

### 9.4 Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `exists` | Value is not null/undefined | Output exists |
| `not_empty` | String/array is non-empty | Output has content |
| `equals` | Exact match | Status = "success" |
| `contains` | Substring match | Output contains "greeting" |
| `regex` | Pattern match | Output matches `/\d{3}-\d{4}/` |
| `range` | Numeric range | Token count 50-500 |
| `some` | At least one matches | Some tool succeeded |
| `all` | All match | All steps completed |
| `none` | None match | No errors occurred |
| `expected_tools` | Required tools used | Used weather_api |
| `no_unknown_tools` | No unexpected tools | Only known tools |
| `step_count` | Steps within range | 2-5 steps |
| `no_repeated_steps` | No duplicate steps | No loops |
| `total_tokens` | Token budget | Under 1000 tokens |
| `total_latency_ms` | Time budget | Under 5000ms |

### 9.5 Statistical Comparison

The A/B comparison uses proper statistical tests:

**Two-Proportion Z-Test (Pass Rate):**
```
H0: p_control = p_treatment
z = (p1 - p2) / sqrt(p_pooled * (1 - p_pooled) * (1/n1 + 1/n2))
Significant if p_value < 0.05
```

**Two-Sample T-Test (Average Score):**
```
H0: μ_control = μ_treatment
t = (x̄1 - x̄2) / sqrt(s1²/n1 + s2²/n2)
Welch's t-test (unequal variances)
Significant if p_value < 0.05
```

---

## 10. Data Flow Diagrams

### 10.1 Knowledge Extraction Flow

```
User writes message in conversation
  │
  v
POST /api/v1/turns
  │
  ├── Compute turn_hash (SHA-256 of canonicalized JSON)
  ├── Link to parent_turn_hash
  ├── [Optional] Run Ring extraction:
  │     ├── Ring 1: Keywords, entities, polarity
  │     ├── Ring 2: Intent, preferences, questions
  │     └── Ring 3: Sentence segmentation
  └── Insert into turns_v2 table
  │
  v
User creates commit from conversations
  │
  v
POST /api/v1/commits-v4
  │
  ├── Load parent commit sentences (if inheriting)
  ├── Merge new + inherited sentences (deduplicate by text)
  ├── Compute commit hash (SHA-256 of first-class fields)
  ├── Validate main branch linearity (if applicable)
  ├── Insert into commits_v4 table
  └── Update branch head
```

### 10.2 Leaf Generation Flow

```
User creates leaf from commit
  │
  v
POST /api/v1/leaves
  │
  ├── Validate commit exists
  ├── Generate constraint IDs
  └── Insert into leaves table
  │
  v
User clicks "Generate"
  │
  v
POST /api/v1/leaves/:id/generate
  │
  ├── Load commit sentences
  ├── Build prompt:
  │     ├── System: type-specific instructions
  │     ├── Knowledge: numbered sentences
  │     ├── Constraints: require/exclude rules
  │     └── Instructions: user guidance
  │
  ├── Attempt 1: Call Claude API
  │     ├── Validate output against constraints
  │     ├── If all pass → Save & return
  │     └── If any fail → Build retry feedback
  │
  ├── Attempt 2: Call Claude API (with feedback)
  │     ├── Validate output
  │     ├── If all pass → Save & return
  │     └── If any fail → Build retry feedback
  │
  └── Attempt 3: Call Claude API (with feedback)
        ├── Save output regardless
        ├── Save to leaf_history
        └── Return with validation results
```

### 10.3 Merge Flow

```
User initiates merge (source branch → target branch)
  │
  v
POST /api/v1/merge/prepare
  │
  ├── Load source commit sentences
  ├── Load target commit sentences
  ├── Run 4-stage diff pipeline:
  │     ├── Stage 1: Exact match (hash sets)
  │     ├── Stage 2: Jaccard similarity matrix
  │     ├── Stage 3: Hungarian optimal matching
  │     └── Stage 4: LCS word diff
  └── Return merge preview
  │
  v
User resolves conflicts in merge workspace
  │ (sets resolution for each similar pair)
  │ (decides keep/discard for unique sentences)
  │
  v
POST /api/v1/merge/execute
  │
  ├── Validate all resolutions set
  ├── Collect final sentence list
  ├── Generate deterministic IDs
  ├── Create CommitV4 with parents: [source, target]
  ├── Compute hash
  └── Insert and return
```

### 10.4 Agent Evaluation Flow

```
User creates run in WebUI
  │
  v
POST /api/v1/runs (Engine)
  │
  ├── Create run record (status: queued)
  ├── Send webhook to n8n
  └── Return run_id
  │
  v
n8n receives webhook
  │
  ├── Execute AI Agent workflow
  │     ├── LLM calls (GPT-4, Claude, etc.)
  │     ├── Tool calls (search, email, etc.)
  │     └── Generate output
  │
  └── Send callback to Runner
  │
  v
POST /callbacks/n8n (Runner)
  │
  ├── Phase 1: Immediate response (200 OK to n8n)
  │
  └── Phase 2: Async processing
        ├── Fetch execution trace from n8n API
        ├── Map n8n data to RunRecord format
        ├── Load evaluation rules
        ├── Run deterministic evaluation
        │     ├── Check each rule against trace
        │     ├── Calculate weighted scores
        │     └── Determine pass/fail
        ├── [Optional] Generate LLM assertions
        └── POST /api/v1/runs/ingest (Engine)
              ├── Update run status
              ├── Store results and trace
              └── WebUI polls and displays results
```

### 10.5 Context Assembly Flow

```
LLM needs context for conversation
  │
  v
GET /api/v1/conversations/:id/memory
  │
  ├── Load conversation's context config
  │     ├── null → use all project pins
  │     ├── [] → no pins
  │     └── [...ids] → specific pins
  │
  ├── Load branch HEAD commit sentences
  │     └── "## Current Knowledge" section
  │
  ├── Load pinned conversations (filtered)
  │     ├── Fetch turns for each
  │     └── "## Recent Discussions" section
  │
  ├── Load pinned leaves (filtered)
  │     ├── Output text (truncated to 200 chars)
  │     ├── Selected assertion lessons
  │     └── "## Previous Outputs & Lessons" section
  │
  ├── Estimate tokens (text.length / 4)
  │
  └── Return { text, token_estimate, sources }
```

---

*End of Document 2: Architecture & Design Layer*
*Total: ~1000 lines*
