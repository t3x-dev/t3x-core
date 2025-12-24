# T3X

**Git for Meaning** — Evidence-backed semantic version control for AI conversations

---

## What is T3X?

T3X is the first **semantic version control system** that makes AI conversations verifiable, traceable, and collaborable—just like Git does for code.

### The Core Innovation: Evidence-Backed Findings

Every semantic change in T3X is:
- **Deterministic**: Same conversation → same semantic state
- **Evidence-backed**: Every decision traces to source turns
- **Versioned**: Branch, merge, and diff semantic understanding
- **Reproducible**: Full provenance tracking for audits

```
User: "Let's go to Osaka instead of Tokyo"
  ↓
T3X findings:
  - {"text": "Osaka", "kind": "entity", "turnId": "42", "meta": {"type": "location"}}
  - {"text": "street food scene", "kind": "phrase", "turnId": "42"}
  - {"text": "Budget around $2000", "kind": "relation", "turnId": "42", "meta": {"kind": "budget_le", "value": 2000, "currency": "USD"}}

Merged aspects:
  - Trip Focus · Osaka street food (evidence: Turn 42, score: 0.89)
  - Budget ≤ $2000 (evidence: Turn 42, score: 0.92)
```

Unlike ChatGPT (black box) or Notion (unversioned), T3X gives you **provenance for every claim**.

---

## Four-Layer Architecture

T3X is built as a **deterministic reasoning compiler** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────┐
│         LAYER 4: PRODUCT (The Interface)            │
│  CLI (cf commit, cf merge) + WebUI (visual diff)   │
│  • Phase 1: CLI with inline commands (:commit)     │
│  • Phase 3: WebUI with visual lineage graph        │
│  • Phase 4: Cloud collaboration + team workspaces  │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│      LAYER 3: SEMANTIC CORE (The Intelligence)      │
│                                                     │
│  ★ MVP 1.1 (Phase 1): Deterministic Finding Layer  │
│    • Evidence scoring(embed + BM25 + meta weights)│
│    • Extractor rings(surface / relation / structural)           │
│    • Semantic-oriented composer(findings → aspects)          │
│    • Confidence gating(auto / suggest / ignore)          │
│                                                     │
│  ★ Phase 2: Dual-Pipeline Enhancements             │
│    • NLP backends(spaCy/Stanza/Spark NLP)        │
│    • Validation layer: semantic consistency / type checking                 │
│    • Intent modes(knowledge / decision / …)         │
│    • Advanced contradiction detection                                  │
│                                                     │
│  ★ Phase 2+: Optional LLM Agents                   │
│    • SummaryAgent (OpenAI/Claude/local/template)   │
│    • MergeAgent (conflict resolution suggestions)  │
│                                                     │
│  Goal: Deterministic, evidence-backed reasoning    │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│   LAYER 2: LINEAGE PROTOCOL (The Guarantees)       │
│                                                     │
│  ★ Two-Chain System:                               │
│    • Turn Chain: prev_turn_hash → hash (SHA-256)   │
│    • Commit Chain: parent → commit_hash + Ed25519  │
│                                                     │
│  ★ Cryptographic Verification:                     │
│    • JCS canonicalization (deterministic JSON)     │
│    • SHA-256 content hashing                       │
│    • Ed25519 signature (commit authenticity)       │
│    • Anchor points (commits reference turn hashes) │
│                                                     │
│  Goal: Git-like immutability and auditability      │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│     LAYER 1: STORAGE (The Foundation)               │
│                                                     │
│  • Native Format: JSONL (turns) + SQLite (findings/aspects)  │
│  • .cfpack Export: Portable JSON for sharing       │
│  • Schema: Minimal, platform-agnostic              │
│  • Indexed: Fast queries, ACID guarantees          │
│                                                     │
│  Goal: Fast, portable, verifiable persistence      │
└─────────────────────────────────────────────────────┘
```

### Design Principles

1. **Foundation First**: Storage + lineage before intelligence
2. **Core Hard**: Deterministic layer never depends on LLMs
3. **Progressive Enhancement**: MVP 1.0 → Phase 2 dual-model → Phase 3 WebUI
4. **Models Attachable**: Plug in any NLP/LLM or use template-based fallbacks
5. **Product Useful**: Intuitive UX on deterministic, verifiable core

---

## Quick Start

### Installation

```bash
npm install -g @t3x/cli
```

### Initialize a Project

```bash
cf init my-project
cd my-project
```

### Start a Conversation

```bash
cf chat

> user: I want to plan a trip to Japan
[assistant] Great! Tokyo or Osaka?

> user: Osaka, for the food scene. Budget around $2000.
[assistant] Perfect! Let me help with that.

> :summary
[Draft Summary]
  Trip Focus · Osaka street food (confidence: 0.87)
    Findings:
    - Turn 3 (relation): "Osaka, for the food scene" (0.89)
    - Turn 3 (phrase): "street food" (0.82)

  Budget ≤ $2000 (confidence: 0.92)
    Findings:
    - Turn 3 (relation): "Budget around $2000" (0.92)

> :commit "Confirmed Osaka trip plan"
✓ Commit abc123 created
✓ Evidence verified
✓ Aspects: 2 added, 0 modified
```

### View History

```bash
cf log

commit abc123 (HEAD -> main)
Author: You
Date: 2025-10-23

    Confirmed Osaka trip plan

    Aspects:
    + Trip Focus · Osaka street food (confidence: 0.87)
    + Budget ≤ $2000 (confidence: 0.92)
```

### Diff Between States

```bash
cf diff HEAD~1 HEAD

Aspect Changes:
  Trip Focus · Osaka street food (added)
    Findings:
      - Turn 3 "Osaka, for the food scene" (relation, 0.89)
      - Turn 3 "street food" (phrase, 0.82)

  Budget ≤ $2000 (added)
    Findings:
      - Turn 3 "Budget around $2000" (relation, 0.92)
```

### Merge Branches

```bash
cf branch feature/budget-increase
cf checkout feature/budget-increase

# Make changes
cf chat
> user: Let's increase budget to $2500

cf commit "Increase budget to $2500"
cf checkout main
cf merge feature/budget-increase

Merge Summary:
  Conflict: Budget aspect (main: ≤ $2000, feature: ≤ $2500)

  Main evidence:
  - Turn 3: "Budget around $2000" (score: 0.92)

  Feature evidence:
  - Turn 12: "Let's increase budget to $2500" (score: 0.94)

  Suggestion: 2500 (confidence: 0.88, newer evidence)

Accept suggestion? [Y/n]
```

---

## Why T3X?

### The Problem

AI conversations today are:
- **Ephemeral**: No history, no proof of what was said
- **Unverifiable**: Did the AI actually say that? Was it edited?
- **Locked-in**: Your ChatGPT data stays in ChatGPT
- **Opaque**: Why did the AI conclude X? What evidence?

### The Solution

T3X makes conversations:
- **Verifiable**: Cryptographic proof of history (hash chains)
- **Traceable**: Every claim traces to evidence
- **Portable**: Export/import across platforms (.cfpack format)
- **Collaborative**: Branch, merge, review like code

### Use Cases

**1. Research & Analysis**
```bash
# Track evolving understanding over multiple sessions
cf branch literature-review
cf chat  # Discuss papers
cf commit "Initial findings from Nature paper"
cf merge main  # Integrate with existing knowledge
```

**2. Team Collaboration**
```bash
# Multiple people contribute to shared context
alice$ cf chat  # Adds market research
alice$ cf commit "Q3 market analysis"
alice$ cf push

bob$ cf pull
bob$ cf chat  # Adds competitive analysis
bob$ cf commit "Competitor feature matrix"
bob$ cf push
```

**3. Decision Tracking**
```bash
# Audit trail for critical decisions
cf chat  # Discuss product direction
cf commit "Decided to pivot to enterprise"
cf log --show-evidence  # See exactly why decision was made
```

**4. AI Agent Memory**
```python
# Deterministic, verifiable agent memory
from t3x import Repository

repo = Repository("agent-memory")
aspects = repo.get_current_state()

# Agent uses aspects for decision-making
response = agent.act(aspects)

# Commit agent's understanding
repo.commit("Agent processed user request", evidence=turns)
```

---

## Core Features

### 1. Evidence-Backed Everything

Every aspect is stitched together from concrete findings:

```json
{
  "id": "aspect-trip-focus",
  "title": "Trip Focus · Osaka street food",
  "confidence": 0.87,
  "findings": [
    {
      "turnId": "42",
      "text": "Let's go to Osaka instead of Tokyo",
      "score": 0.89,
      "kind": "relation",
      "components": {
        "semantic": 0.94,
        "lexical": 0.85,
        "recency": 0.89,
        "authority": 1.0,
        "type_match": 1.0
      }
    }
  ]
}
```

Click any aspect → inspect the supporting signals and turns.

### 2. Deterministic Core

Same conversation → same semantic state (100% reproducible):

```bash
# Run 1
cf commit "Trip planning" --hash abc123

# Run 2 (same conversation)
cf commit "Trip planning" --hash abc123  # Identical!
```

No LLM randomness in the core. Evidence scoring is:
- Embedding-based (MiniLM/bge-small, pinned versions)
- BM25 lexical matching
- Recency + role + type weighting
- Fully deterministic with same inputs

### 3. Hybrid Scoring

Why is evidence turn #42 ranked higher than #38?

```
Evidence Score: 0.89

  Semantic similarity:  0.94 ████████████████████
  Keyword match (BM25): 0.85 █████████████████
  Recency:              0.89 ██████████████████
  Authority (user):     1.00 ████████████████████
  Type match:           1.00 ████████████████████
```

Users understand and trust the ranking.

### 4. Contradiction Detection

Old, contradicted turns are automatically filtered:

```
Turn 15: "Let's go to Tokyo"  [suppressed: contradicted by Turn 42]
Turn 42: "Actually, Osaka instead" ✓ [current decision]
```

### 5. Confidence Gating

High-confidence changes auto-apply. Low-confidence need review:

```
Auto-applied (confidence: 0.87):
  + Trip Focus · Osaka street food

Needs review (confidence: 0.62):
  ~ Budget ≤ $2000?
    [Accept] [Edit] [Reject]
```

### 6. Full Provenance

Every commit records everything:

```yaml
commit: abc123
timestamp: 2025-10-23T10:30:00Z
aspects:
  - id: aspect-trip-focus
    title: Trip Focus · Osaka street food
    evidence_turns: [42, 45]
    confidence: 0.87

provenance:
  embedder:
    model: sentence-transformers/all-MiniLM-L6-v2
    sha256: fedcba...
    precision: fp16
  scoring:
    weights: {cosine: 0.45, bm25: 0.25, recency: 0.10, ...}
    half_life_hours: 48
  locale: en_US
  t3x_version: 1.0.0
```

Reproduce exact results anytime.

---

## Architecture Details

### Layer 1: Storage (The Foundation)

**Fast, portable, verifiable persistence.**

- **Native Format**: Optimized for speed and efficiency
  - **JSONL** for conversation turns (append-only, fast)
  - **SQLite** for findings/aspects, commits, queries (indexed, ACID)
  - **JSON** for commit snapshots (human-readable)

- **.cfpack Export**: Optional portable format
  - Open JSON for sharing across T3X instances
  - LLM-friendly (feed directly to any LLM for context)
  - Long-term archival with full provenance

Technologies:
- Storage: SQLite + JSONL
- Optional: FAISS for embedding index (fast semantic search)
- Export: Portable JSON with schema validation

### Layer 2: Lineage Protocol (The Guarantees)

**Git-like immutability and auditability. No LLM required.**

- **Turn Chain**: Immutable conversation history
  - Each turn includes `prev_turn_hash` → `hash` (SHA-256)
  - JCS canonicalization ensures deterministic hashing
  - Tampering detection via hash verification

- **Commit Chain**: Cryptographically signed semantic snapshots
  - `parent` → `commit_hash` + Ed25519 signature
  - Anchor points: commits reference specific turn hashes
  - Branching: multiple commits can share same parent
  - Merging: commits can have multiple parents

- **Verification**: `cf verify` validates entire lineage
  - Checks turn chain integrity (all hashes link correctly)
  - Validates commit signatures (Ed25519)
  - Ensures anchor points reference valid turns

Technologies:
- Hashing: SHA-256 + JCS (JSON Canonicalization Scheme)
- Signatures: Ed25519 (fast, secure, deterministic)
- Storage: SHA-256 content-addressable store

### Layer 3: Semantic Core (The Intelligence)

**Deterministic, evidence-backed reasoning.**

#### Phase 1 (MVP 1.1): Deterministic Finding Layer

- **Evidence Scoring Engine**: Hybrid ranking (100% reproducible)
  - 45% Semantic similarity (sentence-transformers: MiniLM/bge-small)
  - 25% Lexical matching (BM25 for keyword hits)
  - 10% Recency (timestamp decay, half-life: 48h)
  - 10% Speaker authority (user > tool > assistant)
  - 10% Type matching (date/currency/location alignment)

- **Extractor Rings**: Pluggable, deterministic modules
  - Ring A — Surface extractors (regex/token heuristics)
  - Ring B — Relational extractors (preferences, constraints, relations)
  - Ring C — Structural extractors (headings, lists, blocks)
  - All implement the `Extractor` interface (`run(turn) -> ExtractedItem[]`)

- **Aspect Composer**: Deterministic merge of findings
  - Normalize and dedupe findings with optional meta-extractors
  - Cluster compatible findings into aspects with shared evidence
  - Track confidence per aspect using scoring + finding provenance

- **Confidence Gating**: Auto-apply vs manual review
  - Auto-apply: confidence ≥ 0.78 AND margin ≥ 0.08
  - Suggest: 0.60 ≤ confidence < 0.78 (human reviews)
  - Ignore: confidence < 0.60

Technologies:
- Embeddings: `sentence-transformers` (MiniLM, bge-small, pinned versions)
- BM25: `rank-bm25` (deterministic tokenization)
- Extractors: regex, spaCy noun chunks, custom heuristics (pure functions)

#### Phase 2 (Dual-Model Pipeline)

- **Advanced Extractors**: NLP backends for deeper signals
  - spaCy/Stanza/Spark NLP pipelines for dependency-aware findings
  - Pattern-driven extractors (YAML-configured regex sets)
  - Optional neural model extractors (MiniLM attention probes)

- **Validator Layer**: Semantic validation on merged aspects
  - Uses MiniLM for paraphrase detection
  - Checks evidence-aspect alignment
  - Verifies type consistency

- **Intent Modes**: Context-aware extraction
  - `knowledge`: Facts, concepts, definitions (default)
  - `decision`: Actions, commitments, agreements
  - `analysis`: Comparisons, constraints, tradeoffs
  - `creative`: Narrative, style, tone
  - `plan`: Milestones, dependencies, timelines

Configuration:
```yaml
# .t3x/config.yml
semantic:
  extractor:
    type: clustering  # or: spacy, stanza, spark_nlp
    model: en_core_web_sm  # if using spacy

  validator:
    model: sentence-transformers/all-MiniLM-L6-v2
    threshold: 0.78

  intent: knowledge  # or: decision, analysis, creative, plan
```

#### Phase 2+ (Optional LLM Agents)

- **SummaryAgent**: Aspects + findings → narrative summary
  - Providers: OpenAI, Claude, local Llama, rule-based template
  - Grounding: Always cites evidence turns
  - Fallback: Template-based summary if LLM unavailable

- **MergeAgent**: Conflict resolution suggestions
  - Input: Conflicting aspects + supporting findings from both sides
  - Output: Suggested resolution + confidence
  - Human-in-loop: User approves/rejects

Configuration:
```yaml
# .t3x/config.yml
agents:
  summary:
    provider: openai
    model: gpt-4o-mini
    temperature: 0.3

  merge:
    provider: claude
    model: claude-3-5-sonnet-20241022
    temperature: 0.2
```

### Layer 4: Product (The Interface)

**Intuitive UX on deterministic, verifiable core.**

- **Phase 1 (MVP)**: CLI with inline commands
  - `cf init`, `cf config`, `cf chat`
  - Inline: `:commit`, `:summary`, `:diff`, `:log`, `:verify`
  - Template-based summaries (no LLM required)

- **Phase 3**: WebUI
  - Visual conversation stream (turn hashes, evidence cards)
  - Draft/diff panel (GitHub PR-like review)
  - Commit history with lineage graph
  - Verification dashboard

- **Phase 4**: T3X Cloud
  - Hosted repository (push/pull like Git)
  - Team collaboration
  - Analytics dashboard
  - Plugin marketplace

---

## File Formats

### Native Format (Primary)

T3X uses its own **native format** optimized for speed and efficiency:
- **JSONL** for conversation turns (append-only, fast)
- **SQLite** for findings/aspects, commits, queries (indexed, ACID)
- **JSON** for commit snapshots (human-readable)

See `docs/FILE_FORMATS.md` for details.

### .cfpack Export (Optional)

**`.cfpack`** is an **optional portable JSON export** for:
- Sharing conversations (import back to T3X)
- Feeding to LLMs (it's just open JSON)
- Long-term archival

Export with: `:export "myfile.cfpack"` (inside chat) or `cf export myfile.cfpack`

**Example .cfpack** (it's just JSON):

```json
{
  "t3x_version": "1.0.0",
  "format": "cfpack",
  "metadata": {
    "created": "2025-10-23T10:00:00Z",
    "name": "Trip Planning Session"
  },
  "conversations": [
    {
      "id": "conv-001",
      "messages": [
        {
          "id": "turn-001",
          "role": "user",
          "content": "I want to plan a trip",
          "timestamp": "2025-10-23T10:00:00Z",
          "hash": "abc123..."
        }
      ]
    }
  ],
  "findings": [
    {
      "id": "finding-001",
      "turn_id": "turn-042",
      "text": "Let's go to Osaka instead of Tokyo",
      "kind": "relation",
      "score": 0.89,
      "meta": {"kind": "prefer", "target": "osaka"}
    }
  ],
  "aspects": [
    {
      "id": "aspect-trip-focus",
      "title": "Trip Focus · Osaka street food",
      "finding_ids": ["finding-001"],
      "confidence": 0.87
    }
  ],
  "commits": [
    {
      "id": "commit-abc123",
      "message": "Confirmed Osaka trip",
      "timestamp": "2025-10-23T10:30:00Z",
      "aspects": ["aspect-trip-focus", "aspect-budget"],
      "parent": "commit-def456",
      "hash": "abc123..."
    }
  ]
}
```

**Why .cfpack?**
- **Portable**: Import back to T3X anytime
- **LLM-friendly**: Feed directly to any LLM for context
- **Open JSON**: No special tools needed, just JSON

**You don't need .cfpack** for normal usage. The native format (JSONL + SQLite) is faster and more efficient.

---

## Development Status

### ✅ Completed (Foundation)
- Four-layer architecture defined (Storage → Lineage → Semantic → Product)
- Evidence scoring specification v2.0 (hybrid scoring)
- Lineage protocol design (two-chain system)
- Cryptographic verification approach (SHA-256 + Ed25519)
- Extractor interface + aspect assembly design

### 🚧 In Progress (MVP 1.1)
- Evidence scoring engine implementation (hybrid: embed + BM25 + metadata)
- Extractor rings (surface, relational, structural)
- Aspect composer (finding clustering + deterministic merge)
- Turn chain (SHA-256 hashing + JCS canonicalization)
- Commit chain (Ed25519 signatures)
- CLI with inline commands (`:commit`, `:summary`, `:diff`)
- Conversation storage (JSONL + SQLite)

### 📅 Planned (Roadmap)

**Phase 1 (Q4 2025)**: MVP 1.0 - Foundation + Evidence
- ✅ **Layer 1**: Storage (JSONL + SQLite)
- ✅ **Layer 2**: Lineage protocol (turn + commit chains)
- ✅ **Layer 3**: Evidence scoring v1 (embed + BM25 + recency + role + type)
- ✅ **Layer 4**: CLI: `init`, `config`, `chat` (with inline `:commit`, `:summary`, `:diff`, `:verify`)
- ✅ Confidence gating (auto-apply vs review)
- ✅ Base extractor set (surface heuristics + clustering composer)
- ✅ .cfpack export/import
- 🎯 **Success**: Evidence@1 > 80%, users trust the system

**Phase 2 (Q1-Q2 2026)**: Dual-Model Pipeline + Intent Modes
- 🔄 **Extractor Layer**: Pluggable NLP backends
  - Default: Clustering (from Phase 1)
  - Advanced: spaCy/Stanza/Spark NLP (linguistic parsing)
  - Custom: User-defined extractors via plugin API
- 🔄 **Validator Layer**: Semantic validation
  - Paraphrase detection (same meaning, different words)
  - Type consistency checking
  - Evidence-value alignment verification
- 🔄 **Intent Modes**: Context-aware extraction
  - `knowledge` (default): Facts, concepts, definitions
  - `decision`: Actions, commitments, agreements
  - `analysis`: Comparisons, constraints, tradeoffs
  - `creative`: Narrative, style, tone
  - `plan`: Milestones, dependencies, timelines
- 🔄 **Advanced Features**:
  - Contradiction detection (override suppression)
  - Multi-source aspects (lists, alternatives)
  - Temporal reasoning (date ranges, sequences)
- 🔄 **Optional LLM Agents**:
  - SummaryAgent (OpenAI/Claude/local/template)
  - MergeAgent (conflict resolution suggestions)
- 🎯 **Success**: Intent-aware extraction, pluggable models

**Phase 3 (Q2-Q3 2026)**: WebUI + Collaboration
- 🔄 Visual conversation stream (turn hashes, evidence cards)
- 🔄 Draft/diff panel (GitHub PR-like review)
- 🔄 Commit history with lineage graph (branches, merges)
- 🔄 Verification dashboard (chain integrity status)
- 🔄 3-way merge with conflict resolution UI
- 🔄 Branching and merging (Git-like workflows)
- 🎯 **Success**: GitHub-like UX for semantic versioning

**Phase 4 (Q3-Q4 2026)**: T3X Cloud + Ecosystem
- ☁️ Hosted repository (push/pull like Git)
- 👥 Team collaboration (shared contexts, permissions)
- 📊 Analytics dashboard (evidence quality, usage metrics)
- 🔌 Plugin marketplace (custom extractors, validators, exporters)
- 🌐 **T3X Hub**: Public registry of reasoning artifacts
  - Publish, fork, and merge context commits
  - Reuse verified .cfpack templates
  - Monetize premium reasoning artifacts
- 🎯 **Success**: Production-ready for enterprise agent systems

See `docs/ROADMAP.md` for full details.

---

## CLI Commands

```bash
# Initialize
cf init <project-name>

# Chat
cf chat                      # Start interactive session
cf chat --model gpt-4        # Override model

# Version control
cf commit -m "message"       # Create commit from current state
cf diff <commit1> <commit2>  # Show semantic diff
cf log                       # Show commit history
cf log --show-evidence       # Include evidence

# Branching
cf branch <name>             # Create branch
cf checkout <name>           # Switch branch
cf merge <branch>            # Merge branch

# Verification
cf verify                    # Verify conversation integrity
cf verify --commit <hash>    # Verify specific commit

# Export
cf export "file.cfpack"      # Export to portable JSON
cf import file.cfpack        # Import .cfpack file

# Agents (optional)
cf summary                   # Generate narrative summary
cf summary --agent template  # Use template (no LLM)
```

---

## Repository Structure

```
t3x/
├── core/                       # Core deterministic layer
│   ├── storage/                # Conversation + commit storage
│   ├── findings/               # Extractors + aspect composer
│   │   ├── extractors/         # Surface / relational / structural rings
│   │   ├── composer/           # Merge findings into aspects
│   │   └── meta/               # Deduplication, normalization
│   ├── evidence/               # ★ Evidence scoring (the heart)
│   ├── versioning/             # Diff, merge, commit
│   └── export/                 # .cfpack export + validation
│
├── agents/                     # Optional LLM agents
│   ├── summary.py              # SummaryAgent
│   ├── merge.py                # MergeAgent
│   └── plugins/                # Plugin system
│
├── cli/                        # Command-line interface
│   └── commands/               # CLI commands
│
├── web/                        # Web interface (future)
│
├── ARCHITECTURE.md             # Full architecture (authoritative)
├── MVP1-SCOPE.md               # MVP1.1 execution blueprint
├── docs/                       # Drafts / supporting notes
│   ├── CORE_ARCHITECTURE.md    # Evidence-centric design (legacy)
│   ├── EVIDENCE_SCORING_V2.md  # Evidence scoring spec
│   ├── FACET_SUMMARY_LLM.md    # Legacy facet-summary notes (pending migration)
│   └── DEV_PRIORITIES.md       # Development roadmap
│
└── README.md                   # This file
```

---

## For Developers

### Contributing

We're in active development (MVP 1.0). See `CONTRIBUTING.md` for guidelines.

**Most helpful:**
- Testing evidence scoring on real conversations
- Reporting edge cases (contradiction detection, type extraction)
- Performance benchmarks
- Documentation improvements

**Not accepting yet:**
- Large architectural changes
- Cloud/deployment features
- WebUI PRs (coming in Phase 3)

### Running Tests

```bash
# Core layer tests (must be 100% deterministic)
pytest core/tests/ -v

# Evidence scoring tests
pytest core/evidence/tests/ -v --cov

# Integration tests
pytest tests/integration/ -v
```

### Skipped Tests (Pending Implementation)

The following test modules are currently skipped because they depend on modules
planned for future phases:

| Test File | Required Module | Status |
|-----------|-----------------|--------|
| `test_cli_commands.py` | `cli.commands` | Phase 3 |
| `test_lineage_chain.py` | `core.lineage` | Phase 3 |
| `test_perf_bench.py` | `core.evidence` | Phase 2+ |
| `test_scorer_determinism.py` | `core.evidence` | Phase 2+ |
| `test_storage_determinism.py` | `core.storage.JSONLConversationStore` | Phase 2+ |
| `test_tokenizer_determinism.py` | `core.evidence` | Phase 2+ |

These tests serve as specifications for the planned modules. Once the modules
are implemented, remove the `pytest.skip()` call at the top of each file to
enable them.

### Development Setup

```bash
git clone https://github.com/t3x/t3x
cd t3x

# Install dependencies
pip install -r requirements.txt
pip install -e .

# Run CLI in dev mode
cf --dev chat
```

---

## Comparison

| Feature | ChatGPT | Notion AI | Git | T3X |
|---------|---------|-----------|-----|-------------|
| **Conversation storage** | ✅ | ✅ | ❌ | ✅ |
| **Version control** | ❌ | ❌ | ✅ | ✅ |
| **Evidence-backed claims** | ❌ | ❌ | ❌ | ✅ |
| **Verifiable (hashes)** | ❌ | ❌ | ✅ | ✅ |
| **Semantic diffing** | ❌ | ❌ | ❌ | ✅ |
| **Branching/merging** | ❌ | ❌ | ✅ | ✅ |
| **LLM-agnostic** | ❌ | ❌ | N/A | ✅ |
| **Portable (export)** | Limited | ❌ | ✅ | ✅ |
| **Reproducible** | ❌ | ❌ | ✅ | ✅ |

T3X = **Git for meaning** + **Evidence-backed AI** + **LLM-agnostic core**

---

## FAQ

**Q: Do I need an LLM to use T3X?**
A: No! The core layer (extractors, aspects, evidence, versioning) works without any LLM. Summaries are optional enhancements.

**Q: What makes T3X different from vector databases?**
A: Vector DBs store embeddings for search. T3X adds version control, evidence tracking, and semantic diffing.

**Q: Can I use my own embedding model?**
A: Yes! Register custom embedders via the plugin API:
```python
from t3x import register_embedder
register_embedder("my-embedder", MyEmbedder())
```

**Q: How does evidence scoring work?**
A: Hybrid scoring:
- 45% semantic similarity (embeddings)
- 25% lexical match (BM25)
- 10% recency, 10% speaker role, 10% type match
- Fully deterministic with same inputs

See `docs/EVIDENCE_SCORING_V2.md` for details.

**Q: Is this production-ready?**
A: Not yet. MVP 1.0 is for early adopters. Production-ready in Q2 2026.

**Q: How do I export conversations?**
A: `cf export "file.cfpack"` creates portable .cfpack files (open JSON) that work across T3X instances.

**Q: Can T3X detect if someone edited a conversation?**
A: Yes! Hash chains make tampering detectable:
```bash
cf verify
❌ Turn 3: hash mismatch (content was modified)
```

---

## Philosophy

### Core Hard
The deterministic layer (extractors, aspects, evidence, versioning) must be rock-solid:
- 100% reproducible
- No LLM dependencies
- Extensively tested
- Performance-optimized

### Models Attachable
LLMs are plugins, not requirements:
- OpenAI, Claude, local models, or rule-based
- Graceful degradation (template fallback)
- Easy to swap providers

### Product Useful
Great UX matters:
- Intuitive CLI commands
- Beautiful WebUI
- Clear error messages
- Helpful documentation

**Balance**: Engineering rigor + user delight.

---

## Community

- **GitHub**: https://github.com/t3x/t3x
- **Discussions**: https://github.com/t3x/t3x/discussions
- **Issues**: https://github.com/t3x/t3x/issues
- **Docs**: https://docs.t3x.dev

---

## License

MIT License - see `LICENSE` file

---

## Vision

> **Every conversation should be versioned, verifiable, and valuable.**

T3X is building the infrastructure layer for AI memory. When agents collaborate, they need shared, versioned, evidence-backed understanding—just like developers need Git for code.

We're not building another chatbot. We're building the **semantic operating system** for AI collaboration.

Join us.

---

**Status**: MVP 1.0 in active development
**Expected Release**: Q4 2025
**Questions?** Open a GitHub discussion

---

_"If Git is for code, T3X is for meaning."_
