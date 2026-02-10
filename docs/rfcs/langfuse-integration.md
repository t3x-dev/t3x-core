# RFC: Langfuse → T3X Integration

> Status: Draft
> Date: 2026-02-10
> Author: T3X Team
> Priority: Medium (strategic, but after core product stability)

**Prerequisite**: This RFC should be executed AFTER core product P0 bugs are fixed and the Semantic Diff experience is polished. Importing Langfuse users into a broken UI burns trust permanently. See [Competitive Analysis § 6.5](../competitive-analysis.md#65-execution-priority-4-6-week-sprint) for full priority rationale.

---

## 1. Motivation

Langfuse (56K GitHub stars, YC W23) is the dominant open-source LLM observability platform. Rather than competing, T3X should position as the **governance layer that sits on top of observation data**.

The core message:

> "You observe with Langfuse. You govern with T3X."

This integration turns Langfuse's user base into T3X's distribution channel. Every Langfuse user who wants to go from "I see what happened" to "I control what should happen" becomes a T3X user.

---

## 2. User Story

```
As a prompt engineer using Langfuse,
I want to import my prompt version history into T3X,
so that I can see semantic diffs between versions,
merge changes from teammates,
and set constraints that prevent regressions.
```

### Workflow

```
┌─────────────┐     Import      ┌─────────────┐     Govern      ┌─────────────┐
│  Langfuse   │ ───────────────► │    T3X      │ ───────────────► │  Production │
│             │  traces/prompts  │             │  validated       │             │
│ - Traces    │                  │ - Commits   │  prompt          │ - Langfuse  │
│ - Prompts   │                  │ - Diffs     │                  │   tracks    │
│ - Versions  │                  │ - Leaves    │                  │   results   │
│ - Evals     │                  │ - Merges    │                  │             │
└─────────────┘                  └─────────────┘                  └─────────────┘
         ▲                                                              │
         └──────────────────── feedback loop ───────────────────────────┘
```

---

## 3. MVP Scope (Phase 1)

**Goal**: Import Langfuse prompt versions → generate T3X commits → show semantic diff.

### 3.1 Import: Langfuse Prompt → T3X Commit

**Input**: Langfuse prompt export (JSON)

Langfuse prompt data model:
```json
{
  "name": "my-prompt",
  "version": 3,
  "prompt": "You are a helpful assistant that...",
  "config": { "model": "gpt-4", "temperature": 0.7 },
  "labels": ["production"],
  "created_at": "2026-01-15T10:00:00Z"
}
```

**Mapping to T3X**:

| Langfuse Field | T3X Field | Notes |
|----------------|-----------|-------|
| `name` | `project_id` | One Langfuse prompt name → one T3X project |
| `version` | Commit sequence | Each version becomes a commit; version order = parent chain |
| `prompt` (text) | `content.sentences[]` | Run through T3X Ring Extraction to get structured sentences |
| `config` | Commit metadata | Stored as second-class fields (not in hash) |
| `labels` | Branch names | `"production"` label → `main` branch; `"staging"` → `staging` branch |
| `created_at` | `committed_at` | Preserve original timestamps |

**Algorithm**:
```
1. Fetch all versions of a Langfuse prompt (GET /api/public/v2/prompts/{name})
2. Sort by version number (ascending)
3. For each version:
   a. Extract sentences via Ring Extraction
   b. Create T3X commit with parent = previous version's commit hash
   c. If version has "production" label, point `main` branch head here
4. Return: project_id, commit hashes, branch state
```

### 3.2 Semantic Diff Display

Once imported, T3X's existing diff engine handles the rest:

- **Two-way diff**: Compare any two prompt versions at the sentence/word level
- **Visual output**: Word-level highlights (added/removed/changed) in the WebUI
- **Shareable link**: `/project/{id}/diff/{hash1}..{hash2}` (requires share links feature)

### 3.3 Constraint Binding (Leaf)

After import, users can create Leaves with constraints:

```json
{
  "type": "deploy_agent",
  "commit_hash": "<latest imported commit>",
  "constraints": [
    { "type": "require", "match_mode": "exact", "value": "You must cite sources" },
    { "type": "exclude", "match_mode": "semantic", "value": "financial advice" }
  ]
}
```

T3X validates every future output against these constraints — something Langfuse cannot do.

---

## 4. API Design

### 4.1 New Endpoints

```
POST /api/v1/import/langfuse
  Body: {
    "langfuse_host": "https://cloud.langfuse.com",
    "public_key": "pk-...",
    "secret_key": "sk-...",
    "prompt_name": "my-prompt",
    "target_project_id": "proj_..." (optional, creates new if omitted)
  }
  Response: {
    "success": true,
    "data": {
      "project_id": "proj_...",
      "commits_created": 5,
      "branches": ["main", "staging"],
      "head_commit": "sha256:..."
    }
  }

GET /api/v1/import/langfuse/preview
  Query: same auth params + prompt_name
  Response: {
    "success": true,
    "data": {
      "prompt_name": "my-prompt",
      "versions_found": 5,
      "labels": ["production", "staging"],
      "preview": [
        { "version": 1, "sentences_extracted": 8, "created_at": "..." },
        { "version": 2, "sentences_extracted": 9, "created_at": "..." }
      ]
    }
  }
```

### 4.2 WebUI Flow

```
Import Page (/import/langfuse)
  ├── Step 1: Enter Langfuse credentials + prompt name
  ├── Step 2: Preview (shows version count, sentence extraction preview)
  ├── Step 3: Confirm → creates project + commits
  └── Step 4: Redirect to canvas → user sees full version DAG with diff available
```

---

## 5. Data Model Mapping

```
Langfuse                          T3X
────────                          ───
Prompt (name)          →          Project
Prompt Version (1,2,3) →          CommitV4 (DAG with hash chain)
Prompt Text            →          CommitV4.content.sentences[]
Labels (prod/staging)  →          Branches
Config (model, temp)   →          Commit metadata (second-class)
Trace                  →          Conversation (future: trace → turns)
Eval Score             →          Leaf assertion (future mapping)
```

---

## 6. Implementation Phases

### Phase 1: Import + Diff (2-3 weeks)

| Task | Scope | Files |
|------|-------|-------|
| Langfuse API client | Fetch prompts + versions | `packages/api-client/src/langfuse.ts` |
| Import route | POST /api/v1/import/langfuse | `apps/api/src/routes/import.ts` |
| Import logic | Version → commit conversion | `apps/api/src/services/langfuse-import.ts` |
| WebUI import page | Credential form + preview + confirm | `apps/web/src/app/import/langfuse/page.tsx` |
| Tests | Import flow E2E | `apps/api/src/__tests__/langfuse-import.test.ts` |

### Phase 2: Trace Import (4-6 weeks)

| Task | Scope |
|------|-------|
| Langfuse trace → T3X conversation | Map trace spans to turns |
| Observation → turn mapping | LLM call observations become assistant turns |
| Eval score → assertion mapping | Langfuse scores become Leaf assertions |

### Phase 3: Bidirectional Sync (future)

| Task | Scope |
|------|-------|
| T3X commit → Langfuse prompt push | Export governed prompts back to Langfuse |
| Webhook listener | React to Langfuse prompt changes in real-time |
| Continuous governance | Auto-validate new Langfuse versions against T3X constraints |

---

## 7. Strategic Value

| Metric | Impact |
|--------|--------|
| **Distribution** | Access Langfuse's 56K-star user base. Every import is a new T3X user. |
| **Positioning** | "We don't replace Langfuse, we extend it" eliminates competitive framing |
| **Stickiness** | Once constraints are set in T3X, users can't easily leave (their governance rules live here) |
| **Demo power** | "Import your Langfuse prompts → see semantic diff in 30 seconds" is a killer demo |

---

## 8. Open Questions

1. **Auth storage**: Where do we store Langfuse API keys? (encrypted in DB? environment variable? per-import only?)
2. **Sync frequency**: One-time import vs. continuous sync? (Phase 1 = one-time; Phase 3 = continuous)
3. **Multi-prompt projects**: Should one Langfuse prompt = one T3X project, or should users import multiple prompts into one project?
4. **Rate limits**: Langfuse API rate limits for self-hosted vs. cloud instances?
