# T3X Semantic Layer Architecture

> Clean separation: Commits = Knowledge (Sentences), Leaves = Application (Constraints)

**Status**: Implemented
**Last Updated**: 2026-01-29

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Separation](#architecture-separation)
3. [Commit Layer (Semantic)](#commit-layer-semantic)
4. [Leaf Layer (Application)](#leaf-layer-application)
5. [Data Flow](#data-flow)
6. [Memory & Context](#memory--context)
7. [Data Models](#data-models)
8. [Migration from Current Design](#migration-from-current-design)
9. [Benefits](#benefits)

---

## Overview

### The Key Insight

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   BEFORE: Mixed concerns                                                │
│   ──────────────────────                                                │
│   Commit = Sentences + Constraints  (❌ conflated)                      │
│                                                                         │
│   AFTER: Clean separation                                               │
│   ───────────────────────                                               │
│   Commit = Sentences only           (✅ pure knowledge)                 │
│   Leaf = Constraints + Validation   (✅ pure application)               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Principle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   "Semantic version control is for sentence extraction and confirm."   │
│                                                                         │
│   "If one ever wants to play the constraint game, that's for leaf."    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Separation

### Two Distinct Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         T3X ARCHITECTURE                                │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    COMMIT LAYER (Semantic)                       │  │
│   │                                                                  │  │
│   │   Purpose: "What do we know?"                                   │  │
│   │                                                                  │  │
│   │   • Sentences (extracted facts, knowledge)                      │  │
│   │   • Hash chain (versioning, integrity)                          │  │
│   │   • Branch/merge (knowledge evolution)                          │  │
│   │   • Source references (lineage)                                 │  │
│   │                                                                  │  │
│   │   ❌ NO constraints here                                         │  │
│   │                                                                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ feeds                                    │
│                              ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    LEAF LAYER (Application)                      │  │
│   │                                                                  │  │
│   │   Purpose: "How do we use it?"                                  │  │
│   │                                                                  │  │
│   │   • Constraints (REQUIRE/EXCLUDE rules)                         │  │
│   │   • LLM wrapper (prompt construction)                           │  │
│   │   • Output generation (using commit knowledge)                  │  │
│   │   • Validation (checking against constraints)                   │  │
│   │   • Assertions (pass/fail results)                              │  │
│   │                                                                  │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Analogy: Git + Build System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Git Analogy                        T3X Equivalent                     │
│   ───────────                        ──────────────                     │
│                                                                         │
│   Git repository                     Commit layer                       │
│   • Source code                      • Sentences (knowledge)            │
│   • Version history                  • Hash chain                       │
│   • Branches                         • Branches                         │
│                                                                         │
│   Build system (CI/CD)               Leaf layer                         │
│   • Build configuration              • Constraints                      │
│   • Compilation                      • LLM generation                   │
│   • Tests                            • Validation                       │
│   • Artifacts                        • Outputs                          │
│                                                                         │
│   Same code → different build configs = different artifacts             │
│   Same commit → different constraints = different leaf outputs          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Commit Layer (Semantic)

### What Commits Contain

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           COMMIT                                        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ hash: "sha256:7f83b165..."                                      │  │
│   │ parent_hashes: ["sha256:abc123..."]                             │  │
│   │ branch: "main"                                                  │  │
│   │                                                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │ SENTENCES (the knowledge)                                       │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │                                                                 │  │
│   │ • "Service fee is $5,000 per month"                            │  │
│   │ • "30-day money-back guarantee available"                      │  │
│   │ • "Enterprise plans start at 10 seats"                         │  │
│   │ • "Support response time is 24 hours"                          │  │
│   │                                                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │ SOURCE REFERENCES (lineage, not in hash)                        │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │                                                                 │  │
│   │ • conv#12 "Pricing Discussion"                                 │  │
│   │ • conv#34 "Enterprise Terms"                                   │  │
│   │                                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ❌ NO constraints                                                     │
│   ❌ NO validation rules                                                │
│   ❌ NO REQUIRE/EXCLUDE                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Commit Operations

| Operation | Description |
|-----------|-------------|
| **Extract** | Pull sentences from conversations |
| **Curate** | Select which sentences to include |
| **Commit** | Freeze sentences with hash |
| **Branch** | Create parallel knowledge lines |
| **Merge** | Combine sentences from branches |
| **Inherit** | Build on previous commit's sentences |

### Sentence Selection (Like Git Add)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   CONVERSATION                          COMMIT (staging)                │
│   ─────────────                         ────────────────                │
│                                                                         │
│   "The price is $5,000"          →  ✓  "Service fee is $5,000/month"  │
│   "We offer discounts"           →  ✓  "Volume discounts available"   │
│   "Let me check on that"         →  ✗  (not selected)                 │
│   "Thanks for asking"            →  ✗  (not selected)                 │
│                                                                         │
│   User curates which sentences represent the knowledge                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Leaf Layer (Application)

### What Leaves Contain

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             LEAF                                        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ id: "leaf_abc123"                                               │  │
│   │ commit_hash: "sha256:7f83b165..."  ← uses this commit           │  │
│   │ type: "deploy_agent" | "tweet" | "email" | ...                  │  │
│   │                                                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │ CONSTRAINTS (the rules)                                         │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │                                                                 │  │
│   │ REQUIRE:                                                        │  │
│   │ • "$5,000" (exact) - must use this exact string                │  │
│   │ • "money-back guarantee" (semantic) - concept must appear      │  │
│   │                                                                 │  │
│   │ EXCLUDE:                                                        │  │
│   │ • "CompetitorX" (exact) - never mention                        │  │
│   │ • "unlimited" (semantic) - avoid this concept                  │  │
│   │                                                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │ OUTPUT (generated)                                              │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │                                                                 │  │
│   │ "Our service costs $5,000/month with a 30-day money-back..."   │  │
│   │                                                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │ ASSERTIONS (validation results)                                 │  │
│   │ ════════════════════════════════════════════════════════════   │  │
│   │                                                                 │  │
│   │ ✓ PASS: "$5,000" found exactly                                 │  │
│   │ ✓ PASS: "money-back guarantee" concept present                 │  │
│   │ ✗ FAIL: Said "5 thousand" instead of "$5,000" in paragraph 2   │  │
│   │                                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Same Commit, Different Leaves

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                         COMMIT (knowledge)                              │
│                    "Service fee is $5,000/month"                        │
│                                │                                        │
│                ┌───────────────┼───────────────┐                        │
│                │               │               │                        │
│                ▼               ▼               ▼                        │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐          │
│   │   LEAF: Tweet   │ │  LEAF: Email    │ │  LEAF: Agent    │          │
│   │                 │ │                 │ │                 │          │
│   │ Constraints:    │ │ Constraints:    │ │ Constraints:    │          │
│   │ • Casual tone   │ │ • Formal tone   │ │ • Exact figures │          │
│   │ • < 280 chars   │ │ • Include CTA   │ │ • No competitors│          │
│   │                 │ │                 │ │                 │          │
│   │ Output:         │ │ Output:         │ │ Output:         │          │
│   │ "Starting at    │ │ "Dear Customer, │ │ "The price is   │          │
│   │  $5k/mo! ..."   │ │  Our service..."│ │  $5,000/month." │          │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘          │
│                                                                         │
│   Same knowledge, different application rules                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Constraint Types

| Type | Match Mode | Example | Use Case |
|------|------------|---------|----------|
| **REQUIRE** | exact | "$5,000" | Must use exact string |
| **REQUIRE** | semantic | "money-back guarantee" | Concept must appear |
| **EXCLUDE** | exact | "CompetitorX" | Never use this string |
| **EXCLUDE** | semantic | "unlimited" | Avoid this concept |

---

## Data Flow

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   1. CONVERSATIONS                                                      │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ User: "What's the price?"                                    │  │
│      │ Assistant: "The service fee is $5,000 per month..."          │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ extract & curate                         │
│                              ▼                                          │
│   2. COMMIT (semantic layer)                                            │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ Sentences:                                                   │  │
│      │ • "Service fee is $5,000 per month"                         │  │
│      │ • "30-day money-back guarantee"                             │  │
│      │                                                              │  │
│      │ hash: sha256:7f83b165...                                    │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ feeds knowledge                          │
│                              ▼                                          │
│   3. LEAF (application layer)                                           │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ Constraints:                                                 │  │
│      │ • REQUIRE "$5,000" (exact)                                  │  │
│      │                                                              │  │
│      │ LLM Prompt:                                                  │  │
│      │ "Using this knowledge: [sentences], generate a tweet..."    │  │
│      │                                                              │  │
│      │ Output: "Starting at $5,000/mo with money-back guarantee!"  │  │
│      │                                                              │  │
│      │ Validation:                                                  │  │
│      │ ✓ "$5,000" found → PASS                                     │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              │ assertions feed back                     │
│                              ▼                                          │
│   4. FEEDBACK (pinned for next cycle)                                   │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ 📌 Leaf pinned with assertion:                               │  │
│      │ "Must use exact figures, not word equivalents"              │  │
│      │                                                              │  │
│      │ → Informs next conversation                                 │  │
│      │ → Can inform next commit (if lesson becomes sentence)       │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fixing Constraints Scenario

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   SCENARIO: Agent keeps saying "five thousand" instead of "$5,000"      │
│                                                                         │
│   OPTION A: Fix in Leaf (constraint adjustment)                         │
│   ──────────────────────────────────────────────────────────────────   │
│   Leaf constraints:                                                     │
│   • REQUIRE "$5,000" (exact)        ← add/tighten this                 │
│   • EXCLUDE "five thousand" (exact) ← add this                         │
│                                                                         │
│   Same commit, stricter leaf = fixed output                            │
│                                                                         │
│   ──────────────────────────────────────────────────────────────────   │
│                                                                         │
│   OPTION B: Fix in Commit (add explicit sentence)                       │
│   ──────────────────────────────────────────────────────────────────   │
│   New commit includes sentence:                                         │
│   • "Always write prices as $5,000, not 'five thousand'"               │
│                                                                         │
│   Knowledge now explicitly states the rule                             │
│                                                                         │
│   ──────────────────────────────────────────────────────────────────   │
│                                                                         │
│   Both options work! Choose based on:                                   │
│   • Constraint = enforcement rule (leaf)                               │
│   • Sentence = explicit knowledge (commit)                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Memory & Context

### What Each Layer Uses for Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   CONVERSATION CONTEXT (for LLM chat)                                   │
│   ═══════════════════════════════════                                   │
│                                                                         │
│   Base: Previous commit SENTENCES                                       │
│   ├── "Service fee is $5,000 per month"                                │
│   ├── "30-day money-back guarantee"                                    │
│   └── (inherited knowledge)                                            │
│                                                                         │
│   Plus: Pinned items                                                    │
│   ├── 📌 Conversation turns (new discussions)                          │
│   └── 📌 Leaf outputs + lessons (feedback)                             │
│                                                                         │
│   ❌ NO constraints (not relevant for conversation)                     │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   LEAF CONTEXT (for output generation)                                  │
│   ════════════════════════════════════                                  │
│                                                                         │
│   Knowledge: Commit SENTENCES                                           │
│   ├── "Service fee is $5,000 per month"                                │
│   └── (what to use for generation)                                     │
│                                                                         │
│   Rules: Leaf CONSTRAINTS                                               │
│   ├── REQUIRE "$5,000" (exact)                                         │
│   └── (how to validate output)                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context Building

```typescript
// For CONVERSATION (chat with LLM)
function buildConversationContext(conversationId: string): string {
  const project = getProject(conversationId);
  const currentCommit = getCurrentCommit(project);

  let context = "";

  // Base: sentences from current commit (inherited knowledge)
  context += "## Current Knowledge:\n";
  for (const sentence of currentCommit.sentences) {
    context += `• ${sentence.text}\n`;
  }

  // Plus: pinned conversations
  const pins = getConversationPins(conversationId);
  for (const pin of pins.conversations) {
    context += `\n## From "${pin.title}":\n`;
    context += formatTurns(pin.turns);
  }

  // Plus: pinned leaf outputs + lessons
  for (const pin of pins.leaves) {
    context += `\n## Previous output (${pin.type}):\n`;
    context += pin.output;
    if (pin.lessons.length > 0) {
      context += "\n### Lessons:\n";
      context += pin.lessons.map(l => `• ${l}`).join("\n");
    }
  }

  // NO constraints here - they're for leaf validation
  return context;
}

// For LEAF (output generation + validation)
function buildLeafContext(leafId: string): LeafContext {
  const leaf = getLeaf(leafId);
  const commit = getCommit(leaf.commitHash);

  return {
    // Knowledge for generation
    sentences: commit.sentences,

    // Rules for validation
    constraints: leaf.constraints,  // REQUIRE/EXCLUDE rules
  };
}
```

---

## Data Models

### Commit (Simplified)

```typescript
interface CommitV4 {
  // Identity
  hash: string;              // SHA-256 of canonical content
  parentHashes: string[];    // DAG for branching/merging
  branch: string;

  // Content: ONLY sentences
  sentences: Sentence[];

  // Metadata (not in hash)
  createdAt: string;
  author?: string;
  message?: string;

  // Lineage (not in hash)
  sourceRefs?: SourceRef[];
}

interface Sentence {
  id: string;
  text: string;              // The actual sentence
  confidence: number;        // Extraction confidence
  sourceRef?: {              // Where it came from
    conversationId: string;
    turnHash: string;
  };
}

// NO constraints in commit!
```

### Leaf (Owns Constraints)

```typescript
interface Leaf {
  id: string;
  commitHash: string;        // Uses this commit's sentences
  type: LeafType;            // 'deploy_agent' | 'tweet' | 'email' | ...

  // Constraints: validation rules for this leaf
  constraints: Constraint[];

  // Configuration
  config: LeafConfig;        // LLM settings, prompt template, etc.

  // Output
  output?: string;           // Generated content
  generatedAt?: string;

  // Validation
  assertions?: Assertion[];  // Pass/fail results

  // Metadata
  createdAt: string;
  createdBy?: string;
}

interface Constraint {
  id: string;
  type: 'REQUIRE' | 'EXCLUDE';
  matchMode: 'exact' | 'semantic';
  value: string;             // The string/concept to match
  description?: string;      // Human explanation
}

interface Assertion {
  id: string;
  constraintId: string;
  passed: boolean;
  details: string;           // What was found/not found
  lesson?: string;           // Human-readable takeaway
}
```

### Storage Schema

```sql
-- Commits: only sentences
CREATE TABLE commits_v4 (
  hash TEXT PRIMARY KEY,
  parent_hashes TEXT[],
  branch TEXT NOT NULL,

  -- Sentences stored as JSONB array
  sentences JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author TEXT,
  message TEXT,
  source_refs JSONB
);

-- Leaves: own the constraints
CREATE TABLE leaves (
  id TEXT PRIMARY KEY,
  commit_hash TEXT REFERENCES commits_v4(hash),
  type TEXT NOT NULL,

  -- Constraints for this leaf
  constraints JSONB NOT NULL DEFAULT '[]',

  -- Configuration
  config JSONB NOT NULL DEFAULT '{}',

  -- Output
  output TEXT,
  generated_at TIMESTAMPTZ,

  -- Validation results
  assertions JSONB,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_leaves_commit ON leaves(commit_hash);
CREATE INDEX idx_leaves_type ON leaves(type);
```

---

## Migration from Current Design

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| **Commit content** | Sentences + Constraints | Sentences only |
| **Constraint location** | In commit | In leaf |
| **Commit hash** | Includes constraints | Sentences only |
| **Leaf** | Just output | Output + Constraints + Validation |

### Migration Steps

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   1. Schema Migration                                                   │
│      ├── Create new commits_v4 table (sentences only)                  │
│      ├── Add constraints column to leaves table                        │
│      └── Migrate existing data                                         │
│                                                                         │
│   2. Core Logic Update                                                  │
│      ├── Update commit creation (remove constraints)                   │
│      ├── Update leaf creation (add constraints)                        │
│      └── Update hash calculation (sentences only)                      │
│                                                                         │
│   3. UI Update                                                          │
│      ├── Remove constraints from commit detail view                    │
│      ├── Add constraints editor to leaf page                           │
│      └── Update memory/context displays                                │
│                                                                         │
│   4. Memory/Context Update                                              │
│      ├── Conversation context: sentences only                          │
│      └── Leaf context: sentences + constraints                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Benefits

### Clean Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ✅ Commits are pure knowledge                                         │
│      • "What do we know?"                                              │
│      • Sentences only                                                  │
│      • Clean versioning                                                │
│                                                                         │
│   ✅ Leaves are pure application                                        │
│      • "How do we use it?"                                             │
│      • Constraints owned here                                          │
│      • Configurable per-output                                         │
│                                                                         │
│   ✅ Same knowledge, different rules                                    │
│      • One commit → many leaves                                        │
│      • Different constraints per leaf                                  │
│      • Flexible enforcement                                            │
│                                                                         │
│   ✅ Simpler mental model                                               │
│      • Commit = git commit (content)                                   │
│      • Leaf = build config (rules)                                     │
│      • Familiar patterns                                               │
│                                                                         │
│   ✅ Better conversation context                                        │
│      • LLM sees facts (sentences)                                      │
│      • LLM doesn't see validation rules (constraints)                  │
│      • Cleaner, more natural                                           │
│                                                                         │
│   ✅ Constraints can evolve independently                               │
│      • Tighten/loosen rules without new commit                         │
│      • Experiment with different strictness                            │
│      • A/B test constraint configurations                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   SEMANTIC VERSION CONTROL = Sentence extraction and confirm            │
│                                                                         │
│   CONSTRAINT GAME = Leaf configuration                                  │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   COMMIT                           LEAF                                 │
│   ├── Sentences                    ├── Constraints                      │
│   ├── Hash chain                   ├── LLM wrapper                      │
│   ├── Branch/merge                 ├── Output generation                │
│   └── "Knowledge"                  ├── Validation                       │
│                                    └── "Application"                    │
│                                                                         │
│   Design Rating: 9.5/10 - Elegant separation                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Design document created January 2025.*
