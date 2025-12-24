3.3 Storage Layer (Ledger + Indexes)

T3X's storage is divided into two layers:

1. **JSONL Primary Ledger (Ledger)**: All auditable, reproducible semantic state (Turn chain, Commit chain, etc.) is written as JSON Lines under the `.t3x/` directory, using JCS canonicalization + SHA-256 hashing to form an append-only hash chain.
2. **SQLite Indexes Layer (Index)**: The local SQLite database is only responsible for query acceleration, association, and caching. It can be completely rebuilt from the JSONL primary ledger at any time and is not considered the sole source of truth.

In the future, when integrating with backends like Postgres / S3, you only need to reuse the same "Ledger JSON structure" and replace the Indexes implementation.

---

### 3.3.1 JSONL Primary Ledger

The primary ledger is split into multiple JSONL streams by entity, located under `.t3x/` (actual path is defined in `STORAGE_ARCHITECTURE.md`). Each line is a record, hashed after JCS canonicalization.

#### (1) Turn Ledger

Records original conversation turns and their hash chain:

```json
{
  "turn_hash": "sha256:...",          // SHA-256 of JCS(this record), serves as primary key
  "parent_turn_hash": "sha256:...",   // Previous turn_hash; null for root turn
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",                   // Original text or structured payload
  "metadata": { ... },                // optional: model name, token statistics, etc.
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "turn_v1"
}
```

- Hash rule: `turn_hash = SHA256(JCS(record_without_hash))`.
- Append-only guarantee: Any modification to turn content or metadata will change the `turn_hash`, thereby breaking the chain, facilitating audits.

#### (2) Commit Ledger

Records immutable semantic snapshots and their DAG structure:

```json
{
  "commit_hash": "sha256:...",        // Hash of commit payload
  "parent_hashes": ["sha256:..."],    // Usually 0-1 parents; can be multiple during merge
  "project_id": "proj_...",
  "branch": "main|feature/...",       // Branch name where this commit resides
  "turn_window": {
    "start_turn_hash": "sha256:...",
    "end_turn_hash": "sha256:..."
  },
  "facet_snapshot": [ ... ],          // Stable semantic facets aggregated from Rings 1-3
  "pipeline_config": { ... },         // Configuration snapshot of extractor / aggregator / weights, etc.
  "draft_ref": {
    "draft_id": "draft_...",
    "text_hash": "sha256:..."         // Hash of polished text
  },
  "signature": {
    "key_id": "ed25519:...",
    "algo": "ed25519",
    "value": "base64:..."
  },
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "commit_v1"
}
```

- Merge does not become a separate entity, but rather: a Commit with `parent_hashes.length > 1`.
- The Commit's canonical payload (participating in hash and signature) includes the facet snapshot and pipeline configuration, ensuring it can be replayed / validated later.

#### (3) Draft Ledger (optional persistence)

Draft is a candidate generated based on a certain base snapshot. To ensure Draft→Commit reproducibility, at least its configuration needs to be persisted:

```json
{
  "draft_id": "draft_...",
  "project_id": "proj_...",
  "base_commit_hash": "sha256:...",   // Which semantic snapshot to base on
  "turn_anchor_hash": "sha256:...",   // optional: anchor turn for focus
  "bridge_id": "plan|rewrite|...",    // Draft mode/bridge name
  "bridge_payload": { ... },          // Bridge prompt template and parameter snapshot
  "must_have": [ ... ],               // Must-Have list
  "mustnt_have": [ ... ],             // Mustn't-Have list
  "llm_config": {                     // Generation configuration affecting output
    "provider": "openai|anthropic|...",
    "model": "gpt-4.1|claude-3.5-sonnet|...",
    "temperature": 0.3,
    "max_tokens": 2048
  },
  "text": "...",                      // Generated draft text
  "status": "ephemeral|adopted|superseded",
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "draft_v1"
}
```

Commit can either reference just the `draft_id`, or embed a streamlined configuration copy in its own payload for long-term archival.

Other auxiliary Ledgers (such as branch metadata, validation logs) can be supplemented in `STORAGE_ARCHITECTURE.md`, not expanded here.

---

### 3.3.2 SQLite Indexes Layer (reference schema)

SQLite serves as local query indexes, all data can be completely rebuilt from JSONL Ledger. Core tables are listed below, showing only key fields and constraints (actual DDL is defined in `schema.sql`).

#### (1) projects

- `project_id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

Aligns with the `project_id` in all Ledger records.

#### (2) conversations

- `conversation_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL` → `projects.project_id`
- `title TEXT`
- `created_at TEXT NOT NULL`
- `meta_json TEXT`

Conversation is more like a "container", no longer maintaining a separate hash chain; history is guaranteed by the `turns` chain.

#### (3) turns

- `turn_hash TEXT PRIMARY KEY`           // Corresponds to `turn_hash` in Turn Ledger
- `parent_turn_hash TEXT`
- `project_id TEXT NOT NULL`
- `conversation_id TEXT NOT NULL`
- `role TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `ledger_file TEXT NOT NULL`            // JSONL file path
- `ledger_offset INTEGER NOT NULL`       // Line number/offset within file

Constraints (logical):

- `parent_turn_hash` is either `NULL` or points to another row under the same `project_id`;
- Implementation should avoid `UPDATE/DELETE` on `turns` to maintain consistency with Ledger's append-only nature.

#### (4) drafts

- `draft_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `base_commit_hash TEXT NOT NULL`
- `turn_anchor_hash TEXT`
- `bridge_id TEXT NOT NULL`
- `bridge_payload_json TEXT NOT NULL`
- `must_have_json TEXT`
- `mustnt_have_json TEXT`
- `llm_config_json TEXT NOT NULL`
- `text TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_at TEXT NOT NULL`

These fields correspond one-to-one with the JSON structure in Draft Ledger, facilitating queries and filtering in CLI / WebUI.

#### (5) commits

- `commit_hash TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `branch TEXT NOT NULL`
- `parents_json TEXT NOT NULL`
- `turn_window_start_hash TEXT`
- `turn_window_end_hash TEXT`
- `facet_snapshot_json TEXT NOT NULL`
- `pipeline_config_json TEXT NOT NULL`
- `draft_id TEXT`
- `polished_text TEXT`
- `signature_key_id TEXT`
- `signature_value TEXT`
- `created_at TEXT NOT NULL`
- `schema_version TEXT NOT NULL`

Merge no longer has a separate table; multi-parent relationships are fully expressed by `parents_json`.

#### (6) diffs (cache)

- `base_commit_hash TEXT NOT NULL`
- `target_commit_hash TEXT NOT NULL`
- `algo_version TEXT NOT NULL`
- `diff_json TEXT NOT NULL`
- `computed_at TEXT NOT NULL`

Primary key: `(base_commit_hash, target_commit_hash, algo_version)`.

Description:

- `diffs` only serves as a cache layer, can be safely cleared and recalculated from Commit Ledger;
- Does not participate in any hash chain or signature, not considered part of the "immutable ledger".

---

This version of the structure achieves:

- Clearly defines the boundary between JSONL as primary ledger and SQLite as Indexes;
- Clarifies the hash chains of Turn/Commit, Commit DAG, and multi-parent Merge semantics;
- Supplements Draft, Commit, Diff with fields required for reproducibility;
- Does not hardcode specific DDL, but provides clear enough targets for SQLite refactoring.
