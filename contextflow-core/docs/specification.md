# ContextFlow Schema (ContextFlow 1.0)

> This spec mirrors `docs/ARCHITECTURE.md` and `docs/STORAGE_ARCHITECTURE.md`. The runtime source of truth is the JSONL ledger + SQLite index; a `.contextflow` file (a.k.a. `.cfpack`) is the portable export view of that ledger. The spec only defines the internal JSON structure; whether implementations leave it as-is or wrap/compress it (zip/gzip/etc.) is an optional transport detail, not part of the protocol.

---

## 1. Overview

The ContextFlow schema (formerly ContextFlow) is the canonical specification for hybrid memories. It defines a minimal JSON structure that carries turn chains, drafts, commits, diffs, and optional notes/preferences/files in a portable, provider-neutral way. Tools (CLI, SDKs, cloud) layer intelligence on top—hybrid summarisation, semantic indexing, lineage tracking, prompt/chain DSLs.

## 2. Core Principles

- **Ledger-driven**: All deterministic state maps to the JSONL ledger. The schema guarantees replayability and auditability.
- **Minimal required fields**: At the top level only `contextflow_version` and `metadata.created` are mandatory. Each ledger section (`turns`, `drafts`, `commits`, `diffs`) defines its own required fields in the sections below.
- **Natural structure**: Organised around turns → drafts → commits → diffs, with optional extensions (notes, preferences, files, prompts).
- **Portable JSON**: No vendor lock-in; easy to parse and validate.
- **Progressive enhancement**: Format stays simple; tools add complexity over time.

## 3. File Format

ContextFlow files are valid JSON documents with the `.contextflow` extension.

- **MIME**: `application/contextflow+json`
- **Extension**: `.contextflow` (a.k.a. `.cfpack`)

### 3.1 Minimal Valid Example

```json
{
  "contextflow_version": "1.0",
  "metadata": {
    "created": "2025-10-06T12:00:00Z"
  },
  "turns": [],
  "drafts": [],
  "commits": []
}
```

### 3.2 Top-level Structure

```json
{
  "contextflow_version": "1.0",
  "$schema": "https://contextflow.dev/schema/v1.0.json",
  "metadata": { ... },
  "turns": [ ... ],
  "drafts": [ ... ],
  "commits": [ ... ],
  "diffs": [ ... ],
  "conversations": [ ... ],   // optional UI container
  "notes": [ ... ],           // optional
  "preferences": { ... },     // optional
  "files": [ ... ],           // optional
  "prompts": [ ... ],         // optional
  "usage_summary": { ... },   // optional
  "_tooling": { ... }         // optional extensions
}
```

`turns/drafts/commits/diffs` mirror the JSONL ledger. `conversations/notes/...` are product-level extensions; omit them if unused.

---

## 4. Field Reference (ledger-aligned)

### 4.1 Metadata

```json
{
  "metadata": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "created": "2025-10-06T12:00:00Z",
    "modified": "2025-10-06T14:30:00Z",
    "name": "My AI Context",
    "description": "Personal context for coding",
    "tags": ["coding", "personal"],
    "version": "1.0"
  }
}
```

`created` is required; others are optional.

### 4.2 Turns (ledger export)

Each turn must include hash-chain info and Ring snapshots.

```json
{
  "turns": [
    {
      "turn_hash": "sha256:e9f...",
      "parent_turn_hash": "sha256:aa1...",
      "project_id": "proj_demo",
      "conversation_id": "conv_main",
      "role": "user",
      "content": "I want to travel to Japan in November",
      "rings": {
        "ring1": {
          "keywords": [
            {"lemma": "travel", "polarity": +1},
            {"lemma": "Japan", "polarity": +1},
            {"lemma": "November", "polarity": +1}
          ],
          "time_anchor": "2025-11"
        },
        "ring2": {
          "intent_seed": ["plan_trip"],
          "time_window": "2025-11"
        },
        "ring3": {
          "segments": [
            {"id": "s1-1", "text": "I want to travel to Japan"},
            {"id": "s1-2", "text": "Prefer late November"}
          ]
        }
      },
      "metadata": {
        "model": "gpt-4.1-mini",
        "tokens": {"prompt": 32, "completion": 0}
      },
      "created_at": "2025-11-18T12:34:56Z",
      "schema_version": "turn_v1"
    }
  ]
}
```

`turn_hash = SHA256(JCS(record_without_hash))`. `parent_turn_hash` NULL means the chain root. `rings` align with the extractor output.

> Draft generation typically walks Ring 1 keywords: polarity `+1` feeds `must_have`, polarity `-1` feeds `mustnt_have`, ensuring Must/Mustn’t stay anchored to source turns.

### 4.3 Drafts

```json
{
  "drafts": [
    {
      "draft_id": "draft_2025-11-18T12:40",
      "project_id": "proj_demo",
      "base_commit_hash": "sha256:commit_prev",
      "turn_anchor_hash": "sha256:e9f...",
      "bridge_id": "plan",
      "bridge_payload": {
        "prompt": "...bridge snapshot...",
        "threshold": 0.60
      },
      "must_have": ["travel", "Japan"],
      "mustnt_have": ["cancel"],
      "llm_config": {
        "provider": "openai",
        "model": "gpt-4.1",
        "temperature": 0.3,
        "max_tokens": 2048
      },
      "text": "...polished draft...",
      "status": "adopted",
      "created_at": "2025-11-18T12:42:00Z",
      "schema_version": "draft_v1"
    }
  ]
}
```

### 4.4 Commits

```json
{
  "commits": [
    {
      "commit_hash": "sha256:commit_tip",
      "parent_hashes": ["sha256:commit_prev"],
      "project_id": "proj_demo",
      "branch": "main",
      "turn_window": {
        "start_turn_hash": "sha256:aa1...",
        "end_turn_hash": "sha256:e9f..."
      },
      "facet_snapshot": [
        {"facet": "goal", "text": "Visit Japan in November"},
        {"facet": "constraints", "text": "Avoid crowded places"}
      ],
      "pipeline_config": {
        "extractors": {"plugin": "spacy@v1"},
        "embedder": {"plugin": "minilm@v2"},
        "thresholds": {"plan": 0.60}
      },
      "draft_ref": {
        "draft_id": "draft_2025-11-18T12:40",
        "text_hash": "sha256:draft_text"
      },
      "signature": {
        "algo": "ed25519",
        "key_id": "ed25519:demo",
        "value": "base64:..."
      },
      "created_at": "2025-11-18T12:45:00Z",
      "schema_version": "commit_v1"
    }
  ]
}
```

- Merge = multiple entries in `parent_hashes` (no separate entity).
- `facet_snapshot` mirrors the Ring-based aggregation used during validation.
- `pipeline_config` + `draft_ref` capture the replayable config snapshot.

> Terminology: `commit_hash` here is equivalent to `commit_id` in `docs/ARCHITECTURE.md` §3.4—it’s the SHA-256 hash of the canonical payload (JCS-normalised).

### 4.5 Diffs (optional cache)

```json
{
  "diffs": [
    {
      "base_commit_hash": "sha256:commit_prev",
      "target_commit_hash": "sha256:commit_tip",
      "algo_version": "semantic_diff@v1",
      "diff_json": {"added": [...], "removed": [...]},
      "computed_at": "2025-11-18T12:46:00Z"
    }
  ]
}
```

---

## 5. Optional Extensions

### 5.1 Conversations (UI container)

```json
{
  "conversations": [
    {
      "id": "conv_main",
      "title": "Trip planning",
      "created": "2025-11-18T12:30:00Z",
      "source": "contextflow-cli",
      "turn_refs": ["sha256:aa1...", "sha256:e9f..."]
    }
  ]
}
```

### 5.2 Notes / Preferences / Files / Prompts / Usage Summary /
### 5.3 `_tooling`

(unchanged from previous spec; still optional, not part of the ledger.)

---

## 6. Lineage Protocol (Turn & Commit chains)

Whenever a `.contextflow` file contains ledger data, it MUST preserve the full turn chain and commit DAG (empty projects may keep `turns`/`commits` empty arrays):

1. **Turn chain**: `turn_hash` + `parent_turn_hash` form an append-only chain; `hash = SHA256(JCS(record_without_hash))`.
2. **Commit chain**: `parent_hashes` lists parents (merge = multi-parent). `turn_window.end_turn_hash` records the latest turn seen by the snapshot.

### 6.1 Workflow Tips

- Continue chatting: append turns, then write commits referencing the current head.
- Merge: mint a commit with multiple parents, then keep drafting/committing atop it.
- Validation: incremental operations only check new segments; full audits recompute hashes along `turns`/`commits`. Drafts never enter the commit chain.

---

## 7. Security Considerations

(unchanged text)

---

## 8. Reference Implementations

Python SDK (`sdk/python/`), JavaScript/TypeScript SDK (`sdk/javascript/`), CLI (`cli/`).

---

## 9. Changelog

- 1.0 (2025-10-06): initial release.
- 2025-11 alignment: mapped schema to ledger (`turns/drafts/commits/diffs`), added hash-chain fields, clarified `.contextflow`/`.cfpack`, merge = multi-parent commits.

---

## 10. License & Contributing

MIT License. Submit issues/PRs at https://github.com/chivereaper/contextflow. EOF
