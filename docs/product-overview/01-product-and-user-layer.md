# T3X Product Overview: Product & User Layer

> This document describes T3X from the product and user perspective.
> Target audience: Anyone who needs to understand what T3X is, what it does,
> and what users can accomplish with it — without reading any source code.
>
> Last updated: 2026-02-09

---

## Table of Contents

1. [What is T3X?](#1-what-is-t3x)
2. [The Problem T3X Solves](#2-the-problem-t3x-solves)
3. [Core Concepts](#3-core-concepts)
4. [Product Architecture Overview](#4-product-architecture-overview)
5. [User-Facing Features](#5-user-facing-features)
6. [Page-by-Page Walkthrough](#6-page-by-page-walkthrough)
7. [Core User Workflows](#7-core-user-workflows)
8. [Export & Integration](#8-export--integration)
9. [Agent Evaluation System](#9-agent-evaluation-system)
10. [Visual & UX Design](#10-visual--ux-design)
11. [Current Limitations](#11-current-limitations)
12. [Glossary](#12-glossary)

---

## 1. What is T3X?

T3X is **"Git for Meaning"** — a semantic version control system designed for
AI conversations. Just as Git tracks changes to source code files over time,
T3X tracks changes to *knowledge* and *meaning* extracted from conversations
with AI assistants.

### One-Line Description

T3X captures, versions, branches, diffs, and merges the semantic knowledge
embedded in AI conversations, making that knowledge traceable, reproducible,
and deployable.

### The Analogy

| Git | T3X |
|-----|-----|
| Tracks files (source code) | Tracks sentences (semantic knowledge) |
| Commit = snapshot of file tree | Commit = snapshot of extracted knowledge |
| Diff = line-level file differences | Diff = word-level sentence differences |
| Merge = combine two branches | Merge = combine two knowledge snapshots |
| Branch = parallel development | Branch = parallel knowledge exploration |
| `.git/` directory | `.t3x/database/` directory |

### Key Principles

1. **Deterministic Core**: The core semantic extraction and versioning engine
   never depends on LLMs. Every algorithm produces the same output for the
   same input, every time. LLMs are optional plugins for enhancement.

2. **Evidence-Backed**: Every piece of extracted knowledge traces back to the
   exact source — which conversation, which turn, which character positions.
   Nothing is fabricated or guessed.

3. **Append-Only Integrity**: Like Git, the hash chain is immutable. Once a
   commit is created, modifying it would break the integrity chain. This
   provides a verifiable audit trail.

4. **Separation of Knowledge and Application**: Pure knowledge (what you
   know) is stored separately from how you use it (constraints, outputs,
   validations). This is the V4 architecture's core insight.

---

## 2. The Problem T3X Solves

### The Knowledge Fragmentation Problem

When teams use AI assistants (ChatGPT, Claude, etc.), valuable knowledge is
generated in conversations but immediately lost:

- **Scattered**: Knowledge lives in dozens of chat threads across multiple
  tools, with no central repository.
- **Untraceable**: When you make a decision based on AI advice, you can't
  trace back to which conversation informed that decision.
- **Unversioned**: Knowledge evolves — preferences change, context shifts —
  but there's no history of how knowledge changed over time.
- **Unverifiable**: You can't prove that a particular piece of knowledge
  came from a specific source, or verify its accuracy.
- **Not composable**: You can't take knowledge from two different
  conversations and merge them into a coherent whole.

### Who Needs T3X?

**Primary Users:**

1. **AI-First Teams**: Teams that use AI assistants extensively for research,
   planning, and decision-making. They need to capture and organize the
   knowledge generated in those conversations.

2. **AI Product Builders**: Developers building AI agents who need to manage
   the prompts, constraints, and evaluation criteria for their agents.

3. **Knowledge Workers**: Individuals who conduct extensive research through
   AI conversations and need to consolidate findings.

**Use Cases:**

- Consolidating insights from multiple AI research conversations
- Managing prompt engineering across multiple AI agent deployments
- Version-controlling the "memory" of AI assistants
- A/B testing different prompt strategies with statistical rigor
- Building auditable AI decision trails for compliance

---

## 3. Core Concepts

Understanding T3X requires familiarity with these concepts. They are
introduced progressively — you don't need to understand all of them to
start using the product.

### Level 1: Basic Concepts

#### Project

A project is the top-level container, equivalent to a Git repository. It
holds all conversations, commits, branches, leaves, and pins. Each project
has a unique ID prefixed with `proj_`.

Example: A project called "Customer Support Bot v2" might contain all the
conversations, knowledge snapshots, and deployment configurations for
building the next version of a support bot.

#### Conversation

A conversation is a recorded dialogue, typically between a human and an AI
assistant. It consists of an ordered sequence of turns. Each conversation
has a unique ID prefixed with `conv_`.

A project can have multiple conversations. For example, you might have
separate conversations for "Research phase", "Design discussion", and
"Implementation planning".

#### Turn

A turn is a single message within a conversation. Each turn has:

- **role**: `user`, `assistant`, `system`, or `tool`
- **content**: The text of the message
- **turn_hash**: A SHA-256 hash that uniquely identifies this turn
- **parent_turn_hash**: Links to the previous turn, forming a chain

Turns form a linked list via parent hashes, ensuring the conversation
order is cryptographically verifiable.

#### Commit

A commit is a snapshot of extracted knowledge at a point in time. In the
current V4 architecture, a commit contains **only sentences** — pure
knowledge with no application-layer concerns.

Each commit has:

- **hash**: SHA-256 content hash (computed from first-class fields only)
- **parents**: Array of parent commit hashes (supports DAG structure)
- **content.sentences**: The knowledge sentences
- **author**: Who created the commit (human or agent)
- **branch**: Which branch this commit belongs to

Commits are immutable. Once created, they cannot be modified without
changing their hash, which would break the chain.

#### Branch

A branch is a named pointer to a chain of commits, identical in concept to
a Git branch. Every project starts with a `main` branch.

- The `main` branch enforces linear history (single parent per commit)
- Feature branches allow parallel knowledge exploration
- Branches can be merged back together

#### Sentence

A sentence is the atomic unit of knowledge in T3X. Each sentence:

- Has a unique ID prefixed with `s_` (e.g., `s_abc123`)
- Contains a `text` field with the knowledge statement
- Has an optional `confidence` score (0-1)
- Has an optional `source_ref` pointing to the exact conversation turn
  and character positions where it originated
- May have an `inherited_from` field if it was inherited from a parent commit

Example:
```
{
  "id": "s_k8m2n4",
  "text": "The user prefers a maximum budget of $5000 for the trip.",
  "confidence": 0.95,
  "source_ref": {
    "conversation_id": "conv_abc123",
    "turn_hash": "sha256:def456...",
    "start_char": 42,
    "end_char": 98
  }
}
```

### Level 2: Application Concepts

#### Leaf

A leaf is an **application** of committed knowledge. While commits store
pure knowledge, leaves define how to *use* that knowledge for a specific
purpose.

Each leaf has:

- **id**: Unique ID prefixed with `leaf_` (e.g., `leaf_jkl012`)
- **commit_hash**: The commit this leaf draws knowledge from
- **type**: What kind of output to produce
- **constraints**: Validation rules for the output
- **config**: Generation configuration (model, temperature, etc.)
- **output**: The generated text (initially empty)
- **assertions**: Validation results

**Leaf Types:**

| Type | Purpose | Example |
|------|---------|---------|
| `deploy_agent` | AI agent system prompt | Customer support bot instructions |
| `tweet` | Twitter post (280 char) | Product announcement tweet |
| `weibo` | Weibo post (Chinese) | Marketing content for China |
| `wechat` | WeChat article | WeChat official account post |
| `email` | Email content | Customer follow-up email |
| `article` | Long-form article | Blog post or documentation |
| `slack` | Slack message | Team update message |
| `eval` | Evaluation criteria | Agent test case |

The key insight: **one commit, many leaves**. The same knowledge base can
produce different outputs for different channels, each with their own
constraints and validation rules.

#### Constraint

A constraint is a validation rule attached to a leaf. There are two types:

1. **Require constraint**: The output MUST contain this content.
   - `exact` match: The exact string must appear (case-insensitive)
   - `semantic` match: Semantically similar content must appear
   - Example: `REQUIRE exact "30-day money back guarantee"`

2. **Exclude constraint**: The output MUST NOT contain this content.
   - `exact` match: The exact string must not appear
   - `semantic` match: Semantically similar content must not appear
   - Example: `EXCLUDE exact "competitor" (reason: brand policy)`

Constraints can reference a source sentence from the commit, providing
traceability from constraint back to original knowledge.

#### Assertion

An assertion is the result of validating output against a constraint:

- **id**: Unique ID prefixed with `ast_`
- **constraint_id**: Which constraint was tested
- **passed**: Boolean — did the output satisfy the constraint?
- **details**: Human-readable explanation
- **lesson**: Optional feedback for improving future generations

Example:
```
{
  "id": "ast_ghi789",
  "constraint_id": "cst_def456",
  "passed": false,
  "details": "Required phrase '30-day guarantee' not found in output",
  "lesson": "Always include the guarantee clause prominently"
}
```

#### Pin

A pin marks an item (conversation or leaf) as "selected" for reuse.
Pins serve a dual purpose:

1. **Commit Sources**: Pinned items indicate what should be included
   when creating the next commit. They answer the question: "What
   informed this knowledge?"

2. **Conversation Context**: Pinned items are assembled into the
   background context sent to an LLM when chatting within a conversation.
   They answer: "What should the AI remember?"

Each pin has:

- **id**: Unique ID prefixed with `pin_`
- **type**: `conversation` or `leaf`
- **ref_id**: The ID of the pinned conversation or leaf
- **selected_assertion_ids**: For leaf pins, which assertion lessons
  to include in context

### Level 3: Advanced Concepts

#### Diff

A semantic diff compares two commits at the sentence level. Unlike Git's
line-level text diff, T3X's diff is **word-level and similarity-aware**.

The diff categorizes sentences into four groups:

1. **Identical**: Sentences that appear in both commits with the exact
   same text. These are automatically kept.
2. **Similar**: Sentences that share enough words (Jaccard similarity
   >= 0.3) to be considered related. These show word-level changes
   (added, removed, unchanged words).
3. **Only in Source**: Sentences that exist only in the source commit.
4. **Only in Target**: Sentences that exist only in the target commit.

#### Merge

A merge combines knowledge from two commits into a new commit. T3X uses
a **two-phase merge process**:

**Phase 1 — Prepare**: The system analyzes both commits and presents the
user with a merge preview showing:
- Identical sentences (auto-kept, no action needed)
- Similar pairs (user must choose: keep source, keep target, keep both,
  or provide custom edit)
- Only-in-source sentences (user decides: keep or discard)
- Only-in-target sentences (user decides: keep or discard)

**Phase 2 — Execute**: After the user resolves all decisions, the system
creates a new merge commit with two parents (like a Git merge commit).

#### Conversation Context

Each conversation can customize which pins contribute to its LLM context.
This is stored as a `ConversationContext` record:

- `selected_pin_ids: null` — Use all project pins (default)
- `selected_pin_ids: []` — Use no pins (fresh start)
- `selected_pin_ids: ["pin_a", "pin_b"]` — Use only these specific pins

This allows different conversations within the same project to have
different "memories" — one conversation might include all context, while
another focuses on a specific subset.

#### Semantic Extraction (Rings)

When a turn is created, T3X optionally runs semantic extraction organized
in three "rings":

- **Ring 1 (Keywords)**: Extracts keywords, named entities, time anchors,
  polarity (positive/negative sentiment), and topic identification
- **Ring 2 (Facets)**: Extracts intent seeds, time windows, soft
  preferences, and question slots
- **Ring 3 (Sentences)**: Segments the text into individual sentences
  with character positions

Ring extraction requires an NLP provider (Google Cloud NLP) and is
optional — turns can be created without ring data.

---

## 4. Product Architecture Overview

T3X is built as a **monorepo with separated frontend and backend**:

```
+------------------+     +------------------+     +-----------------+
|                  |     |                  |     |                 |
|   WebUI          |────>|   API Server     |────>|   Database      |
|   (Next.js)      |     |   (Hono)         |     |   (PostgreSQL)  |
|   Port 3000      |     |   Port 8000      |     |   Port 5432     |
|                  |     |                  |     |                 |
+------------------+     +------------------+     +-----------------+
                              |
                              |  (optional)
                              v
                         +------------------+     +-----------------+
                         |                  |     |                 |
                         |   Runner         |────>|   n8n           |
                         |   Port 8080      |     |   Port 5678     |
                         |                  |     |                 |
                         +------------------+     +-----------------+
```

**Key Points:**

- The WebUI and API are completely separate applications. The WebUI
  makes HTTP requests to the API server.
- For local development, the database uses PGLite (PostgreSQL compiled
  to WebAssembly), which runs in-process — no separate database server
  needed. Data is stored in `.t3x/database/`.
- For production, a standard PostgreSQL server is used.
- The Runner and n8n are optional components for agent evaluation.

---

## 5. User-Facing Features

### 5.1 Project Management

Users can:

- **Create projects** with a name and optional metadata
- **View all projects** as cards showing key statistics:
  - Number of conversations
  - Number of commits
  - Number of branches
  - Creation date and last update time
- **Delete projects** individually or in batch (multi-select mode)
- **Navigate to a project** to open its canvas workspace

### 5.2 Canvas Workspace

The canvas is the primary interface for working with a project. It
displays a **directed acyclic graph (DAG)** of nodes and edges using
the XYFlow (formerly ReactFlow) library.

**Node Types:**

| Node | Visual | Purpose |
|------|--------|---------|
| Conversation | Blue icon (MessageSquare) | Represents a conversation |
| Committed Commit | Green icon (GitCommit) | A committed knowledge snapshot |
| Pending Commit | Yellow/dashed border | A draft commit not yet finalized |
| Leaf | Leaf icon | An application output node |

**Canvas Actions:**

- **Create nodes**: Add conversations, commits, or leaves via the
  right-side palette panel
- **Connect nodes**: Draw edges between related nodes
- **Delete nodes**: Remove nodes with confirmation dialog
- **Auto-layout**: Automatically arrange nodes using the ELK.js
  layout engine (eliminates manual positioning)
- **Pan and zoom**: Navigate large graphs with mouse/trackpad
- **Minimap**: Small overview map for orientation in large graphs
- **Branch filtering**: Filter nodes by branch (main only, or all)
- **Path highlighting**: Highlight the main branch path or a specific
  branch path

**Canvas Controls (Bottom Bar):**

- Pan mode toggle
- Branch filter dropdown
- Path highlight toggle
- Minimap toggle
- Zoom slider
- Auto-layout button
- Memory context modal

**Node Interactions:**

Clicking a node opens a **detail modal** with:
- Full node information (sentences, metadata, source refs)
- Action buttons (view detail page, delete, create branch, etc.)
- For commits: sentence list with source context links
- For conversations: recent turns preview

**Node Locking:**

Committed commits and their upstream nodes are **immutable** — they
cannot be edited or deleted through the UI. Only pending commits and
leaf nodes can be modified.

### 5.3 Conversation Management

**Creating Conversations:**

- Conversations are created from the canvas workspace
- Each conversation is linked to a project
- Conversations can optionally reference a parent commit (like
  starting a new conversation from a knowledge checkpoint)

**Viewing Conversations:**

The conversation detail page shows:

- **Turn-by-turn display**: Messages shown as chat bubbles with role
  indicators (user/assistant/system/tool)
- **Turn metadata**: Hash, parent hash, timestamp, language
- **Ring data**: If extracted, shows keywords, entities, and segments
- **Source highlighting**: When navigating from a commit's source
  reference, the relevant text is highlighted in yellow
- **Scroll-to-turn**: URL parameters can target a specific turn and
  character range, with automatic scrolling

**Context Panel:**

A collapsible sidebar shows the conversation's memory context:
- Which pins are active for this conversation
- The assembled context text that would be sent to an LLM
- Token estimate for context size
- Controls to customize which pins this conversation uses

### 5.4 Commit Operations

**Creating Commits:**

From the canvas, users can create commits that:
- Extract sentences from linked conversations
- Inherit sentences from parent commits (configurable)
- Include source references for traceability
- Specify author information (human or agent)
- Assign to a branch with a commit message

**Viewing Commits:**

The commit detail modal shows:
- All sentences with their text and confidence scores
- Source references (clickable links to original conversations)
- Parent commit links
- Branch name and commit message
- Hash and timestamp

**Branching:**

- Create a new branch from any commit
- Switch between branches
- View branch-specific commit history
- Main branch enforces linear history (no multi-parent commits
  except merges)

### 5.5 Diff Visualization

T3X shows semantic diffs between commits with:

- **Word-level highlighting**: Added words in green, removed words
  in red, unchanged words in default color
- **Sentence categorization**: Identical, similar, added, removed
- **Similarity scores**: Jaccard coefficient for similar sentence pairs
- **Side-by-side view**: Source and target sentences shown adjacent
- **Statistics**: Count of same, modified, added, removed sentences

### 5.6 Merge Workspace

The merge workspace is a **full-screen dedicated page** for resolving
merge conflicts:

**Layout:**
- Header with source/target branch info and commit/cancel buttons
- Main area divided into sections by category:
  - Identical sentences (collapsed by default, auto-kept)
  - Similar pairs (expanded, requires resolution)
  - Only in source (expanded, keep/discard toggle)
  - Only in target (expanded, keep/discard toggle)

**Resolution Options for Similar Pairs:**

| Option | Effect |
|--------|--------|
| Keep Source | Use the source version of the sentence |
| Keep Target | Use the target version of the sentence |
| Keep Both | Include both versions in the merged commit |
| Edit | Provide custom merged text |

**Features:**
- Word-level diff display for each similar pair
- Auto-save of decisions (merge drafts persist)
- Commit button activates when all conflicts are resolved
- Cancel returns to canvas without committing
- Source context links for tracing back to original conversations

### 5.7 Leaf Management

**Creating Leaves:**

From the canvas or commit detail, users can create leaves:
1. Select the source commit
2. Choose the leaf type (tweet, email, article, etc.)
3. Give it a title

**Leaf Detail Page:**

The leaf detail page is a comprehensive management interface:

**Constraint Section:**
- Add require constraints (must include specific content)
- Add exclude constraints (must not include specific content)
- Choose match mode: exact (substring match) or semantic (embedding-based)
- Reference source sentences from the commit
- Text selection from commit sentences to auto-create constraints

**Generation Section:**
- Configure LLM settings (model, temperature, max tokens)
- Add custom user instructions for generation guidance
- Generate button triggers AI output creation
- Auto-validation runs after generation
- Up to 3 automatic retry attempts if constraints fail
- Generation history preserved for rollback

**Output Section:**
- Generated text display
- Assertion results (pass/fail badges)
- Re-validate button for manual re-checking
- Export options (clipboard, markdown, JSON)

**Source Context:**
- View commit sentences with highlighting
- Click to trace back to original conversation turns
- Breadcrumb navigation (Leaf > Commit > Conversation > Turn)

### 5.8 Pin Management

**Pinning Items:**

Pin buttons appear on:
- Conversation detail pages
- Leaf detail pages
- Canvas node modals

**Pin Actions:**
- Pin/unpin conversations
- Pin/unpin leaves
- For leaf pins: select which assertion lessons to include
- View all pins for a project

**Pin Effects:**

When items are pinned:
1. They appear as sources when creating new commits
2. They contribute to the conversation context sent to LLMs
3. Their assertion lessons can inform future generations

### 5.9 Source Context Tracing

T3X's evidence-backed design means every piece of knowledge can be
traced to its origin:

**Navigation Flow:**
```
Commit sentence "User prefers $5000 budget"
  → click "View Source"
  → Navigate to Conversation detail page
  → Auto-scroll to the specific turn
  → Highlight characters 42-98 in yellow
```

**Source Context View Component:**

A reusable component that shows:
- The target turn content with highlighted text
- Surrounding turns for context (2 before, 2 after)
- Conversation title and metadata
- Loading and error states

**Deep Linking:**

Source context supports URL parameters:
- `?turn=sha256:abc123` — scroll to specific turn
- `?highlight=42-98` — highlight character range
- These parameters are preserved when sharing URLs

---

## 6. Page-by-Page Walkthrough

### 6.1 Home Page (`/`)

**Purpose:** Project list and management hub.

**What the User Sees:**
- Header with "T3X" branding and "New Project" button
- Grid of project cards, each showing:
  - Project name
  - Statistics: conversations count, commits count, branches count
  - Status badge (active/draft/paused)
  - Last updated timestamp (relative, e.g., "2 hours ago")
- Multi-select mode toggle for batch operations
- Delete confirmation dialog with project name

**Interactions:**
- Click card → Navigate to project canvas
- Click "New Project" → Create dialog (name input)
- Toggle multi-select → Checkbox appears on each card
- Select multiple + Delete → Batch delete with confirmation

**Visual Design:**
- Animated card entrance with stagger effect
- Hover effects on cards
- Loading skeletons during data fetch
- Empty state when no projects exist
- Respects user's reduced-motion accessibility preference

### 6.2 Project Canvas (`/project/[projectId]`)

**Purpose:** Main workspace for viewing and editing the knowledge graph.

**What the User Sees:**
- Full-screen canvas with nodes and edges
- Right-side palette panel (collapsible)
- Bottom control bar
- Mode toggle: Editor / Execution (top-left)

**Canvas Nodes:**
- Conversation nodes: Blue, shows title and turn count
- Committed commit nodes: Green, shows hash prefix and sentence count
- Pending commit nodes: Yellow dashed border, editable
- Leaf nodes: Shows type icon and title

**Right Panel Palette:**
- "Add Conversation" button
- "Add Commit" button
- "Add Leaf" button
- Keyboard shortcuts help

**Bottom Controls:**
- Pan/select mode toggle
- Branch filter: "main" / "all branches" / specific branch
- Path highlight toggle
- Minimap toggle
- Zoom slider (50%-200%)
- Auto-layout button (ELK.js)
- Memory context button (opens modal)

**Node Click → Detail Modal:**
- Shows full node information
- Action buttons contextual to node type
- Source references as clickable links
- For commits: full sentence list

### 6.3 Conversation Detail (`/project/[projectId]/conversation/[conversationId]`)

**Purpose:** View conversation turns with source context support.

**What the User Sees:**
- Header with conversation title, project breadcrumb, pin button
- Turn list showing chat-style message bubbles
- Each turn shows: role badge, content, timestamp
- Collapsible context panel sidebar (right side)

**Special Behaviors:**
- When arriving from a source reference link:
  - Auto-scrolls to the target turn
  - Highlights the specific character range in yellow
  - Shows a brief animation to draw attention
- Context panel shows assembled memory for this conversation
- Pin button toggles pinned state for the entire conversation

### 6.4 Leaf Detail (`/project/[projectId]/leaf/[leafId]`)

**Purpose:** Manage leaf constraints, generate and validate output.

**Layout (Top to Bottom):**

1. **Header**: Leaf title, type badge, source commit link, pin button
2. **Source Knowledge Section**: Commit sentences displayed as cards,
   text selection enabled for constraint creation
3. **Constraints Section**: List of require/exclude constraints with
   add/remove buttons
4. **User Instructions**: Text area for additional LLM guidance
5. **Generate Button**: Triggers AI generation with progress indicator
6. **Output Section**: Generated text display
7. **Assertions Section**: Pass/fail badges for each constraint
8. **Export Section**: Copy/download buttons for various formats

**Constraint Creation Flow:**
1. Read commit sentences in the source knowledge section
2. Select text from a sentence
3. Click "Add as Constraint"
4. Choose type (require/exclude) and match mode (exact/semantic)
5. Constraint appears in the constraints list with source reference

**Generation Flow:**
1. Click "Generate" button
2. Progress indicator shows phases:
   - Phase 1: Analyzing commit sentences
   - Phase 2: Applying constraints
   - Phase 3: Generating output
3. Output appears in the output section
4. Assertions automatically run and show pass/fail
5. If constraints fail, up to 2 automatic retries occur

### 6.5 Merge Workspace (`/project/[projectId]/merge/[mergeId]`)

**Purpose:** Full-screen merge conflict resolution.

**Layout:**
- Header: Source branch → Target branch, Commit/Cancel buttons
- Progress indicator: "X of Y conflicts resolved"
- Sections (collapsible):

**Identical Sentences Section:**
- Collapsed by default (no action needed)
- Shows count of auto-kept sentences
- Expand to view full list

**Similar Pairs Section:**
- Each pair shown side-by-side
- Source sentence on left, target on right
- Word-level diff highlighting between them
- Similarity score badge
- Resolution buttons: Source | Target | Both | Edit
- Selected resolution highlighted

**Only in Source Section:**
- Each sentence with Keep/Discard toggle
- Default: Keep (checked)

**Only in Target Section:**
- Each sentence with Keep/Discard toggle
- Default: Keep (checked)

**Commit Button:**
- Disabled until all similar pairs have resolutions
- Click → Creates merge commit with two parents
- Redirects back to canvas

### 6.6 Insights (`/insights`)

**Purpose:** Cross-project analytics dashboard.

**Tabs:**

**Ledger Tab:**
- Grid of semantic cards for all commits across all projects
- Each card shows: sentence count, author, branch, project tag,
  relative timestamp
- Paginated (50 per page) with "Load More" button

**Latest Commits Tab:**
- Timeline view of the 10 most recent commits
- Shows commit message, project name, branch, time

### 6.7 Deploy Dashboard (`/deploy`)

**Purpose:** Agent deployment and evaluation management.

**Layout:**

**Quick Stats Bar (Top):**
- Total runs count
- Overall pass rate (percentage)
- Average score
- Average duration

**Deploy Agents Section:**
- Register new agent: ID, name, endpoint URL, type (HTTP/WebSocket/gRPC)
- Agent cards with status badges (idle/running/error)
- Delete agent button
- Run button (triggers evaluation via n8n)

**E2E Test Card:**
- Select agent(s) from dropdown
- Custom input JSON editor
- Run test button
- Results appear in runs table

**Recent Runs Table:**
- Columns: Run ID, Agent, Status, Model, Prompt Version, Duration,
  Pass Rate, Timestamp
- Filters: Model dropdown, Prompt Version dropdown
- Click row → Navigate to run detail
- Refresh button
- A/B Compare button → Navigate to comparison page

### 6.8 Run Detail (`/deploy/[runId]`)

**Purpose:** View evaluation results for a single run.

**Layout:**

**Header:**
- Run ID, status badge (pass/fail), timestamp
- Compare button, back to deploy link

**Overview Tab:**
- Score gauge (0-100%)
- Duration, token usage
- Model and prompt version
- Dimension scores as radar or bar chart (toggleable):
  - Task completion
  - Tool use
  - Trajectory efficiency
  - Cost efficiency
  - Latency

**Trace Tab:**
- Execution timeline showing each step
- Step types: LLM call, tool call, I/O
- Expandable detail for each step
- Token usage per step
- Latency per step

**Assertions Tab:**
- List of assertion results
- Pass/fail badge per assertion
- Human-readable explanation
- Improvement suggestions

### 6.9 A/B Comparison (`/deploy/compare`)

**Purpose:** Statistical comparison of two agent configurations.

**Layout:**

**Configuration Selectors:**
- Config A: Model dropdown + Prompt Version dropdown
- Config B: Model dropdown + Prompt Version dropdown
- Swap A↔B button
- URL-shareable (params encoded in URL)

**Comparison Table:**

| Metric | Config A | Config B | Delta | Significant? |
|--------|----------|----------|-------|--------------|
| Pass Rate | 95% | 97% | +2% | No (p=0.13) |
| Avg Score | 0.87 | 0.91 | +0.04 | Yes (p=0.04) |
| Avg Latency | 1200ms | 1100ms | -100ms | — |
| Avg Tokens | 150 | 140 | -10 | — |

**Statistical Tests:**
- Pass Rate: Two-proportion Z-test (95% confidence)
- Avg Score: Two-sample T-test
- Winner badge on the better configuration

**Individual Runs:**
- Filtered table showing runs for each configuration
- Sortable by metrics

### 6.10 Agent Demo (`/agent-demo/chat` and `/agent-demo/optimiser`)

**Chat Page:**
- Interactive chat interface with the demo agent
- Message bubbles (user/bot) with timestamps
- Star rating (1-5) for each bot response
- Typing indicator animation

**Optimiser Page:**
- Three-column layout:
  1. Feedback summary + optimization trigger
  2. Sandbox commit history
  3. Deployment history
- Run optimization: Generates new commit from accumulated feedback
- Deploy commit: Push to production agent
- Compare deployed vs sandbox versions

### 6.11 Database Inspector (`/dev/db`)

**Purpose:** Development-only SQL query interface.

**Features:**
- Table list with row counts
- Quick query buttons (SELECT * FROM ...)
- SQL editor with syntax highlighting
- Execute with Cmd/Ctrl+Enter
- Results displayed in a table

**Security:** Only available when `NODE_ENV === 'development'`.

---

## 7. Core User Workflows

### 7.1 Knowledge Extraction Workflow

```
Step 1: Create a Project
  ├── Give it a name (e.g., "Q1 Product Strategy")
  └── Empty canvas appears

Step 2: Create a Conversation
  ├── Click "Add Conversation" on canvas palette
  ├── Name it (e.g., "Market Research Discussion")
  └── Conversation node appears on canvas

Step 3: Add Turns to the Conversation
  ├── Navigate to conversation detail page
  ├── Add turns (user/assistant messages)
  ├── Ring extraction runs automatically (if NLP configured)
  └── Sentences are identified in Ring 3

Step 4: Create a Commit from Conversations
  ├── Click "Add Commit" on canvas
  ├── Link it to one or more conversations
  ├── Select sentences to include
  ├── Add commit message (e.g., "Initial market research findings")
  └── Commit node appears on canvas (green = committed)

Step 5: Create a Leaf for Output
  ├── Click "Add Leaf" on canvas
  ├── Link to the commit
  ├── Choose type (e.g., "article" for a blog post)
  ├── Add constraints (must include, must not include)
  ├── Generate output via LLM
  └── Validate output against constraints
```

### 7.2 Version Control Workflow

```
Step 1: Baseline Commit (on main branch)
  └── Contains initial knowledge sentences

Step 2: Create a Feature Branch
  ├── Right-click commit → "Create Branch"
  ├── Name: "feature/additional-research"
  └── New branch created from this commit

Step 3: Add Knowledge on Feature Branch
  ├── Create new conversation on the branch
  ├── Add new turns with additional research
  ├── Create new commit on feature branch
  └── New sentences + inherited parent sentences

Step 4: Merge Back to Main
  ├── Select source (feature branch head) and target (main head)
  ├── System prepares merge preview
  ├── Resolve conflicts in merge workspace:
  │   ├── Keep identical sentences (automatic)
  │   ├── Choose between similar sentence versions
  │   └── Decide which unique sentences to keep
  └── Commit merge → New commit on main with two parents
```

### 7.3 Agent Deployment Workflow

```
Step 1: Build Knowledge Base
  ├── Create commits with domain knowledge sentences
  └── Review and refine sentences

Step 2: Create Deploy Agent Leaf
  ├── Type: deploy_agent
  ├── Add constraints:
  │   ├── REQUIRE: "Always greet the customer by name"
  │   ├── REQUIRE: "Include product warranty information"
  │   └── EXCLUDE: "competitor pricing" (reason: policy)
  ├── Generate system prompt
  └── Validate against constraints

Step 3: Register Agent
  ├── Go to /deploy
  ├── Register agent: name, endpoint URL, auth
  └── Agent appears in dashboard

Step 4: Run Evaluation
  ├── Trigger E2E test with custom input
  ├── n8n executes the agent workflow
  ├── Runner evaluates the trace
  └── Results appear in runs table

Step 5: Compare Configurations
  ├── Run with different models/prompts
  ├── Go to A/B comparison page
  ├── Select two configurations
  └── View statistical comparison (Z-test, T-test)
```

### 7.4 Source Tracing Workflow

```
Step 1: Viewing a commit, notice sentence:
  "User budget is $5000 maximum"

Step 2: Click "View Source" link
  → Navigates to conversation detail page
  → URL: /project/proj_x/conversation/conv_y?turn=sha256:abc&highlight=42-98

Step 3: Page auto-scrolls to the specific turn
  → The text from char 42 to 98 is highlighted in yellow
  → Surrounding turns provide context (2 before, 2 after)

Step 4: Verify the knowledge
  → Read the original conversation context
  → Confirm the extraction is accurate
  → Navigate back to commit with confidence
```

---

## 8. Export & Integration

### 8.1 Export Formats

**Commit Export:**
- **JSON**: Full commit data including hash, parents, sentences, metadata
- **Text**: Plain text sentences, one per line
- **Markdown**: Formatted with headers, bullet points, metadata section

**Leaf Export:**
- **JSON**: Full leaf data with constraints, output, assertions
- **Text**: Output text only
- **Markdown**: Formatted with constraint list, output, assertion results

**Context Export:**
- **JSON**: Built context with token estimate and sources
- **Markdown**: Formatted context ready for LLM consumption

**Project Export:**
- **CFPack**: Complete project archive (JSON) including all turns,
  commits, findings, and integrity hash
- **JSONL Ledger**: Newline-delimited JSON with typed records
  (project, conversation, turn, commit)

### 8.2 API Integration

The Hono API server provides a full REST API:

- Base URL: `http://localhost:8000/api/v1`
- Interactive docs: `http://localhost:8000/api/docs` (Scalar UI)
- OpenAPI spec: `http://localhost:8000/api/openapi.json`
- Response format: `{ "success": true/false, "data": {...} }`

### 8.3 CLI Integration

The `t3x` CLI provides command-line access:

```bash
t3x health                    # Check API health
t3x projects list             # List projects
t3x projects create "Name"    # Create project
t3x branches list -p proj_x   # List branches
t3x commits list -p proj_x    # List commits
t3x commits show sha256:...   # Show commit details
```

---

## 9. Agent Evaluation System

### 9.1 Overview

T3X includes a grey-box agent evaluation engine (the Runner) that can
evaluate AI agent performance without depending on LLMs for judgment.

### 9.2 Evaluation Flow

```
WebUI creates a Run
  → Engine sends webhook to n8n
    → n8n executes AI Agent workflow
      → Agent makes LLM calls, uses tools
    → n8n sends execution trace to Runner
  → Runner collects trace from n8n API
  → Runner evaluates trace against rules (deterministic)
  → Runner optionally generates LLM assertions
  → Runner sends results back to Engine
  → Engine stores results
  → WebUI displays results
```

### 9.3 Evaluation Dimensions

| Dimension | What It Measures |
|-----------|-----------------|
| Task Completion | Did the agent produce the expected output? |
| Tool Use | Did the agent use the right tools correctly? |
| Trajectory Efficiency | Was the execution path optimal? |
| Cost Efficiency | Were token costs reasonable? |
| Latency | Was the response time acceptable? |

### 9.4 Rule Types

Rules are defined in YAML files and specify deterministic checks:

- **Basic**: Output exists, contains expected value, matches regex
- **Tool Use**: Expected tools were called, no unknown tools
- **Trajectory**: Step count within range, no repeated steps
- **Cost**: Token usage within budget
- **Performance**: Latency within threshold

### 9.5 Statistical Comparison

The A/B comparison feature provides rigorous statistical testing:

- **Two-proportion Z-test** for comparing pass rates
- **Two-sample T-test** for comparing average scores
- **95% confidence intervals** using Wilson score
- **p-value** and significance indicators
- Minimum sample size warnings

---

## 10. Visual & UX Design

### 10.1 Design System

- **Component library**: shadcn/ui (Radix UI primitives + Tailwind CSS)
- **Icons**: Lucide icons
- **Animations**: Framer Motion with reduced-motion support
- **Theme**: Dark and light mode via next-themes
- **Typography**: Monospace font for technical content, system font for UI

### 10.2 Accessibility

- Reduced motion: Respects `prefers-reduced-motion` media query
- Keyboard navigation: All interactive elements are keyboard-accessible
- Focus management: Proper focus trapping in modals and dialogs
- Color contrast: Meets WCAG AA standards
- Screen reader: Semantic HTML and ARIA labels

### 10.3 Loading States

- **Skeleton loaders**: Used for initial page loads
- **Spinners**: Used for action-triggered loading (generate, validate)
- **Progress indicators**: Multi-phase operations show current phase
- **Toast notifications**: Success/error/warning messages
- **Optimistic updates**: UI updates immediately, reverts on error

### 10.4 Error Handling

- **API errors**: Displayed as toast notifications with error code
- **Network errors**: Retry buttons with exponential backoff
- **Validation errors**: Inline error messages near the relevant field
- **Empty states**: Helpful messages with action buttons when no data

---

## 11. Current Limitations

### 11.1 Missing Features

| Feature | Status | Impact |
|---------|--------|--------|
| User Authentication | Not implemented | Cannot deploy for multi-user |
| Execution Mode | Placeholder ("Coming in v2.0") | Canvas mode toggle exists but execution view is empty |
| Real-time Collaboration | Not implemented | Single-user only |
| Undo/Redo | Not implemented | No action history |
| Search | Not implemented | Cannot search across conversations/commits |
| Webhooks/Events | Not implemented | No external integrations beyond n8n |
| CLI (Advanced) | Basic implementation | Missing commit, merge, leaf commands |
| Mobile UI | Not optimized | Desktop-first design |

### 11.2 External Dependencies

| Dependency | Required For | Fallback |
|------------|-------------|----------|
| ANTHROPIC_API_KEY | Leaf output generation | Cannot generate |
| GOOGLE_AI_STUDIO_KEY | Semantic constraint validation | Exact-only validation |
| Google Cloud NLP | Ring extraction (keyword/entity) | Turns created without rings |
| n8n | Agent workflow execution | Manual evaluation only |

### 11.3 Known Constraints

- **Main branch linearity**: The main branch only allows single-parent
  commits (except merges). This prevents complex branching on main.
- **Sentence ID stability**: When sentences are inherited across commits,
  they get new IDs (deterministic but different from original).
- **Context window**: Token estimation uses a rough 4-chars-per-token
  approximation, which may be inaccurate for non-English text.
- **PGLite data**: Local PGLite database can corrupt if the process is
  killed with SIGKILL. Graceful shutdown is required.

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Assertion** | The result of validating an output against a constraint (pass/fail) |
| **Branch** | A named pointer to a chain of commits |
| **Canvas** | The visual workspace for viewing/editing the knowledge graph |
| **Commit** | An immutable snapshot of extracted knowledge (sentences only in V4) |
| **Constraint** | A validation rule (require/exclude) attached to a leaf |
| **Context** | The assembled background information sent to an LLM |
| **Conversation** | A recorded dialogue consisting of ordered turns |
| **DAG** | Directed Acyclic Graph — the commit history structure |
| **Diff** | Word-level comparison between two commits' sentences |
| **Draft** | A temporary LLM-generated text before being committed |
| **Evidence** | The traceable source reference for any knowledge claim |
| **First-class field** | A field included in the commit hash computation |
| **Hash chain** | Linked sequence of hashes ensuring data integrity |
| **Inherited sentence** | A sentence carried forward from a parent commit |
| **JCS** | JSON Canonicalization Scheme (RFC 8785) for deterministic hashing |
| **Leaf** | An application of knowledge (constraints + output + validation) |
| **Merge** | Combining two commits into a new commit with conflict resolution |
| **n8n** | Open-source workflow automation tool used for agent execution |
| **NLP** | Natural Language Processing — used for semantic extraction |
| **PGLite** | PostgreSQL compiled to WebAssembly for local development |
| **Pin** | A marker selecting an item for reuse (sources + context) |
| **Ring** | A level of semantic extraction (Ring 1/2/3) |
| **Runner** | The grey-box agent evaluation engine |
| **Second-class field** | A field excluded from the commit hash computation |
| **Sentence** | The atomic unit of knowledge in T3X |
| **Source ref** | A reference to the exact conversation/turn/position where knowledge originated |
| **Turn** | A single message in a conversation |
| **V4** | The current architecture version (commits = sentences only) |

---

*End of Document 1: Product & User Layer*
*Total: ~1000 lines*
