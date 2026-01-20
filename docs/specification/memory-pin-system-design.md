# T3X Memory & PIN System Design

> PIN = Source Selection + LLM Memory (One mechanism, dual purpose)

**Status**: Approved for Implementation
**Last Updated**: 2025-01-20
**Related**: [Semantic Layer Architecture](./semantic-layer-architecture.md)

---

## Architecture Context

> See [semantic-layer-architecture.md](./semantic-layer-architecture.md) for full details.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   COMMIT (Semantic Layer)          LEAF (Application Layer)             │
│   ┌─────────────────────┐          ┌─────────────────────┐             │
│   │ • Sentences only    │          │ • Constraints       │             │
│   │ • Facts, knowledge  │    →     │ • REQUIRE/EXCLUDE   │             │
│   │ • Hash chain        │  feeds   │ • Validation rules  │             │
│   │ • NO constraints    │          │ • Output checking   │             │
│   └─────────────────────┘          └─────────────────────┘             │
│                                                                         │
│   "What do we know?"               "How do we use it?"                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Overview](#overview)
2. [Mental Model](#mental-model)
3. [UnitNode Structure](#unitnode-structure)
4. [PIN Mechanism](#pin-mechanism)
5. [Commit Detail View](#commit-detail-view)
6. [Conversation Context](#conversation-context) ← **NEW**
7. [LLM Memory](#llm-memory)
8. [Data Model](#data-model)
9. [User Flows](#user-flows)
10. [Implementation Notes](#implementation-notes)

---

## Overview

### Core Principle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   PIN = Source for next commit + Context for conversation LLM           │
│                                                                         │
│   One mechanism, two consumers:                                         │
│   • COMMIT: Selects which pins become commit sources                    │
│   • CONVERSATION: Selects which pins become LLM background              │
│                                                                         │
│   Simple and powerful.                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           T3X COMPLETE FLOW                             │
│                                                                         │
│   Conversations (many)  →  PIN some  →  Commit (curated)  →  Leaves    │
│        ↑                                                        ↓       │
│        └──────────────── feedback loop ◄──────── assertions ────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Goals

| Goal | Solution |
|------|----------|
| Simple selection | PIN is the only mechanism |
| Familiar pattern | Like Claude sidebar + git staging |
| Scalable | Many conversations/leaves, few pinned per commit |
| Clean UI | UnitNode is hub, details in separate pages |
| Dual-use | PIN serves both commit source and conversation context |
| Per-conv customization | Each conversation can select which pins to use |
| Feedback loop | Assertions can be pinned for next commit |

---

## Mental Model

### Familiar Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   T3X Design              Familiar Pattern                              │
│   ══════════              ════════════════                              │
│                                                                         │
│   Conversations section   →   Claude app sidebar                        │
│   PIN for commit          →   git add (staging)                         │
│   Commit = sentences      →   git commit (immutable content)            │
│   Leaves = outputs        →   Build artifacts (with config/constraints) │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Git Analogy

```
git workflow:
├── Modified files (many)           ← Conversations, leaves, assertions
├── git add (select some)           ← PIN
├── Staging area                    ← Pinned items
└── git commit                      ← Create immutable commit

T3X workflow:
├── 5 conversations available       ← Materials
├── PIN 2 conversations             ← Selection
├── Pinned sources visible          ← What goes into commit
└── Commit                          ← Creates immutable UnitNode
```

---

## UnitNode Structure

### Three-Section Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           UNITNODE                                      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ CONVERSATIONS                                          [+ New]  │  │
│   │ ─────────────────────────────────────────────────────────────── │  │
│   │ 💬 conv#12 "Pricing"                              → click: page │  │
│   │ 💬 conv#34 "Enterprise"                           → click: page │  │
│   │ 💬 conv#56 "Support"                              → click: page │  │
│   │                                                                 │  │
│   │ (All linked conversations, like Claude app sidebar)            │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ COMMIT                                              → click: ▼  │  │
│   │ ─────────────────────────────────────────────────────────────── │  │
│   │ sha256:7f83... │ main │ 3 sentences │ 2 📌 sources             │  │
│   │                                                                 │  │
│   │ (Click to see pinned sources in commit detail)                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ LEAVES                                                 [+ New]  │  │
│   │ ─────────────────────────────────────────────────────────────── │  │
│   │ 🐦 Tweet "Starting at $5,000..."                  → click: page │  │
│   │ 🚀 Deploy Agent (3/5 passed)                      → click: page │  │
│   │                                                                 │  │
│   │ (All generated leaves, clickable to leaf page)                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Section Purposes

| Section | Shows | Clickable To | Editable |
|---------|-------|--------------|----------|
| **Conversations** | All linked conversations | Conversation page | Can add new |
| **Commit** | Summary + pin count | Commit detail (pinned sources) | If staging |
| **Leaves** | All generated outputs | Leaf page | Can add new |

### Compact vs Expanded View

```
┌─────────────────────────┐         ┌─────────────────────────────────────┐
│ UNITNODE (compact)      │         │ COMMIT DETAIL (expanded)            │
│                         │         │                                     │
│ Conversations: 3        │         │ Pinned Sources:                     │
│ Commit: sha256:7f (2📌) │── ► ───│ ├─ 📌 conv#12 "Pricing"             │
│ Leaves: 2               │  click  │ ├─ 📌 leaf#34 "Deploy"              │
│                         │         │ │   └─ [✓] "use exact figures"     │
└─────────────────────────┘         │ │   └─ [✗] "response time"         │
                                    │ └─ (frozen after commit)           │
                                    │                                     │
                                    │ Sentences: 3 (knowledge)            │
                                    │ ❌ No constraints (belong to leaf)  │
                                    └─────────────────────────────────────┘
```

---

## PIN Mechanism

### PIN Granularity

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PIN GRANULARITY                                │
│                                                                         │
│   Conversation  →  PIN whole conversation (not individual turns)        │
│   Leaf          →  PIN whole leaf                                       │
│   Assertion     →  Include/Exclude within leaf (not separate pin)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Where PIN Happens

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   CONVERSATION PAGE                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ Conversation: "Pricing Discussion"                              │  │
│   │                                                        [📌 Pin] │  │
│   │                                                                 │  │
│   │ Turn 1: User: "What is the price?"                             │  │
│   │ Turn 2: Assistant: "The service fee is $5,000..."              │  │
│   │ Turn 3: ...                                                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   LEAF PAGE                                                             │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ Leaf: Deploy Agent                                              │  │
│   │                                                        [📌 Pin] │  │
│   │                                                                 │  │
│   │ Output: "Our service costs $5,000/month..."                    │  │
│   │                                                                 │  │
│   │ Assertions (include/exclude for this leaf):                    │  │
│   │   [✓] "Pricing mentioned correctly"              PASS          │  │
│   │   [✓] "Must use exact figures"                   FAIL → lesson │  │
│   │   [✗] "Response time under 2s"                   PASS          │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### PIN Actions Summary

| Item | PIN Action | What Gets Pinned |
|------|------------|------------------|
| **Conversation** | [📌] on conversation page | Whole conversation (all turns) |
| **Leaf** | [📌] on leaf page | Whole leaf (output + config) |
| **Assertion** | [✓/✗] within pinned leaf | Include/exclude in leaf's context |

---

## Commit Detail View

### Staging State (Editable)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMIT DETAIL (Staging)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Status: Draft                                          [Commit →]    │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   PINNED SOURCES (editable)                                             │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   📌 Conversations:                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ ✓ conv#12 "Pricing Discussion"                        [unpin]  │  │
│   │ ✓ conv#34 "Enterprise Terms"                          [unpin]  │  │
│   │                                                                 │  │
│   │ Available (not pinned):                                        │  │
│   │ ○ conv#56 "Support Questions"                         [pin]    │  │
│   │ ○ conv#78 "Follow-up"                                 [pin]    │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   📌 Leaves (for lessons/feedback):                                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ ✓ leaf#34 "Deploy Agent"                              [unpin]  │  │
│   │   Assertions (lessons to include):                             │  │
│   │   [✓] "Must use exact figures"            ← lesson included    │  │
│   │   [✗] "Response time under 2s"            ← not relevant       │  │
│   │                                                                 │  │
│   │ Available (not pinned):                                        │  │
│   │ ○ leaf#12 "Tweet"                                     [pin]    │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   CURATED SENTENCES (from pinned sources)                              │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   Sentences: 3 (knowledge to commit)                                    │
│   • "Service fee is $5,000 per month"                                  │
│   • "30-day money-back guarantee"                                      │
│   • "Always use exact figures like $5,000"  ← from leaf lesson         │
│                                                                         │
│   ❌ No constraints here (configure in leaf when generating output)    │
│                                                                         │
│                                                    [Curate] [Commit]   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Committed State (Frozen)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     COMMIT DETAIL (Committed)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Status: Committed                           sha256:7f83b165...       │
│   Branch: main                                                          │
│   Author: Alice                               2025-01-18 10:30         │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   PINNED SOURCES (frozen lineage)                                       │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   📌 conv#12 "Pricing Discussion"                          (frozen)    │
│   📌 conv#34 "Enterprise Terms"                            (frozen)    │
│   📌 leaf#34 "Deploy Agent"                                (frozen)    │
│      └─ lesson: "Must use exact figures"                               │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   COMMITTED SENTENCES (knowledge)                                       │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   • "Service fee is $5,000 per month"                                  │
│   • "30-day money-back guarantee"                                      │
│   • "Always use exact figures like $5,000"                             │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────────│
│   ℹ️  Constraints are configured per-leaf, not stored in commit.       │
│       Create a leaf to define REQUIRE/EXCLUDE validation rules.        │
│   ─────────────────────────────────────────────────────────────────────│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Conversation Context

> **Key Insight**: Just as commits have "sources" (pinned items), conversations have "context" (background for LLM). Same PIN mechanism, parallel application.

### Two Parallel Systems

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PIN SERVES TWO SYSTEMS                              │
│                                                                         │
│   ┌─────────────────────────┐         ┌─────────────────────────────┐  │
│   │       COMMIT            │         │       CONVERSATION          │  │
│   │   (Sources section)     │         │    (Context section)        │  │
│   │                         │         │                             │  │
│   │   "What goes INTO       │         │   "What LLM knows           │  │
│   │    the next commit"     │         │    when responding"         │  │
│   │                         │         │                             │  │
│   │   📌 Pinned items →     │         │   📌 Pinned items →         │  │
│   │   Selected as sources   │         │   Fed as background         │  │
│   └─────────────────────────┘         └─────────────────────────────┘  │
│                                                                         │
│   Same PIN pool, different consumers                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Conversation Page with Context Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CONVERSATION PAGE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   "Enterprise Pricing Discussion"                           [📌 Pin]   │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────────┐│
│   │                                                                   ││
│   │ ┌───────────────────┐   ┌───────────────────────────────────────┐││
│   │ │   CONTEXT (◀)     │   │   CONVERSATION                        │││
│   │ │                   │   │                                       │││
│   │ │ Background for    │   │   User: What's the enterprise        │││
│   │ │ this conversation │   │         pricing?                      │││
│   │ │                   │   │                                       │││
│   │ │ ─────────────────│   │   Assistant: Based on our standard    │││
│   │ │                   │   │   pricing of $5,000/month, enter...  │││
│   │ │ 📌 conv#12        │   │                                       │││
│   │ │    "Pricing"      │   │   User: Any volume discounts?        │││
│   │ │                   │   │                                       │││
│   │ │ 📌 leaf#34        │   │   Assistant: Yes, for 10+ seats...   │││
│   │ │    "Deploy" (+1)  │   │                                       │││
│   │ │                   │   │                                       │││
│   │ │ ─────────────────│   │   ┌───────────────────────────────┐   │││
│   │ │                   │   │   │ Ask a question...         ⏎ │   │││
│   │ │ [Edit context]    │   │   └───────────────────────────────┘   │││
│   │ └───────────────────┘   └───────────────────────────────────────┘││
│   │                                                                   ││
│   └───────────────────────────────────────────────────────────────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context vs Sources Comparison

| Aspect | Commit Sources | Conversation Context |
|--------|----------------|----------------------|
| **Purpose** | What builds the commit | What LLM knows as background |
| **Location** | Commit detail view | Conversation page sidebar |
| **PIN pool** | Project-level pins | Project-level pins |
| **Customizable** | Per-commit selection | Per-conversation selection |
| **Default** | All pinned items | All pinned items |
| **Override** | Select subset for commit | Select subset for conversation |

### Context Selection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   1. Project has pinned items:                                          │
│      📌 conv#12 "Pricing"                                               │
│      📌 conv#34 "Enterprise Terms"                                      │
│      📌 leaf#56 "Deploy Agent" (+1 assertion)                          │
│                                                                         │
│   2. New conversation starts:                                           │
│      → Default: ALL pins become context                                 │
│      → LLM sees: Pricing turns + Terms turns + Deploy output + lesson  │
│                                                                         │
│   3. User clicks [Edit context]:                                        │
│      → Can DESELECT pins for THIS conversation                         │
│      → "I don't need Terms context for this chat"                      │
│                                                                         │
│   4. Customized context:                                                │
│      ✓ conv#12 "Pricing"         ← included                            │
│      ✗ conv#34 "Enterprise"      ← excluded for this conv              │
│      ✓ leaf#56 "Deploy"          ← included                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Edit Context Dialog

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     EDIT CONTEXT                                  [×]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Select background context for this conversation:                      │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   FROM PINNED CONVERSATIONS                                             │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   [✓] conv#12 "Pricing Discussion"                    12 turns         │
│       Last: "Service fee is $5,000 per month..."                       │
│                                                                         │
│   [ ] conv#34 "Enterprise Terms"                      8 turns          │
│       Last: "Multi-year contracts available..."                        │
│                                                                         │
│   ═══════════════════════════════════════════════════════════════════  │
│   FROM PINNED LEAVES                                                    │
│   ═══════════════════════════════════════════════════════════════════  │
│                                                                         │
│   [✓] leaf#56 "Deploy Agent"                                           │
│       Output: "Our service costs $5,000/month..."                      │
│       [✓] Assertion: "Must use exact figures"                          │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────────│
│                                                                         │
│   Context preview:                                                      │
│   • 12 turns from 1 conversation                                       │
│   • 1 leaf output with 1 lesson                                        │
│   • ~800 tokens estimated                                              │
│                                                                         │
│                                         [Reset to All] [Save Context]  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Inheritance Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CONTEXT INHERITANCE                                │
│                                                                         │
│                     PROJECT LEVEL                                       │
│                     ─────────────                                       │
│                     📌 Pinned items                                     │
│                     (master list)                                       │
│                            │                                            │
│              ┌─────────────┴─────────────┐                              │
│              │                           │                              │
│              ▼                           ▼                              │
│   ┌─────────────────────┐     ┌─────────────────────┐                  │
│   │   CONVERSATION A    │     │   CONVERSATION B    │                  │
│   │   (custom context)  │     │   (default context) │                  │
│   │                     │     │                     │                  │
│   │   ✓ conv#12         │     │   ✓ conv#12         │                  │
│   │   ✗ conv#34 (off)   │     │   ✓ conv#34         │                  │
│   │   ✓ leaf#56         │     │   ✓ leaf#56         │                  │
│   └─────────────────────┘     └─────────────────────┘                  │
│                                                                         │
│   Each conversation can customize which pins are in its context        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual Indicator in Conversation List

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CONVERSATIONS                                                 [+ New]  │
│ ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│ 💬 conv#78 "Enterprise Pricing"        [📌]  [3 context]  → click     │
│     └─ Custom context: 3 of 4 pins                                     │
│                                                                         │
│ 💬 conv#56 "Support Questions"         [📌]  [all]        → click     │
│     └─ Using all pinned context                                        │
│                                                                         │
│ 💬 conv#34 "Quick Follow-up"                 [none]       → click     │
│     └─ No context (fresh start)                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context Indicators

| Indicator | Meaning |
|-----------|---------|
| `[all]` | Using all project pins as context |
| `[3 context]` | Using 3 specific pins (customized) |
| `[none]` | No background context (fresh conversation) |
| `[📌]` | This conversation is pinned (can be source for others) |

---

## LLM Memory

### Memory = Previous Commit (base) + Pinned Items (additions)

> **Key Insight**: Like Git, you always work on top of the previous commit. The commit's sentences are the baseline, pinned items add to it.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   MEMORY CONSTRUCTION                                                   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  BASE: Previous Commit Sentences (automatic, like git HEAD)     │  │
│   │  • "Service fee is $5,000 per month"                           │  │
│   │  • "30-day money-back guarantee"                               │  │
│   │  • (inherited knowledge)                                        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              +                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  PLUS: Pinned Items (user-selected additions)                   │  │
│   │  📌 Conversation turns (new discussions)                        │  │
│   │  📌 Leaf outputs + lessons (feedback)                           │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                              =                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  FULL CONTEXT for conversation LLM                              │  │
│   │  ❌ No constraints (those are for leaf validation)              │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Two Consumers of Memory

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│           BASE: Previous Commit Sentences + Pinned Items                │
│                                                                         │
│                              │                                          │
│              ┌───────────────┴───────────────┐                          │
│              ▼                               ▼                          │
│                                                                         │
│   ┌─────────────────────┐         ┌─────────────────────┐              │
│   │  NEXT COMMIT        │         │  CONVERSATION LLM   │              │
│   │  (Sources section)  │         │  (Memory/Context)   │              │
│   │                     │         │                     │              │
│   │  Inherit sentences  │         │  LLM knows the      │              │
│   │  + add from pins    │         │  facts + new info   │              │
│   └─────────────────────┘         └─────────────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Memory Construction

```typescript
// Build LLM background for a specific conversation
function buildConversationContext(conversationId: string): string {
  const conv = getConversation(conversationId);
  const project = getProject(conv.projectId);
  const currentCommit = getCurrentCommit(project);  // HEAD commit
  const projectPins = getProjectPins(conv.projectId);
  const contextConfig = getConversationContext(conversationId);

  let context = "";

  // ═══════════════════════════════════════════════════════════════
  // BASE: Previous commit sentences (always included, like git HEAD)
  // ═══════════════════════════════════════════════════════════════
  if (currentCommit) {
    context += "## Current Knowledge (from commit):\n";
    for (const sentence of currentCommit.sentences) {
      context += `• ${sentence.text}\n`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PLUS: Pinned items (user-selected additions)
  // ═══════════════════════════════════════════════════════════════
  const activePins = contextConfig?.selectedPinIds
    ? projectPins.filter(p => contextConfig.selectedPinIds.includes(p.id))
    : projectPins;  // null = use all

  context += buildMemoryFromPins(activePins);

  // ❌ No constraints - those are for leaf validation, not conversation
  return context;
}

// Build memory from pinned items only
function buildMemoryFromPins(pins: Pin[]): string {
  let memory = "";

  // Pinned conversations
  const convPins = pins.filter(p => p.type === 'conversation');
  if (convPins.length > 0) {
    memory += "\n## Recent Discussions:\n";
    for (const pin of convPins) {
      const conv = getConversation(pin.refId);
      memory += `### ${conv.title}\n`;
      for (const turn of conv.turns) {
        memory += `${turn.role}: ${turn.content}\n`;
      }
    }
  }

  // Pinned leaves (output + selected assertions)
  const leafPins = pins.filter(p => p.type === 'leaf');
  if (leafPins.length > 0) {
    memory += "\n## Previous Outputs & Lessons:\n";
    for (const pin of leafPins) {
      const leaf = getLeaf(pin.refId);
      memory += `### ${leaf.type}: ${leaf.output?.substring(0, 100)}...\n`;

      // Include selected assertion lessons
      const selectedAssertions = pin.selectedAssertionIds || [];
      for (const assertion of leaf.assertions || []) {
        if (selectedAssertions.includes(assertion.id) && assertion.lesson) {
          memory += `• Lesson: ${assertion.lesson}\n`;
        }
      }
    }
  }

  return memory;
}
```

---

## Data Model

### Pin Table

```sql
CREATE TABLE pins (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),

  -- What's pinned
  type TEXT NOT NULL,  -- 'conversation' | 'leaf'
  ref_id TEXT NOT NULL,  -- conversation_id or leaf_id

  -- For leaf pins: which assertions to include
  selected_assertion_ids TEXT[],  -- null = include all

  -- Metadata
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pinned_by TEXT
);

CREATE INDEX idx_pins_project ON pins(project_id);
CREATE UNIQUE INDEX idx_pins_unique ON pins(project_id, type, ref_id);
```

### Conversation Context Table

```sql
CREATE TABLE conversation_contexts (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),

  -- Which pins to use for this conversation's LLM context
  -- null = use all project pins (default)
  selected_pin_ids TEXT[],

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Commit Source Refs (Frozen)

```sql
-- In commits_v4 table
source_refs JSONB  -- Frozen snapshot of pins used

-- Example:
-- [
--   { "type": "conversation", "id": "conv_12", "title": "Pricing" },
--   { "type": "leaf", "id": "leaf_34", "assertions": ["Must use exact figures"] }
-- ]
```

### TypeScript Types

```typescript
interface Pin {
  id: string;
  projectId: string;
  type: 'conversation' | 'leaf';
  refId: string;
  selectedAssertionIds?: string[];  // For leaf pins
  pinnedAt: string;
  pinnedBy?: string;
}

interface ConversationContext {
  conversationId: string;
  selectedPinIds: string[] | null;  // null = use all
  updatedAt: string;
}

interface CommitSourceRef {
  type: 'conversation' | 'leaf';
  id: string;
  title?: string;
  assertions?: string[];  // Lesson texts from selected assertions
}
```

---

## User Flows

### Flow 1: Normal Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   1. Have conversations about pricing, enterprise, support              │
│                                                                         │
│   2. PIN the important ones (Pricing, Enterprise)                       │
│      └─ These become available as sources AND context                   │
│                                                                         │
│   3. Start new conversation "Sales Strategy"                            │
│      └─ LLM automatically knows: commit sentences + pinned convs        │
│      └─ Can customize context if needed                                 │
│                                                                         │
│   4. When ready, create commit from pinned sources                      │
│      └─ Curate sentences from Pricing + Enterprise                      │
│      └─ Commit freezes the knowledge                                    │
│                                                                         │
│   5. Create leaf (Deploy Agent) with constraints                        │
│      └─ Uses commit sentences as knowledge                              │
│      └─ Adds REQUIRE/EXCLUDE rules                                      │
│      └─ Generates and validates output                                  │
│                                                                         │
│   6. PIN leaf for feedback loop                                         │
│      └─ Select relevant assertion lessons                               │
│      └─ These inform next conversations                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Leaf outputs "five thousand" instead of "$5,000"                      │
│        │                                                                │
│        ▼                                                                │
│   Assertion FAILS: "Must use exact figures"                             │
│        │                                                                │
│        ▼                                                                │
│   User PINs leaf with this assertion selected                           │
│        │                                                                │
│        ▼                                                                │
│   Next conversation sees: "Lesson: Must use exact figures"              │
│        │                                                                │
│        ▼                                                                │
│   User discusses: "We need to always use $5,000 format"                 │
│        │                                                                │
│        ▼                                                                │
│   Next commit includes: "Always write prices as $5,000"                 │
│        │                                                                │
│        ▼                                                                │
│   Knowledge improved through feedback!                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Context Customization

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   Project has 4 pinned items:                                           │
│   📌 conv#12 "Pricing"                                                  │
│   📌 conv#34 "Enterprise Terms"                                         │
│   📌 conv#56 "Support SLA"                                              │
│   📌 leaf#78 "Deploy Agent"                                             │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   Conversation A: "Quick pricing question"                              │
│   └─ User clicks [Edit context]                                         │
│   └─ Selects only: conv#12 "Pricing"                                    │
│   └─ LLM focuses on pricing, not distracted by SLA details             │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   Conversation B: "Full sales pitch review"                             │
│   └─ Uses default: ALL pins                                             │
│   └─ LLM has complete picture                                           │
│                                                                         │
│   ─────────────────────────────────────────────────────────────────    │
│                                                                         │
│   Conversation C: "Fresh brainstorm"                                    │
│   └─ User clicks [Edit context]                                         │
│   └─ Selects: NONE                                                      │
│   └─ LLM starts fresh, no prior context                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Notes

### UI Components Needed

| Component | Location | Purpose |
|-----------|----------|---------|
| `PinButton` | Conversation page, Leaf page | Toggle pin status |
| `PinnedSourcesList` | Commit detail view | Show/edit pinned sources |
| `ContextPanel` | Conversation page sidebar | Show/edit conversation context |
| `EditContextDialog` | Modal | Select pins for conversation |
| `AssertionSelector` | Within pinned leaf | Include/exclude assertions |
| `ContextIndicator` | Conversation list item | Show context status |

### API Endpoints

```
# Pins
POST   /v1/projects/:id/pins              # Create pin
DELETE /v1/projects/:id/pins/:pinId       # Remove pin
GET    /v1/projects/:id/pins              # List pins
PATCH  /v1/pins/:id/assertions            # Update selected assertions

# Conversation Context
GET    /v1/conversations/:id/context      # Get context config
PUT    /v1/conversations/:id/context      # Update context config

# Memory (for LLM)
GET    /v1/conversations/:id/memory       # Get built memory string
```

### State Management

```typescript
// canvasStore additions
interface CanvasState {
  // ... existing state

  // Pins
  pins: Pin[];
  setPins: (pins: Pin[]) => void;
  addPin: (pin: Pin) => void;
  removePin: (pinId: string) => void;
  updatePinAssertions: (pinId: string, assertionIds: string[]) => void;
}

// conversationStore additions
interface ConversationState {
  // ... existing state

  // Context
  contextConfig: ConversationContext | null;
  setContextConfig: (config: ConversationContext | null) => void;
}
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   PIN = One mechanism, dual purpose                                     │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                                                                 │  │
│   │   📌 PIN                                                        │  │
│   │     │                                                           │  │
│   │     ├──► COMMIT SOURCES                                         │  │
│   │     │    "What goes into the next commit"                       │  │
│   │     │                                                           │  │
│   │     └──► CONVERSATION CONTEXT                                   │  │
│   │          "What LLM knows as background"                         │  │
│   │                                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   Simple, familiar, powerful.                                           │
│                                                                         │
│   Design Rating: 9.5/10 - Elegant unification                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Design document created January 2025.*
