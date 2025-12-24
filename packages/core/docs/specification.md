# T3X Schema Specification (v2.0)

> This spec defines the `.cfpack` export format for T3X. The runtime storage uses PostgreSQL (see `STORAGE_ARCHITECTURE.md`). The `.cfpack` file is a portable JSON export that can be imported into any T3X instance.

---

## 1. Overview

The T3X schema defines a portable JSON format for exporting semantic versioning data. It packages turn chains, commits, branches, and drafts in a provider-neutral way that can be:

- Imported into other T3X instances
- Fed to LLMs for context
- Archived for long-term storage
- Validated programmatically

---

## 2. Core Principles

- **PostgreSQL as runtime storage**: The `.cfpack` format is an export view, not the primary storage
- **Minimal required fields**: Only `t3x_version` and `metadata.created` are mandatory at top level
- **Portable JSON**: No vendor lock-in; easy to parse and validate
- **Hash chain integrity**: All hashes can be recomputed for verification

---

## 3. File Format

T3X files are valid JSON documents with the `.cfpack` extension.

- **MIME**: `application/cfpack+json`
- **Extension**: `.cfpack`

### 3.1 Minimal Valid Example

```json
{
  "t3x_version": "2.0",
  "metadata": {
    "created": "2025-12-23T10:00:00Z"
  },
  "turns": [],
  "commits": [],
  "branches": []
}
```

### 3.2 Full Structure

```json
{
  "t3x_version": "2.0",
  "$schema": "https://t3x.dev/schema/v2.0.json",
  "metadata": {
    "created": "2025-12-23T10:00:00Z",
    "project_id": "proj_abc123",
    "project_name": "My Project",
    "exported_by": "t3x-webui@0.1.0"
  },
  "conversations": [...],
  "turns": [...],
  "commits": [...],
  "branches": [...],
  "drafts": [...],
  "merge_results": [...]
}
```

---

## 4. Section Schemas

### 4.1 Metadata

```typescript
interface Metadata {
  created: string;           // ISO 8601 timestamp (required)
  project_id?: string;       // Source project ID
  project_name?: string;     // Human-readable name
  exported_by?: string;      // Exporter tool and version
  description?: string;      // Optional description
}
```

### 4.2 Conversations

```typescript
interface Conversation {
  conversation_id: string;   // Required: unique ID
  project_id: string;        // Required: parent project
  title?: string;            // Optional title
  created_at: string;        // ISO 8601 timestamp
  metadata_json?: string;    // Optional JSON metadata
}
```

### 4.3 Turns

```typescript
interface Turn {
  turn_hash: string;         // Required: SHA-256 content hash
  parent_turn_hash?: string; // NULL for first turn
  project_id: string;        // Required
  conversation_id: string;   // Required
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;           // Required: message content
  language?: string;         // ISO 639-1 code
  rings_json?: string;       // Ring 1/2/3 extraction result
  created_at: string;        // ISO 8601 timestamp
}
```

**Hash computation:**
```
turn_hash = "sha256:" + SHA256(JCS({
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

### 4.4 Commits

```typescript
interface Commit {
  commit_hash: string;       // Required: SHA-256 content hash
  project_id: string;        // Required
  branch: string;            // Required: branch name
  message?: string;          // Commit message
  parents_json: string;      // JSON array of parent hashes
  turn_window_json: string;  // { start_turn_hash, end_turn_hash }
  facet_snapshot_json: string; // Semantic extraction result
  source_refs_json?: string; // Multi-source references
  created_at: string;        // ISO 8601 timestamp
}
```

**Hash computation:**
```
commit_hash = "sha256:" + SHA256(JCS({
  parent_hashes,
  project_id,
  branch,
  turn_window,
  facet_snapshot,
  created_at
}))
```

### 4.5 Branches

```typescript
interface Branch {
  branch_id: string;         // Required: unique ID
  project_id: string;        // Required
  name: string;              // Required: branch name
  parent_branch?: string;    // Parent branch name
  head_commit_hash?: string; // Latest commit hash
  description?: string;      // Optional description
  is_current: boolean;       // True if current branch
  created_at: string;        // ISO 8601 timestamp
}
```

### 4.6 Drafts

```typescript
interface Draft {
  draft_id: string;          // Required: unique ID
  project_id: string;        // Required
  conversation_id: string;   // Required
  base_commit_hash?: string; // Base commit reference
  bridge_id: string;         // Bridge template ID
  bridge_payload_json: string; // Bridge configuration
  llm_config_json: string;   // LLM generation config
  text: string;              // Generated content
  status: 'ephemeral' | 'adopted' | 'superseded';
  created_at: string;        // ISO 8601 timestamp
}
```

### 4.7 Merge Results

```typescript
interface MergeResult {
  merge_result_id: string;   // Required: unique ID
  project_id: string;        // Required
  base_commit_hash: string;  // Common ancestor
  source_commit_hash: string; // Source branch tip
  target_commit_hash: string; // Target branch tip
  status: 'clean' | 'conflicts';
  auto_merged_json: string;  // Auto-merged facets
  conflicts_json: string;    // Conflict list
  created_at: string;        // ISO 8601 timestamp
}
```

---

## 5. Ring Output Format

Ring extraction produces structured semantic data:

```typescript
interface RingOutput {
  ring1: {
    keywords: Array<{
      text: string;        // Surface form
      lemma: string;       // Lemmatized form
      polarity: -1 | 0 | 1; // Negative/neutral/positive
      pos: string;         // Part of speech
      span: [number, number]; // Character offsets
    }>;
    entities: Array<{
      text: string;
      type: string;        // PERSON, ORG, GPE, etc.
      salience: number;    // 0-1 importance score
    }>;
    timeAnchor: string | null;
    topic: string | null;
  };
  ring2: {
    facets: Array<{
      type: string;        // goal, preference, constraint
      text: string;
      confidence: number;
    }>;
    intentSeed: string | null;
  };
  ring3: {
    segments: Array<{
      id: string;          // "s-0", "s-1", etc.
      text: string;
      startOffset: number;
      endOffset: number;
    }>;
  };
}
```

---

## 6. Facet Snapshot Format

Commits store semantic facets extracted from turns:

```typescript
interface FacetSnapshot {
  facets: Array<{
    type: string;          // Facet type
    text: string;          // Facet content
    confidence: number;    // 0-1 confidence
    source_turn_hashes: string[]; // Evidence sources
  }>;
  extracted_at: string;    // ISO 8601 timestamp
  pipeline_version: string; // Extractor version
}
```

---

## 7. Source References

Commits can reference multiple source conversations:

```typescript
interface SourceRef {
  type: 'conversation' | 'turn' | 'external';
  conversation_id?: string;
  turn_hash?: string;
  external_url?: string;
  description?: string;
}
```

---

## 8. Validation

### 8.1 Required Validations

1. **Schema version**: `t3x_version` must be "2.0"
2. **Timestamp format**: All timestamps must be valid ISO 8601
3. **Hash format**: All hashes must start with "sha256:"
4. **Hash chain**: Parent references must point to existing entries

### 8.2 Optional Validations

1. **Hash verification**: Recompute and compare hashes
2. **Referential integrity**: All foreign keys resolve
3. **Branch consistency**: HEAD commits exist

---

## 9. Migration from v1.0

Version 2.0 changes from 1.0:

| Change | v1.0 | v2.0 |
|--------|------|------|
| Storage | JSONL + SQLite | PostgreSQL |
| Conversations | Implicit | Explicit table |
| Branches | Simple | Full Git-like model |
| Merge | Basic | Three-way with conflicts |

To migrate v1.0 files:
1. Parse v1.0 JSON
2. Generate conversation IDs for orphan turns
3. Update `t3x_version` to "2.0"
4. Add missing branch records

---

## 10. Example Export

```json
{
  "t3x_version": "2.0",
  "metadata": {
    "created": "2025-12-23T10:00:00Z",
    "project_id": "proj_abc123",
    "project_name": "Japan Trip Planning"
  },
  "conversations": [
    {
      "conversation_id": "conv_xyz789",
      "project_id": "proj_abc123",
      "title": "Initial Planning",
      "created_at": "2025-12-23T10:00:00Z"
    }
  ],
  "turns": [
    {
      "turn_hash": "sha256:abc123...",
      "parent_turn_hash": null,
      "project_id": "proj_abc123",
      "conversation_id": "conv_xyz789",
      "role": "user",
      "content": "I want to visit Japan in November",
      "language": "en",
      "rings_json": "{...}",
      "created_at": "2025-12-23T10:00:00Z"
    }
  ],
  "commits": [
    {
      "commit_hash": "sha256:def456...",
      "project_id": "proj_abc123",
      "branch": "main",
      "message": "Initial trip planning",
      "parents_json": "[]",
      "turn_window_json": "{\"start_turn_hash\":\"sha256:abc123...\",\"end_turn_hash\":\"sha256:abc123...\"}",
      "facet_snapshot_json": "{\"facets\":[{\"type\":\"goal\",\"text\":\"Visit Japan in November\"}]}",
      "created_at": "2025-12-23T10:05:00Z"
    }
  ],
  "branches": [
    {
      "branch_id": "branch_main",
      "project_id": "proj_abc123",
      "name": "main",
      "head_commit_hash": "sha256:def456...",
      "is_current": true,
      "created_at": "2025-12-23T10:00:00Z"
    }
  ],
  "drafts": [],
  "merge_results": []
}
```

---

_Specification Version: 2.0_
_Last Updated: 2025-12-23_
