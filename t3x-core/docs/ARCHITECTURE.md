# T3X Architecture Overview

**From Semantic Framework to Agentic Layer: A Boundary Design**

---

## 1. Product Vision & Positioning

### One-line Definition:

> **T3X is "Git for Meaning"** — enabling any conversation or discussion to be versioned, archived, verified, and shared like code.
>
> Large Language Models (LLMs) are merely pluggable components, not the product core.

---

## 2. Three-Layer Architecture Overview

| Layer | Name | Responsibility | Requires LLM? |
|-------|------|----------------|---------------|
| **Bottom: Framework Core** | `t3x-core` | Deterministic extraction + evidence + storage/versioning: hash, extract findings, persist turns (SQLite+JSONL), diff, merge, commit, .cfpack export | ❌ No |
| **Middle: Agentic Layer** | `t3x-agents` | Pluggable SummaryAgent / MergeAgent plugins (can use LLM or pure rules) | ✅ Optional |
| **Top: Product Layer** | `t3x.app` | CLI + WebUI for interaction, visualization & sharing | ❌ (optional enhancement) |

---

## 3. Framework Core Design (Deterministic Layer)

### 3.1 Core Responsibilities

> **Terminology:** `Finding` refers to a single extracted semantic fact (e.g., one sentence, entity, or evidence snippet). `Findings` refers to the collection as a whole; unless otherwise noted we use the plural sense below.

- **Conversation → Findings (Ring 1–3) → Draft/Commit → Merge → .cfpack export**.
- Guarantee the entire semantic pipeline remains **replayable, verifiable, exportable**, backed by local storage.
- Core algorithms & components:
  - **Hash chain**: apply deterministic JSON canonicalization (currently JCS) + SHA-256 to hash every turn/commit and link them sequentially.
  - **Extractor rings**: Ring 1 (surface keywords/entities), Ring 2 (light relations / facets), Ring 3 (sentence structure) come from pluggable extractor plugins (rule-based, spaCy, Stanza, custom). Ring 1 outputs lemmatized keywords plus polarity in this phase.
  - **Evidence & similarity scoring**: embedding plugins expose a unified `encode(text[])` / `similarity(vec, vec)` interface; small models such as MiniLM / bge-small ship by default, Draft filtering and validation reuse the same scoring logic, and configs can swap models as needed.
  - **Findings normalization/aggregation**: deduplicates across turns, merges synonyms, keeps polarity, and emits Must-Have / Mustn’t-Have lists for Draft/Commit validation.
  - **Storage**: all turns / conversations / drafts / commits / merges / diffs append to JSONL ledgers under `.t3x/` as the semantic journal, with SQLite kept in sync as a rebuildable query index.
- **Version operations**: run diff/merge between snapshots (draft/commit) to mint hash-linked commits; signature fields are reserved for future Ed25519-style signing (disabled by default).
- **Metadata capture**: commits/merges carry config snapshots (extractor plugin versions, embedding models, scoring weights/thresholds) for reproducibility and audit.

### 3.1.1 Conversation → Turn Rings (NEW)

Every conversation is strictly ordered by turns (user question `turn-1`, assistant answer `turn-2`, next question `turn-3`, …). Each turn receives three “Ring” representations that downstream diff / merge / commit operations consume:

| Ring | Meaning | How it’s produced | Example fields |
|------|---------|-------------------|----------------|
| **Ring 1: Topic spine** | Keywords, entities, temporal anchors, preference tags | Extractor plugin (default: spaCy) handles entity/keyword extraction, plus inflection normalization and polarity tagging to distinguish Must-Have vs Mustn’t-Have keywords | `keywords`, `time_anchor`, `topic`, `preference_keywords` |
| **Ring 2: Light relations / facets** | Intent seeds, time windows, soft preferences, open slots | Extractor plugin (dependency parser of choice) maps dependency arcs into facet labels | `intent_seed`, `time_window`, `preference_soft`, `unknown_slot` |
| **Ring 3: Sentence structure** | Turn split into sentence-level segments `s1-1`, `s1-2`, … | Extractor plugin (default sentence segmenter) | `segments: ["s1-1", "s1-2"]` |

> **Constraint:** Rings 1/2/3 are produced by the same extractor plugin pipeline (default stack: spaCy + optional Stanza) to guarantee determinism; each ring snapshot is stored with the turn for later diff / merge / commit usage.
> **Note (2025-11 addendum):** Ring 1 extractors must emit normalized tokens *with* polarity (e.g., `{lemma, surface, polarity, span}`) before the data reaches the Findings aggregator. The aggregator only handles cross-turn dedupe/Must-Mustn't sets, not per-token lemmatization.

### 3.2 Extractor & Embedding Plugins

- **Extractor Plugins**: All turn rings (keywords, relations, segments) flow through a unified pure-function interface; implementations can be rule-based YAML, spaCy, Stanza, or custom pipelines (spaCy is the default). Example config:
  ```yaml
  extractors:
    keywords:
      plugin: spacy
      model: en_core_web_sm
    segments:
      plugin: rule_based
  ```
  Ring 1 extractors must emit lemmatized keywords plus polarity flags so diff/merge downstream stays normalized.
- **Embedding / Similarity Plugins**: Provide `encode(text[]) -> vectors` and `similarity(vecA, vecB)`; Draft filtering and evidence scoring reuse the same interface. Example:
  ```yaml
  sentence_encoder:
    plugin: minilm
    model: sentence-transformers/all-MiniLM-L6-v2
  evidence_scoring:
    plugin: bge_small
  ```
  MiniLM / bge-small are defaults; swapping models is a config change. Guiding principle: pluggable, configurable, sensible defaults.

#### 3.2.1 Plugin Interfaces & Registration (Addendum)

> **Note (2025-11 addendum):**
> - Interfaces live in `core/types.ts` (`extractor.extract(turn: TurnPayload): Finding[]`, `embedder.encode(text: string[]): Vector[]`, `similarity(a: Vector, b: Vector): number`, etc.).
> - Plugins are wired via `.t3x/config.yml` (`extractors`, `sentence_encoder`, `evidence_scoring`). Internally the SDK exposes `register_extractor/register_embedder/register_agent` so custom code can register implementations before runtime.
> - Each plugin must declare an `id` / version or `sha256`; commits and `.cfpack` snapshots record these identifiers inside `pipeline` / `config_snapshot` to guarantee reproducibility.

### 3.3 Storage Layer (Ledger + Index)

T3X persists data in two layers:

1. **JSONL Ledger (source of truth):** Every verifiable state (turn chains, commit chains, etc.) is written as JSON Lines under `.t3x/`, normalized via JCS and hashed with SHA-256 to form append-only chains.
2. **SQLite Index:** A local SQLite database fuels queries, joins, and caching. It can always be rebuilt from the ledger, so it is never treated as the canonical record.

Future backends (Postgres, S3, etc.) simply reuse the same ledger JSON structure and swap the indexing layer.

#### 3.3.1 JSONL Ledger

The ledger is split by entity into multiple JSONL streams under `.t3x/` (see `STORAGE_ARCHITECTURE.md` for paths). Each row is hashed after JCS normalization.

**(1) Turn Ledger** — raw conversational turns with their hash chain:

```json
{
  "turn_hash": "sha256:...",
  "parent_turn_hash": "sha256:...",
  "project_id": "proj_...",
  "conversation_id": "conv_...",
  "role": "user|assistant|system|tool",
  "content": "...",
  "metadata": { },
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "turn_v1"
}
```

- `turn_hash = SHA256(JCS(record_without_hash))`.
- Append-only: any mutation changes the hash and invalidates the chain.

**(2) Commit Ledger** — immutable semantic snapshots / DAG nodes:

```json
{
  "commit_hash": "sha256:...",
  "parent_hashes": ["sha256:..."],
  "project_id": "proj_...",
  "branch": "main|feature/...",
  "turn_window": {
    "start_turn_hash": "sha256:...",
    "end_turn_hash": "sha256:..."
  },
  "facet_snapshot": [ ... ],
  "pipeline_config": { ... },
  "draft_ref": {
    "draft_id": "draft_...",
    "text_hash": "sha256:..."
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

- Merge commits are just entries with `parent_hashes.length > 1`.
- The canonical payload (used for hashing/signing) includes facet snapshots and pipeline config so commits remain reproducible.

**(3) Draft Ledger (optional persistence)** — captures the state needed to replay Draft→Commit:

```json
{
  "draft_id": "draft_...",
  "project_id": "proj_...",
  "base_commit_hash": "sha256:...",
  "turn_anchor_hash": "sha256:...",
  "bridge_id": "plan|rewrite|...",
  "bridge_payload": { ... },
  "must_have": [ ... ],
  "mustnt_have": [ ... ],
  "llm_config": {
    "provider": "openai|anthropic|...",
    "model": "gpt-4.1|claude-3.5-sonnet|...",
    "temperature": 0.3,
    "max_tokens": 2048
  },
  "text": "...",
  "status": "ephemeral|adopted|superseded",
  "created_at": "2025-11-18T12:34:56Z",
  "schema_version": "draft_v1"
}
```

Commits may reference `draft_id` or embed a minimal snapshot. Additional ledgers (branch metadata, validation logs, etc.) are detailed in `STORAGE_ARCHITECTURE.md`.

#### 3.3.2 SQLite Index (reference schema)

SQLite mirrors the ledger for fast queries; every row can be rebuilt from JSONL. Key tables:

`projects`
- `project_id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `created_at TEXT NOT NULL`

`conversations`
- `conversation_id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL` → `projects.project_id`
- `title TEXT`
- `created_at TEXT NOT NULL`
- `meta_json TEXT`

`turns`
- `turn_hash TEXT PRIMARY KEY`
- `parent_turn_hash TEXT`
- `project_id TEXT NOT NULL`
- `conversation_id TEXT NOT NULL`
- `role TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `ledger_file TEXT NOT NULL`
- `ledger_offset INTEGER NOT NULL`

Constraints: `parent_turn_hash` is either `NULL` or references another row in the same project. The table is append-only (no UPDATE/DELETE).

`drafts`
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

`commits`
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

Merges are encoded via `parents_json`; no separate table.

`diffs` (cache)
- `base_commit_hash TEXT NOT NULL`
- `target_commit_hash TEXT NOT NULL`
- `algo_version TEXT NOT NULL`
- `diff_json TEXT NOT NULL`
- `computed_at TEXT NOT NULL`

Primary key: `(base_commit_hash, target_commit_hash, algo_version)`. This table is safe to drop and recalc.

`register_storage()` remains the extension point: the default implementation follows this ledger + index structure, and alternative backends must honor the contracts defined here and in `schema/` / `STORAGE_ARCHITECTURE.md`.

### 3.4 Reproducibility Definition

Every commit includes full provenance metadata (the entire JSON is normalized via JCS + SHA-256 to produce `commit_hash`, and parent pointers are recorded). `turn_refs` must reference individual turns by content hash (i.e., the JCS + SHA-256 hash of each turn payload):

```json
{
  "commit_hash": "sha256:commit_tip",
  "parent_hashes": ["sha256:commit_prev"],
  "created_at": "2025-10-22T12:00:00Z",
  "turn_refs": [
    {"hash": "turn-sha256-aa...", "role": "user"},
    {"hash": "turn-sha256-bb...", "role": "assistant"}
  ],
  "turn_window": {
    "start_turn_hash": "sha256:start_turn",
    "end_turn_hash": "sha256:end_turn"
  },
  "facet_snapshot": [
    {"facet": "goal", "text": "Visit Japan in November"}
  ],
  "pipeline_config": {
    "id": "ring-default@v1",
    "sha256": "pipeline-sha256-xyz..."
  },
  "draft_ref": {
    "draft_id": "draft_123",
    "text_hash": "sha256:draft_text"
  },
  "signature": {
    "algo": "ed25519",
    "key_id": "ed25519:demo",
    "value": "base64:..."
  },
  "cfpack_format": "cfpack",
  "cfpack_schema_version": "1.0.0",
  "schema_version": "commit_v1"
}
```

### 3.3 Sentence-Level Semantic Diff (Planned)

The next-generation diff directly leverages **Ring 3 segments** plus MiniLM similarity to compare two versions:

1. Take every segment `sA_i` from reference version A and encode it as `emb(sA_i)`.
2. Encode target version B as either a full-document vector or an aggregated sentence matrix `Emb(B)`.
3. Compute `cosine(emb(sA_i), Emb(B))`; values above the threshold count as “same,” otherwise “different/new.”

> **Open questions (to be formalized in the spec):**
> - **Numeric sensitivity:** MiniLM struggles to tell `$5000` from `$6000`; we likely need an auxiliary numeric comparator.
> - **Polarity/negation:** “Wants to visit Japan” vs “Does not want to visit Japan” can embed similarly; we may need Ring 2 labels or keyword rules.
> - **Encoding strategy:** Should `Emb(B)` be a single-pass document embedding or an aggregated sentence/cluster representation?

This semantic diff will drive merge/commit decisions; full computation details will land in `specification.md`.

---

## 4. Agentic Layer: Pluggable Summary & Merge Design

### SummaryAgent

- **Input**: `conversation_diff`, `findings_index`, `evidence_index`
- **Output**: `findings_summaries` + `narrative_draft`
- **Function**: Consume deterministic findings from the framework layer, organize supporting evidence, and render a human-readable explanation.
- **Model options**: OpenAI, Claude, local LLMs (e.g., Llama)

#### Draft Workflow (In Progress)

1. **Hash Window Selection**
   - Walk backward along the current head’s branch, collecting turn hashes until you reach the previous draft commit (inclusive).
   - Draft generation always sees “previous draft commit + all subsequent turns,” so regenerating a draft never drops user-facing context.
2. **Intent & Bridge**
   - User picks a bridge template (e.g., `/plan`, `/explain`, `/summary`, `/clarify`, `/other`). Each bridge maps to an editable YAML prompt snippet that describes “how to write this style” (users can edit the YAML themselves). Example `/plan` prompt: spell out goals, milestones, blockers, next actions.
   - User also provides a free-form intent string. Draft logic concatenates bridge prompt + intent so even vague intents inherit structural guidance.
3. **Embedding/Similarity Filtering (Core)**
   - Read the Ring 3 sentences that already exist for every dialogue/commit in the window.
   - Pass each sentence plus the bridge+intent vector through the configured embedding/similarity plugin (default: MiniLM). Keep only sentences that meet the bridge’s similarity threshold (0.60 is just the default example; bridges or users can override it).
   - For every retained sentence, record its `turn_hash` / `commit_hash`, then pull the normalized, polarity-tagged keywords from Ring 1: positive polarity keywords join the Must-Have list, negative polarity keywords join the Mustn’t-Have list.
4. **Polish (LLM) – Agentic**
   - Prompt the LLM with: bridge template, intent, and the high-relevance sentences as material. Before generation the user can override the LLM temperature (or stay with the system default) to control creativity, but the model must still “do plan,” follow bridge style, reflect the intent, and incorporate the source keywords verbatim.
   - The prompt also carries the Ring 1-derived Must-Have / Mustn’t-Have lists so the LLM is explicitly told “include these, forbid those.”
5. **Validate Loop (Core)**
   - Reuse the Must-Have / Mustn’t-Have lists from step 3 (they already include normalized forms and polarity).
   - Verify every Must-Have keyword appears and no Mustn’t-Have keyword appears. On failure, send the missing/forbidden list plus the previous attempt back to step 4 (Polish) and regenerate until all constraints are satisfied.
6. **User Review (Agentic coordinating Core)**
   - Present the validated draft to the user. “Confirm” triggers commit minting; “Comment” restarts polish with two extra inputs: (a) previous draft text, (b) user comment.
   - Comments run through the extractor plugin to mine additional keywords (with polarity), which extend the Must-Have or Mustn’t-Have lists for the next draft.

**Keyword handling note:** Ring 1 already normalizes inflectional variants (e.g., `travel` / `traveling` / `traveled`) into the same lemma before they enter Must-Have/Mustn’t-Have; however, close synonyms remain separate to preserve nuance.

This loop ends either when the user confirms (→ `cf commit`) or abandons (window stays open for the next draft request).
> **Note (2025-11 addendum):** Steps 3/5 (embedding filtering & validation plus Must/Mustn't tracking) are deterministic Core responsibilities. Steps 4/6 belong to the Agentic SummaryAgent (bridge YAML + LLM polish). Bridge templates live under `.t3x/bridges/`; the CLI seeds defaults there and Agentic reads from the same directory.

### MergeAgent

- **Role**: Merge operates only between existing snapshots (commits). It takes a source branch’s latest commit, blends it into the target branch (e.g., merging feature into main), and always ends with a new merge commit on the target branch.
- **Inputs**:
  - `base_commit`: common ancestor of source and target (initial MVP can pin to “the commit where the branch forked,” later upgrade to nearest common ancestor).
  - `source_commit`: tip of the source branch to be merged.
  - `target_commit`: current tip of the target branch (often `main`).
- **Outputs**:
  - `merge_draft`: merged semantic snapshot containing auto-merged sections and conflict markers.
  - `merge_plan`: facet/paragraph-level summary of how `base→source` and `base→target` differ, powering the UI view.
  - `merge_commit`: the confirmed merge snapshot written to the target branch (`parents = [target_commit, source_commit]`).
- **Workflow**:
  1. **Three-way semantic diff**: compute `diff(base, source)` and `diff(base, target)`; for each facet/text unit classify “only source changed,” “only target changed,” “both changed identically,” or “conflict.”
  2. **Auto-merge**: adopt non-conflicting units automatically; when both sides match, take the shared version; when they disagree, capture both variants plus supporting evidence.
  3. **Merge draft generation**: persist the auto-merged snapshot as a merge draft with metadata (base/source/target IDs, conflict counts, auto-mergeable flag). The UI presents this as the “merge diff preview,” i.e., merged snapshot versus the current target commit.
  4. **User conflict resolution**: the user reviews facet diffs / text comparisons, keeps source/target, or edits manually; an LLM may supply compromise suggestions.
  5. **Merge commit**: once confirmed, the merge draft is frozen into a merge commit on the target branch and the branch pointer advances to this new commit.
> **Note (2025-11 addendum):** Source branches without any commits must first run a Draft→Commit cycle before merge. For isolated branches lacking a common ancestor, the CLI must materialize a `base_commit` (e.g., empty snapshot or target HEAD) or rebase to establish lineage prior to merge.
> **Note (2025-11 addendum):** Source branches without any commits must first run a Draft→Commit cycle before merge. For isolated branches lacking a common ancestor, the CLI must materialize a `base_commit` (e.g., empty snapshot or target HEAD) or rebase to establish lineage prior to merge.

---

## 5. Product Layer: CLI + WebUI Experience

### CLI Commands

```bash
cf init project-name
cf chat                # Conversation mode
cf summary             # Generate summary using current summary agent
cf commit -m "refined summary"
cf branch feature-x
cf merge main
cf diff
cf push                # Push to cf hub (future)
```

### WebUI Modules (note)

This repository only ships the framework/backend. The WebUI is handled by a separate project and isn’t covered here.

---

## 6. Core Boundaries (Definition)

> **Notes**
> - *Deterministic* = identical inputs on the same version always yield identical outputs (no randomness/LLM).
> - *Replaceable* = any implementation can substitute the default one if it honors the same data/API contract.

| Module | Belongs To | Deterministic? | Replaceable? | Notes |
|--------|-----------|----------------|--------------|-------|
| Conversation store | Core | ✅ | ✅ | Semantic data contract is fixed; storage engines can swap (`.t3x` JSONL, SQLite, Postgres, etc.) as long as they follow `schema/` and `STORAGE_ARCHITECTURE.md`. |
| Extractor rings & findings aggregator | Core | ✅ | ✅ | Algorithms must be replayable; implementations are plugins (spaCy / Stanza / rule engines / custom). |
| Evidence scoring | Core | ✅ | ✅ | Pure-function scoring plugins (BM25 / embedding models / rules). |
| SummaryAgent | Agentic | ❌ | ✅ | LLM / template layer, optional enhancement. |
| MergeAgent | Agentic | ❌ | ✅ | Optional LLM-assisted merge; deterministic merge logic remains in Core. |
| CLI interface (external) | Product | ✅ | ✅ | Only handles protocol encoding + Core API calls; any CLI can implement `/command`, this repo ships no CLI UI. |
| WebUI interface (external) | Product | ✅ | ✅ | Exposes HTTP/RPC contracts; UI is implemented elsewhere, this repo only provides backend capabilities. |

---

## 7. `.cfpack` (Semantic Archive Format)

`.cfpack` is T3X’s semantic archive / interoperability format. It packages complete semantic history for transfer between implementations; it is not the runtime storage itself but an export/import contract.

- **Single-file JSON container**:
  - `version` / `cfpack_schema_version`: format version
  - `turns`: dialogue turns plus their hash chain
  - `findings`: normalized findings and evidence snapshots
  - `commits`: semantic commit chain and branch/merge lineage
  - `pipeline` / `config_snapshot`: referenced extractor/aggregator configs (`id` + `sha256`) and reproducibility thresholds
  - `hash`: package-level hash algorithm descriptor (e.g., `sha256-jcs-v1`) plus checksum
  - `meta`: project metadata, creation timestamp, optional implementation tag
- **Design constraints**:
  - Only depends on JSON + SHA-256, so any language can parse/verify it.
  - Self-describing and verifiable: even without the original database you can rebuild commit views and hash chains.
  - As an open format, third-party systems just need `.cfpack` read/write support to interoperate with T3X, independent of this repository’s implementation.

---

## 8. Extensible Ecosystem (Ecosystem Plan)

| Module | Open Interface | Example |
|--------|----------------|---------|
| Embedder Plugins | `register_embedder()` | bge-small, MiniLM, Instructor-xl |
| Agent Plugins | `register_agent()` | claude-summary, openai-merge |
| Storage Backend | `register_storage()` | LocalFS, GitHub, S3 |
| Exporters | `register_exporter()` | JSON, Markdown, PDF, Neo4j |

---

## 9. Business & Open Source Strategy

| Module | Open Source | Paid |
|--------|-------------|------|
| `t3x-core` | ✅ MIT / Apache 2.0 | ❌ |
| `t3x-agents` | ✅ (default templates) | ❌ |
| `t3x.app` (WebUI) | Partially open | ✅ SaaS model |
| `t3x.cloud` (Hub) | ❌ | ✅ Private semantic repository + Collaboration |

---

## 10. Development Roadmap

| Stage | Timeline | Goal |
|-------|----------|------|
| **MVP 1.0 (CLI Core)** | 2025.12 | Basic commit / diff / merge / .cfpack export / MiniLM determinism |
| **MVP 1.5 (Agentic Summary)** | 2026.01 | Pluggable LLM SummaryAgent |
| **Beta (WebUI)** | 2026.02 | Visualized Graph + Merge Suggestion |
| **Public Release** | 2026.Q2 | T3X Hub, multi-user collaboration, plugin marketplace |
| **Long-term** | 2026.Q4+ | Enterprise deployment, ecosystem partnerships |

---

## 11. Pitch to Investors / Technical Co-founders

> **We're not building "another AI Agent".**
> **We're building the semantic infrastructure layer for all agents.**

### T3X is Git for Meaning:

- Make semantics a **version-controlled asset**
- Make every conversation **traceable, replayable, and shareable**
- Enable all LLMs to **collaborate on the same semantic foundation**

---

## Architecture Diagram (ASCII)

```
> **Note:** Product layers can call the Framework Core directly; the Agentic layer is an optional LLM enhancement.

┌─────────────────────────────────────────────────────────────┐
│                     PRODUCT LAYER                           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  CLI interface │  │  WebUI interface│  │ T3X Hub│ │
│  │  (external,    │  │  (external,    │  │ (external,     │ │
│  │   drives Core  │  │   drives Core  │  │  consumes Core │ │
│  │   APIs)        │  │   APIs)        │  │  APIs)         │ │
│  └──────┬─────────┘  └──────┬────────┘  └──────────┬──────┘ │
└─────────┼────────────────────┼──────────────────────┼────────┘
          │                    │                      │
┌─────────┼────────────────────┼──────────────────────┼────────┐
│         │      AGENTIC LAYER (Optional LLM)         │        │
│  ┌──────▼──────────┐              ┌──────────────▼────────┐ │
│  │ SummaryAgent    │              │    MergeAgent         │ │
│  │ (GPT/Claude/    │              │  (Conflict resolver)  │ │
│  │  Local LLM)     │              │                       │ │
│  └─────────────────┘              └───────────────────────┘ │
└─────────┼────────────────────────────────┼─────────────────┘
          │                                │
┌─────────┼────────────────────────────────┼─────────────────┐
│         │       FRAMEWORK CORE (Deterministic)             │
│  ┌──────▼──────────────────────────────────▼────────────┐ │
│  │ Conversation Store (JSONL ledger + SQLite index)       ││
│  │   ↳ Hashing (content/flow hash chain)                  ││
│  │                                                       ││
│  │ Extractor Rings / Findings Aggregator                 ││
│  │   ↳ Pluggable extractors + normalization/dedup        ││
│  │ Evidence Scoring                                      ││
│  │   ↳ Pluggable scoring models (e.g., MiniLM / bge-small)││
│  │                                                       ││
│  │ Commit / Diff / Merge Engine (snapshot only)          ││
│  │   ↳ Operates on snapshots (draft/commit) for semantic ││
│  │     diff/merge                                       ││
│  │                                                       ││
│  │ `.cfpack` Export                                     ││
│  │   ↳ Exports the project ledger as an open archive    ││
│  │                                                       ││
│  │ Core dependencies: SHA-256, pluggable embedding models ││
│  │ (e.g., MiniLM/bge-small), regex heuristics, deterministic││
│  │ scoring, provenance manifest                          ││
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

1. **Determinism first** – the framework core must be 100% reproducible.
2. **Extractors, not slots** – semantic facts come from composable extractors + findings aggregation, not hand-crafted slot schemas.
3. **LLM as plugin** – the core never depends on a specific LLM; Agentic layers are optional.
4. **Open format** – `.cfpack` (open JSON) ensures export + interoperability.
5. **Git-like UX** – reuse the mental model and commands developers already know.
6. **Progressive enhancement** – works offline without external models, improves further when models are available.
7. **Minimal core** – keep the inner core small and extend via plugins/external services.

---

## Technical Challenges & Solutions

### Challenge 1: Finding Stability
- **Problem:** Tiny wording changes cause extractor jitter.
- **Solution:** Canonicalize extractor outputs, dedupe via meta-extractors, and enforce semantic-neighbor thresholds.

### Challenge 2: Findings Aggregation Conflicts
- **Problem:** Semantic findings can conflict without a single truth.
- **Solution:** Deterministic, evidence-backed diffs paired with human confirmation workflows, plus optional MergeAgent suggestions.

### Challenge 3: Scale Performance
- **Problem:** Long conversations inflate extraction and scoring cost.
- **Solution:** Incremental indexing, chunked extraction, cache repeated turn scores.

### Challenge 4: Portability & Interoperability
- **Problem:** Semantic state must travel across systems.
- **Solution:** `.cfpack` open JSON + versioned extractor/scoring metadata.

### Challenge 5: Reproducibility Drift
- **Problem:** Plugin upgrades change outputs.
- **Solution:** Pin extractor/scoring configs (`id + sha256`) inside commits and `.cfpack`, storing config snapshots.

---

## Success Metrics

### Technical Metrics
- Deterministic reproducibility rate: **100%**
- Findings extraction/aggregation precision (human-labeled validation): **>85%**
- Merge suggestion acceptance rate: **>70%**

### Business Metrics
- GitHub stars (target): **1K+ in 6 months**
- Active CLI users (target): **5K+ by 2026.Q2**
- SaaS ARR (target): **$100K+ by 2026.Q4**

---

## Competitive Positioning

| Product | Category | LLM-Dependent? | Version Control? | Our Advantage |
|---------|----------|----------------|------------------|---------------|
| ChatGPT/Claude | Chat UI | ✅ | ❌ | We're infrastructure, not UI |
| Notion AI | Note-taking | ✅ | ❌ | We're semantic, not document |
| Git | Code versioning | ❌ | ✅ | We handle semantics, not syntax |
| LangChain / LlamaIndex | LLM orchestration | ✅ | ❌ | We provide semantic state + version control, not prompt pipelines |
| **T3X** | **Semantic versioning** | **❌ Core (Agentic can use LLM optionally)** | **✅** | **Deterministic core + pluggable LLMs** |

---

_Document Version: 2.0_
_Last Updated: 2025-11-17_
