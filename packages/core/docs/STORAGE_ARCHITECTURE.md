# T3X Storage Architecture

**PostgreSQL Persistence Layer with Drizzle ORM**

---

## Overview

T3X uses PostgreSQL as its storage backend, accessed through Drizzle ORM. The storage layer supports multiple deployment scenarios through interchangeable adapters.

---

## Storage Backends

| Backend | Use Case | Data Location |
|---------|----------|---------------|
| **PGLite** | Local development | `.t3x/database/` (WASM PostgreSQL) |
| **PostgreSQL** | Docker/production | Docker container or external server |
| **Supabase** | Cloud deployment | Supabase cloud instance |

### Backend Selection

```typescript
// Local development (PGLite)
import { createPGLiteStorage } from '@t3x/storage';
const db = await createPGLiteStorage({ dataDir: '.t3x/database' });

// Docker/Production (PostgreSQL)
import { createPostgresStorage } from '@t3x/storage';
const db = await createPostgresStorage({
  connectionString: process.env.DATABASE_URL
});

// Cloud (Supabase)
import { createSupabaseStorage } from '@t3x/storage';
const db = await createSupabaseStorage({
  connectionString: process.env.SUPABASE_URL
});
```

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
│   projects   │◄──────│  conversations  │◄──────│   turns_v2   │
│              │       │                 │       │              │
│ project_id   │       │ conversation_id │       │ turn_hash    │
│ name         │       │ project_id (FK) │       │ parent_hash  │
│ created_at   │       │ title           │       │ conv_id (FK) │
│ metadata     │       │ parent_commit   │       │ role         │
└──────────────┘       │ position_x/y    │       │ content      │
       │               │ created_at      │       │ rings_json   │
       │               └─────────────────┘       │ created_at   │
       │                                         └──────────────┘
       │
       ▼
┌──────────────┐       ┌─────────────────┐       ┌──────────────┐
│   branches   │       │   commits_v2    │       │  drafts_v2   │
│              │       │                 │       │              │
│ branch_id    │       │ commit_hash     │       │ draft_id     │
│ project_id   │       │ project_id (FK) │       │ project_id   │
│ name         │       │ branch          │       │ conv_id (FK) │
│ head_commit  │       │ parents_json    │       │ base_commit  │
│ is_current   │       │ turn_window     │       │ bridge_id    │
│ created_at   │       │ facet_snapshot  │       │ text         │
└──────────────┘       │ source_refs     │       │ status       │
                       │ created_at      │       │ created_at   │
                       └─────────────────┘       └──────────────┘

┌──────────────────┐   ┌─────────────────────┐
│  merge_results   │   │  segment_embeddings │
│                  │   │                     │
│ merge_result_id  │   │ segment_id          │
│ project_id (FK)  │   │ turn_hash (FK)      │
│ base_commit      │   │ segment_index       │
│ source_commit    │   │ segment_text        │
│ target_commit    │   │ embedding_model     │
│ status           │   │ embedding (bytea)   │
│ auto_merged      │   │ created_at          │
│ conflicts        │   └─────────────────────┘
│ created_at       │
└──────────────────┘
```

---

## Table Definitions

### projects

Top-level container for all T3X data.

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | TEXT PK | Unique identifier (e.g., `proj_abc123`) |
| `name` | TEXT | Human-readable project name |
| `created_at` | TIMESTAMP | Creation timestamp |
| `metadata_json` | TEXT | Optional JSON metadata |

### conversations

Container for turns within a project.

| Column | Type | Description |
|--------|------|-------------|
| `conversation_id` | TEXT PK | Unique identifier (e.g., `conv_xyz789`) |
| `project_id` | TEXT FK | Reference to projects |
| `title` | TEXT | Optional conversation title |
| `parent_commit_hash` | TEXT | Optional parent commit reference |
| `position_x` | REAL | Canvas X position |
| `position_y` | REAL | Canvas Y position |
| `created_at` | TIMESTAMP | Creation timestamp |
| `metadata_json` | TEXT | Optional JSON metadata |

### turns_v2

Individual conversation turns with hash chain.

| Column | Type | Description |
|--------|------|-------------|
| `turn_hash` | TEXT PK | SHA-256 content hash (e.g., `sha256:...`) |
| `parent_turn_hash` | TEXT | Previous turn in chain (NULL for first) |
| `project_id` | TEXT FK | Reference to projects |
| `conversation_id` | TEXT FK | Reference to conversations |
| `role` | TEXT | `user` \| `assistant` \| `system` \| `tool` |
| `content` | TEXT | Message content |
| `language` | TEXT | Detected language code |
| `rings_json` | TEXT | JSON-encoded Ring 1/2/3 extraction |
| `created_at` | TIMESTAMP | Creation timestamp |

**Hash Chain**: Each turn's `turn_hash` is computed from its content and `parent_turn_hash`, forming an immutable linked list.

### branches

Git-like branches for versioning.

| Column | Type | Description |
|--------|------|-------------|
| `branch_id` | TEXT PK | Unique identifier (e.g., `branch_abc123`) |
| `project_id` | TEXT FK | Reference to projects |
| `name` | TEXT | Branch name (e.g., `main`, `feature/x`) |
| `parent_branch` | TEXT | Parent branch name |
| `head_commit_hash` | TEXT | Latest commit on this branch |
| `description` | TEXT | Optional branch description |
| `is_current` | INTEGER | 1 if current branch, 0 otherwise |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Unique Constraint**: `(project_id, name)` - One branch name per project.

### commits_v2

Semantic snapshots forming a DAG structure.

| Column | Type | Description |
|--------|------|-------------|
| `commit_hash` | TEXT PK | SHA-256 content hash |
| `project_id` | TEXT FK | Reference to projects |
| `branch` | TEXT | Branch name |
| `message` | TEXT | Commit message |
| `parents_json` | TEXT | JSON array of parent commit hashes |
| `turn_window_json` | TEXT | `{ start_turn_hash, end_turn_hash }` |
| `facet_snapshot_json` | TEXT | Semantic extraction result |
| `pipeline_config_json` | TEXT | Extraction configuration snapshot |
| `draft_id` | TEXT | Reference to source draft |
| `draft_text_hash` | TEXT | Hash of polished text |
| `signature_json` | TEXT | Optional Ed25519 signature |
| `source_excerpt_json` | TEXT | Source text excerpts |
| `must_have_json` | TEXT | Required keywords |
| `mustnt_have_json` | TEXT | Forbidden keywords |
| `position_x` | REAL | Canvas X position |
| `position_y` | REAL | Canvas Y position |
| `source_refs_json` | TEXT | Multi-source references |
| `created_at` | TIMESTAMP | Creation timestamp |

**DAG Structure**: Commits with multiple parents in `parents_json` represent merge commits.

### drafts_v2

LLM-generated drafts pending adoption.

| Column | Type | Description |
|--------|------|-------------|
| `draft_id` | TEXT PK | Unique identifier (e.g., `draft_abc123`) |
| `project_id` | TEXT FK | Reference to projects |
| `conversation_id` | TEXT FK | Reference to conversations |
| `base_commit_hash` | TEXT | Base commit for this draft |
| `turn_anchor_hash` | TEXT | Anchor turn reference |
| `bridge_id` | TEXT | Bridge template ID |
| `bridge_payload_json` | TEXT | Bridge configuration |
| `must_have_json` | TEXT | Required keywords |
| `mustnt_have_json` | TEXT | Forbidden keywords |
| `llm_config_json` | TEXT | LLM generation config |
| `text` | TEXT | Generated draft text |
| `status` | TEXT | `ephemeral` \| `adopted` \| `superseded` |
| `created_at` | TIMESTAMP | Creation timestamp |
| `completed_at` | TIMESTAMP | Completion timestamp |

### merge_results

Cached merge computation results.

| Column | Type | Description |
|--------|------|-------------|
| `merge_result_id` | TEXT PK | Unique identifier |
| `project_id` | TEXT FK | Reference to projects |
| `base_commit_hash` | TEXT | Common ancestor commit |
| `source_commit_hash` | TEXT | Source branch tip |
| `target_commit_hash` | TEXT | Target branch tip |
| `status` | TEXT | `clean` \| `conflicts` |
| `auto_merged_json` | TEXT | Auto-merged facets |
| `conflicts_json` | TEXT | Conflict list |
| `created_at` | TIMESTAMP | Computation timestamp |

### segment_embeddings

Pre-computed vectors for Ring 3 segments.

| Column | Type | Description |
|--------|------|-------------|
| `segment_id` | TEXT PK | `{turn_hash}:s-{index}` |
| `turn_hash` | TEXT FK | Reference to turns_v2 |
| `segment_index` | INTEGER | Segment position (0-based) |
| `segment_text` | TEXT | Segment content |
| `embedding_model` | TEXT | Model used for embedding |
| `embedding_dim` | INTEGER | Vector dimension |
| `embedding` | BYTEA | Float32Array as binary |
| `created_at` | TIMESTAMP | Creation timestamp |

---

## Hash Chain Verification

### Turn Chain

Turns form a linked list per conversation:

```
turn_1 (parent: NULL)
   ↓
turn_2 (parent: turn_1.hash)
   ↓
turn_3 (parent: turn_2.hash)
   ...
```

Each turn hash is computed from:
```typescript
hash = SHA256(JCS({
  parent_turn_hash,
  project_id,
  conversation_id,
  role,
  content,
  language,
  rings_json,
  created_at
}))
```

### Commit DAG

Commits form a directed acyclic graph (DAG):

```
commit_1 (parents: [])           # Initial commit
   ↓
commit_2 (parents: [commit_1])   # Linear history
   ↓
   ├─── commit_3a (parents: [commit_2])  # Branch A
   │
   └─── commit_3b (parents: [commit_2])  # Branch B
         ↓
commit_4 (parents: [commit_3a, commit_3b])  # Merge commit
```

---

## Query Functions

The storage layer provides typed query functions for all operations:

### Projects

```typescript
insertProject(db, { name: 'My Project' }): Promise<Project>
findProjectById(db, projectId): Promise<Project | null>
findAllProjects(db): Promise<Project[]>
updateProject(db, projectId, { name: 'New Name' }): Promise<void>
deleteProject(db, projectId): Promise<void>
```

### Conversations

```typescript
insertConversation(db, { projectId, title }): Promise<Conversation>
findConversationById(db, conversationId): Promise<Conversation | null>
findConversationsByProject(db, projectId): Promise<Conversation[]>
updateConversation(db, conversationId, updates): Promise<void>
deleteConversation(db, conversationId): Promise<void>
```

### Turns

```typescript
insertTurn(db, { projectId, conversationId, role, content }): Promise<Turn>
findTurnByHash(db, turnHash): Promise<Turn | null>
findTurnsByConversation(db, conversationId): Promise<Turn[]>
findTurnChain(db, turnHash): Promise<Turn[]>  // Walk parent chain
```

### Branches

```typescript
insertBranch(db, { projectId, name }): Promise<Branch>
findBranchByName(db, projectId, name): Promise<Branch | null>
findBranchesByProject(db, projectId): Promise<Branch[]>
updateBranchHead(db, branchId, commitHash): Promise<void>
setCurrentBranch(db, projectId, branchId): Promise<void>
```

### Commits

```typescript
insertCommit(db, { projectId, branch, turnWindow, facetSnapshot }): Promise<Commit>
findCommitByHash(db, commitHash): Promise<Commit | null>
findCommitsByProject(db, projectId): Promise<Commit[]>
findCommitsByBranch(db, projectId, branch): Promise<Commit[]>
```

### Drafts

```typescript
insertDraft(db, { projectId, conversationId, bridgeId, text }): Promise<Draft>
findDraftById(db, draftId): Promise<Draft | null>
findDraftsByProject(db, projectId): Promise<Draft[]>
updateDraftStatus(db, draftId, status): Promise<void>
```

### Merge Results

```typescript
insertMergeResult(db, { projectId, base, source, target, result }): Promise<MergeResult>
findMergeResult(db, base, source, target): Promise<MergeResult | null>
findMergeResultsByProject(db, projectId): Promise<MergeResult[]>
```

### Segment Embeddings

```typescript
insertSegmentEmbedding(db, { turnHash, index, text, embedding }): Promise<void>
findSegmentsByTurn(db, turnHash): Promise<SegmentEmbedding[]>
findSimilarSegments(db, embedding, limit): Promise<SegmentEmbedding[]>
```

---

## Indexes

Indexes are created for common query patterns:

```sql
-- Conversations
CREATE INDEX idx_conversations_project ON conversations(project_id);

-- Turns
CREATE INDEX idx_turns_v2_conversation ON turns_v2(conversation_id);
CREATE INDEX idx_turns_v2_project ON turns_v2(project_id);
CREATE INDEX idx_turns_v2_parent ON turns_v2(parent_turn_hash);

-- Branches
CREATE INDEX idx_branches_project ON branches(project_id);

-- Commits
CREATE INDEX idx_commits_v2_project ON commits_v2(project_id);
CREATE INDEX idx_commits_v2_branch ON commits_v2(branch);
CREATE INDEX idx_commits_v2_draft ON commits_v2(draft_id);

-- Drafts
CREATE INDEX idx_drafts_v2_project ON drafts_v2(project_id);
CREATE INDEX idx_drafts_v2_base_commit ON drafts_v2(base_commit_hash);

-- Merge Results
CREATE INDEX idx_merge_results_project ON merge_results(project_id);

-- Segment Embeddings
CREATE INDEX idx_segment_embeddings_turn ON segment_embeddings(turn_hash);
CREATE INDEX idx_segment_embeddings_model ON segment_embeddings(embedding_model);
```

---

## Data Integrity

### Constraints

1. **Foreign Keys**: All FK relationships enforce referential integrity with CASCADE delete
2. **Unique Constraints**: Branch names are unique per project
3. **Hash Verification**: Turn and commit hashes can be recomputed for verification

### Append-Only Semantics

While PostgreSQL allows updates, the T3X application layer treats turns and commits as append-only:

- **Turns**: Never updated after creation (hash would change)
- **Commits**: Never updated after creation (hash would change)
- **Drafts**: Status can be updated (`ephemeral` → `adopted`)
- **Branches**: Head commit can be updated

---

## Migration Strategy

Schema migrations are managed via Drizzle Kit:

```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:migrate

# Open Drizzle Studio (visual DB explorer)
npm run db:studio
```

---

_Document Version: 2.0_
_Last Updated: 2025-12-23_
