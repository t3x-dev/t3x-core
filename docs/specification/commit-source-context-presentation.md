# Commit Source Context Presentation

## Core Principle: Source as Anchor, Commit as Lens

**Users should never feel lost.**

The source (conversation) is the ground truth. A commit is not a transformation of the source—it's a **lens** that highlights what matters within the source. Users always see familiar text; they just see which parts were selected.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Source (always visible, always accessible)            │
│   ═══════════════════════════════════════               │
│                                                         │
│   "The system uses OAuth 2.0 for authentication.        │
│    Rate limiting is set to 100 requests/minute.         │
│    We'll deploy on Friday."                             │
│                                                         │
│                        ↓                                │
│                   [Selection]                           │
│                        ↓                                │
│                                                         │
│   Commit (same text, highlights = captured content)     │
│   ════════════════════════════════════════════════      │
│                                                         │
│   "The system uses [OAuth 2.0 for authentication].      │
│    Rate limiting is set to [100 requests/minute].       │
│    We'll deploy on Friday."                             │
│                                                         │
│   [ ] = green highlight (selected sentences)            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key Insight**: A commit feels like annotation, not extraction. Users are always grounded because they see text they recognize.

---

## Problem: Current Display Feels Foreign

When sentences are extracted and shown in isolation:

```
┌─────────────────────────────────────────┐
│ Commit: abc123                          │
├─────────────────────────────────────────┤
│ Sentences:                              │
│ • "OAuth 2.0 for authentication"        │
│ • "100 requests/minute"                 │
└─────────────────────────────────────────┘
```

User reaction: *"Where did this come from? Is this right? I'm confused."*

The extraction feels like magic. Users can't verify correctness at a glance.

---

## Solution: Show Source Text with Highlights

```
┌─────────────────────────────────────────┐
│ Commit: abc123                          │
├─────────────────────────────────────────┤
│ The system uses [OAuth 2.0 for          │
│ authentication]. Rate limiting is set   │
│ to [100 requests/minute]. We'll deploy  │
│ on Friday.                              │
└─────────────────────────────────────────┘
```

User reaction: *"I can see exactly what was selected. Instantly verifiable."*

The commit is just source text with selections marked. No magic, no confusion.

---

## Design Principles

### 1. Source is Always One Click Away

Every commit display should link back to full source:

```
┌─────────────────────────────────────────┐
│ Commit: abc123              [View Source →] │
├─────────────────────────────────────────┤
│ ...highlighted text...                  │
└─────────────────────────────────────────┘
```

If users have any doubt about what they see, they can immediately view the original.

### 2. Highlight = Captured

The visual language is simple:
- **Green/highlighted text** = included in commit (selected sentences)
- **Normal text** = context (not selected, but visible for reference)
- **No text transformation** = original words from source

### 3. Commits Simplify, Not Mystify

A commit makes the source **easier to scan**, not harder to understand:

| Source | Commit View |
|--------|-------------|
| 500-word conversation | Same 500 words, but 3 sentences highlighted |
| User must read everything | User's eye goes straight to green |
| "What was decided?" | "These 3 things were decided" |

### 4. Traceability is Instant

Every highlighted sentence maps 1:1 to a position in source:

```typescript
sentence: {
  id: "s1",
  text: "OAuth 2.0 for authentication",
  source: {
    turn_hash: "sha256:abc...",
    start_char: 16,
    end_char: 44
  }
}
```

Click any highlight → jump to exact position in conversation.

---

## Visual Examples

### Example 1: Single-Turn Commit

**Source conversation turn (assistant)**:
```
Based on our discussion, here are the key decisions:

1. Authentication will use OAuth 2.0 with PKCE flow for mobile
2. All API responses must be JSON with consistent error format
3. Rate limiting: 100 requests per minute per user

The timeline is tight, but achievable if we start next sprint.
```

**Commit display** (source with highlights):
```
┌─────────────────────────────────────────────────────────┐
│ Commit: abc123                              [View Source →] │
│ Branch: main · 3 sentences                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Based on our discussion, here are the key decisions:    │
│                                                         │
│ 1. [Authentication will use OAuth 2.0 with PKCE flow    │
│    for mobile]                                          │
│ 2. [All API responses must be JSON with consistent      │
│    error format]                                        │
│ 3. [Rate limiting: 100 requests per minute per user]    │
│                                                         │
│ The timeline is tight, but achievable if we start       │
│ next sprint.                                            │
│                                                         │
└─────────────────────────────────────────────────────────┘

Green background = selected sentences
```

**User experience**:
- Immediately sees what was captured (green)
- Sees surrounding context (not green)
- Can verify: "Yes, that's what we said"
- Can click "View Source" for full conversation

### Example 2: Multi-Turn Commit

**Commit from scattered turns**:
```
┌─────────────────────────────────────────────────────────┐
│ Commit: def456                              [View Source →] │
│ Branch: main · 2 sentences from 2 turns                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🤖 Assistant (Turn 3):                                  │
│ I recommend [OAuth 2.0 with PKCE for mobile]. It's      │
│ more secure than implicit flow for native apps.         │
│                                                         │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                                         │
│ 🤖 Assistant (Turn 7):                                  │
│ For rate limiting, [100 req/min per user with           │
│ exponential backoff] is industry standard.              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**User experience**:
- Sees which turns contributed to this commit
- Sees exact context around each selection
- Understands conversation flow that led to these decisions

### Example 3: Dense vs Sparse Selection

**Dense (most sentences selected)**:
```
┌─────────────────────────────────────────────────────────┐
│ [The system has three layers.] [The frontend uses       │
│ React.] [The backend is Node.js.] [Data is stored       │
│ in PostgreSQL.]                                         │
└─────────────────────────────────────────────────────────┘

→ Almost all green = comprehensive capture
```

**Sparse (few sentences selected)**:
```
┌─────────────────────────────────────────────────────────┐
│ The system has three layers. [The frontend uses         │
│ React.] The backend is Node.js. [Data is stored in      │
│ PostgreSQL.] We considered MongoDB but chose relational │
│ for ACID compliance.                                    │
└─────────────────────────────────────────────────────────┘

→ Green islands = selective capture, context visible
```

Both are instantly scannable. Users know exactly what's included and what's not.

---

## Compact View (Canvas Nodes)

For space-constrained canvas nodes:

```
┌─────────────────────────────────────────┐
│ Commit: abc123                     main │
├─────────────────────────────────────────┤
│ ...key decisions:                       │
│ 1. [Authentication will use OAuth 2.0   │
│    with PKCE flow...]                   │
│ 2. [All API responses must be JSON...]  │
│                                         │
│ +1 sentence · View full →               │
└─────────────────────────────────────────┘
```

- Shows first N highlights with surrounding context
- Smart truncation around highlights
- "View full" expands to full source view

---

## Diff Display

Diff operations happen at sentence level, but display in source context:

```
┌─ Commit A ────────────────────────┐  ┌─ Commit B ────────────────────────┐
│                                   │  │                                   │
│ Rate limiting is set to           │  │ Rate limiting is set to           │
│ [100 req/min] per user.           │  │ [200 req/min] per user.           │
│  ↑ red (removed/modified)         │  │  ↑ green (added/modified)         │
│                                   │  │                                   │
│ Data is stored in [PostgreSQL].   │  │ Added [Redis caching] for         │
│  ↑ red (removed)                  │  │ performance.                      │
│                                   │  │  ↑ green (added)                  │
└───────────────────────────────────┘  └───────────────────────────────────┘
```

**User experience**:
- Sees what changed (word-level diff within sentences)
- Sees surrounding context to understand why
- Can trace back to either commit's source

---

## Merge Conflict Display

When branches have conflicting modifications:

```
┌─ Conflict: Sentence s2 ─────────────────────────────────┐
│                                                         │
│ Branch A (from conversation with Alice):                │
│ "We discussed performance and decided                   │
│  [rate limiting should be 100/min] to be safe."         │
│                                                         │
│ Branch B (from conversation with Bob):                  │
│ "After load testing, [200/min is sustainable]           │
│  without performance degradation."                      │
│                                                         │
│ ┌─────────┐ ┌─────────┐ ┌───────────┐ ┌──────┐         │
│ │ Keep A  │ │ Keep B  │ │ Keep Both │ │ Edit │         │
│ └─────────┘ └─────────┘ └───────────┘ └──────┘         │
└─────────────────────────────────────────────────────────┘
```

**User experience**:
- Sees context that led to each decision
- Understands why branches diverged (different conversations)
- Makes informed choice about resolution

---

## Data Model

### Storage Layer (Unchanged)

Commits still store sentences as semantic payload:

```typescript
interface CommitV3 {
  commit_hash: string;
  sentences: Array<{
    id: string;
    text: string;
    source: {
      turn_hash: string;
      start_char: number;
      end_char: number;
    };
  }>;
  constraints: Array<{...}>;
}
```

### Presentation Layer (New)

When displaying, fetch source and build highlight map:

```typescript
interface CommitDisplayView {
  commit: CommitV3;

  // Grouped by source turn for rendering
  sourceContexts: Array<{
    turn_hash: string;
    turn_index: number;
    role: 'user' | 'assistant';
    content: string;  // Full turn text
    highlights: Array<{
      sentence_id: string;
      start: number;
      end: number;
    }>;
  }>;
}
```

### Rendering Logic

```typescript
function renderCommitWithContext(commit: CommitV3): CommitDisplayView {
  // 1. Collect unique turn hashes
  const turnHashes = unique(commit.sentences.map(s => s.source.turn_hash));

  // 2. Fetch turn contents
  const turns = await fetchTurns(turnHashes);

  // 3. Build highlight map for each turn
  const sourceContexts = turns.map(turn => ({
    ...turn,
    highlights: commit.sentences
      .filter(s => s.source.turn_hash === turn.hash)
      .map(s => ({
        sentence_id: s.id,
        start: s.source.start_char,
        end: s.source.end_char
      }))
  }));

  return { commit, sourceContexts };
}
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Source turn deleted | Show sentence text only, gray "Source unavailable" hint |
| Very long turn | Truncate with "...", but always show highlighted portion |
| Multiple turns in commit | Collapsible sections, click to expand |
| Overlapping highlights | Merge adjacent/overlapping ranges |
| No source info (legacy) | Fall back to sentence list view |

---

## Success Criteria

Users should be able to:

1. **See at a glance what a commit captured** - Green = selected, instant scan
2. **Verify correctness in 3 seconds** - "Yes, that's what we said"
3. **Never feel lost** - Source always one click away
4. **Understand diffs immediately** - See what changed in context
5. **Resolve conflicts confidently** - Understand why branches diverged

The system should feel like **annotating a document**, not **extracting to a database**.

---

## Implementation Phases

### Phase 1: Commit Display
- [ ] Update `CommitV3Content` component to show source context
- [ ] Add highlight rendering logic (green background for selected)
- [ ] Fetch turn content when displaying commit
- [ ] Add "View Source" link to full conversation

### Phase 2: Compact Canvas View
- [ ] Design truncation logic (show context around highlights)
- [ ] Implement "+N more" expansion feature
- [ ] Ensure canvas nodes remain scannable

### Phase 3: Diff with Context
- [ ] Update diff view to show source context
- [ ] Color-code changes (red = removed, green = added)
- [ ] Word-level diff within sentence highlights

### Phase 4: Merge Conflict UI
- [ ] Show source context for each branch version
- [ ] Display conversation origin for context
- [ ] Conflict resolution buttons

---

## Related Issues

- #152 - Phase 1: Commit Display with Source Context
- #153 - Phase 2: Compact Canvas View
- #154 - Phase 3: Diff Display with Context
- #155 - Phase 4: Merge Conflict UI
