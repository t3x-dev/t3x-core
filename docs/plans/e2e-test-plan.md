# T3X End-to-End Test Plan

> Complete flow validation: Conversation → Commit → Leaf → Branch → Merge

**Last Updated**: 2025-01-18

---

## Table of Contents

1. [Overview](#overview)
2. [Test Scenarios](#test-scenarios)
3. [Scenario 1: Basic Flow](#scenario-1-basic-flow-happy-path)
4. [Scenario 2: Leaf Generation](#scenario-2-leaf-generation)
5. [Scenario 3: Branch & Merge](#scenario-3-branch--merge)
6. [Scenario 4: Constraint Preservation](#scenario-4-constraint-preservation)
7. [Manual Test Checklist](#manual-test-checklist)
8. [Automated Test Specifications](#automated-test-specifications)
9. [Test Data Fixtures](#test-data-fixtures)
10. [Success Criteria](#success-criteria)

---

## Overview

### The Complete T3X Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           T3X COMPLETE FLOW                                 │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Conversation │───►│    Commit    │───►│    Leaf      │                  │
│  │   + Turns    │    │  (Sentences  │    │  (Generated  │                  │
│  │              │    │  + Anchors)  │    │   Output)    │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                   │                                               │
│         │                   ▼                                               │
│         │            ┌──────────────┐                                       │
│         │            │   Branch     │                                       │
│         │            │  (Feature)   │                                       │
│         │            └──────────────┘                                       │
│         │                   │                                               │
│         ▼                   ▼                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Next Commit  │    │    Merge     │───►│ Merged Commit│                  │
│  │ (Continue)   │    │  (Resolve)   │    │  (Combined)  │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Test Objectives

| Objective | Description |
|-----------|-------------|
| **Flow Integrity** | Data flows correctly through all stages |
| **Hash Chains** | Commit hashes maintain integrity |
| **Lineage** | Every output traces back to source |
| **Constraints** | REQUIRE/EXCLUDE preserved through flow |
| **UI/UX** | Canvas reflects all state changes |
| **Error Handling** | Graceful handling of failures |

---

## Test Scenarios

| Scenario | Description | Priority |
|----------|-------------|----------|
| 1 | Basic Flow (Happy Path) | **Critical** |
| 2 | Leaf Generation | **High** |
| 3 | Branch & Merge | **High** |
| 4 | Constraint Preservation | **High** |
| 5 | Error Recovery | Medium |
| 6 | Performance | Medium |
| 7 | Concurrent Operations | Low |

---

## Scenario 1: Basic Flow (Happy Path)

### Flow Diagram

```
Step 1          Step 2          Step 3          Step 4          Step 5
Create         Add Turns       Extract &       Commit          Verify
Project        to Conv         Review          Changes         Result
   │              │               │               │               │
   ▼              ▼               ▼               ▼               ▼
┌──────┐     ┌──────┐       ┌──────┐       ┌──────┐       ┌──────┐
│proj_ │────►│conv_ │──────►│Draft │──────►│Commit│──────►│Canvas│
│ abc  │     │ 123  │       │Review│       │ Hash │       │ Node │
└──────┘     └──────┘       └──────┘       └──────┘       └──────┘
```

### Step-by-Step Test Cases

#### Step 1: Create Project
```
GIVEN: User is on home page
WHEN: User clicks "Create Project"
AND: Enters name "Contract Negotiation"
AND: Clicks "Create"
THEN: Project is created with ID
AND: User is redirected to project canvas
AND: Canvas is empty with placeholder
```

**API Verification**:
```bash
POST /api/v1/projects
Body: { "name": "Contract Negotiation" }

Expected Response:
{
  "success": true,
  "data": {
    "project_id": "proj_xxx",
    "name": "Contract Negotiation",
    "created_at": "2025-01-18T..."
  }
}
```

**Criteria**:
- [ ] Project ID generated (format: `proj_xxx`)
- [ ] Project appears in project list
- [ ] Canvas loads for project

---

#### Step 2: Create Conversation & Add Turns

```
GIVEN: User is on project canvas
WHEN: User clicks "Add Conversation"
THEN: New conversation node appears (staging)

WHEN: User adds turns:
  Turn 1 (user): "What is the service fee?"
  Turn 2 (assistant): "The service fee is $5,000 per month, payable within 30 days."
  Turn 3 (user): "Is there a refund policy?"
  Turn 4 (assistant): "Yes, we offer a 30-day money-back guarantee."
THEN: Turns are stored with hash chain
AND: Node shows "4 turns"
```

**API Verification**:
```bash
# Create conversation
POST /api/v1/conversations
Body: { "project_id": "proj_xxx", "title": "Initial Discussion" }

# Add turns (each turn references parent)
POST /api/v1/turns
Body: {
  "project_id": "proj_xxx",
  "conversation_id": "conv_xxx",
  "parent_turn_hash": null,  // First turn
  "role": "user",
  "content": "What is the service fee?"
}

POST /api/v1/turns
Body: {
  "parent_turn_hash": "sha256:abc...",  // Links to previous
  "role": "assistant",
  "content": "The service fee is $5,000 per month..."
}
```

**Criteria**:
- [ ] Conversation ID generated
- [ ] Each turn has unique hash
- [ ] Turn chain is valid (parent_turn_hash links)
- [ ] Semantic extraction runs (Ring 1-3)
- [ ] Canvas node updates with turn count

---

#### Step 3: Review Extracted Semantics

```
GIVEN: Conversation with 4 turns exists
WHEN: User clicks "Review" on conversation node
THEN: Curation panel opens showing:
  - Extracted sentences
  - Anchor candidates highlighted
  - Constraint suggestions (REQUIRE for $5,000, 30 days, etc.)

WHEN: User confirms anchors:
  - "$5,000" as REQUIRE (exact)
  - "30-day money-back guarantee" as REQUIRE (semantic)
  - "CompetitorX" as EXCLUDE (added manually)
THEN: Constraints are stored in pending commit
```

**Data Structure**:
```typescript
// Pending commit state in canvas store
{
  commitStatus: 'staging',
  pendingSource: {
    textBlocks: [...],
    confirmedAnchors: [
      { text: "$5,000", constraint: "must_have", match: "exact" },
      { text: "30-day money-back guarantee", constraint: "must_have", match: "semantic" },
    ]
  },
  pendingAnchors: {
    sentences: [
      { id: "s1", text: "The service fee is $5,000 per month...", anchors: [...] },
      { id: "s2", text: "Yes, we offer a 30-day money-back guarantee.", anchors: [...] }
    ]
  }
}
```

**Criteria**:
- [ ] Sentences extracted correctly
- [ ] Anchor candidates shown with types (money, duration, etc.)
- [ ] User can confirm/reject anchors
- [ ] User can add EXCLUDE constraints manually
- [ ] Pending state saved

---

#### Step 4: Commit Changes

```
GIVEN: User has reviewed and confirmed anchors
WHEN: User clicks "Commit" on the node
AND: Enters message "Initial payment terms"
AND: Selects branch "main"
AND: Clicks "Confirm Commit"
THEN: Commit is created with hash
AND: Node changes from staging to committed
AND: Node becomes immutable (can't delete)
AND: Canvas shows "Committed" status
```

**API Verification**:
```bash
POST /api/v1/commits-v3
Body: {
  "project_id": "proj_xxx",
  "branch": "main",
  "message": "Initial payment terms",
  "content": {
    "sentences": [
      { "id": "s1", "text": "The service fee is $5,000 per month...", "confidence": 0.95, "source": {...} },
      { "id": "s2", "text": "We offer a 30-day money-back guarantee.", "confidence": 0.92, "source": {...} }
    ],
    "constraints": [
      { "type": "require", "id": "c1", "value": "$5,000", "match": "exact", "source_sentence_id": "s1" },
      { "type": "require", "id": "c2", "value": "30-day money-back guarantee", "match": "semantic", "source_sentence_id": "s2" },
      { "type": "exclude", "id": "c3", "value": "CompetitorX", "match": "semantic" }
    ]
  },
  "author": {
    "name": "Alice",
    "verification": "none"
  }
}

Expected Response:
{
  "success": true,
  "data": {
    "hash": "sha256:7f83b165...",
    "schema": "commit/v3",
    "parents": [],
    "committed_at": "2025-01-18T...",
    ...
  }
}
```

**Criteria**:
- [ ] Commit hash generated (sha256)
- [ ] Hash is deterministic (same content = same hash)
- [ ] Sentences stored with source references
- [ ] Constraints stored with types
- [ ] Canvas node updates to committed state
- [ ] Node locked (cannot delete)
- [ ] Parent hash is empty (root commit)

---

#### Step 5: Verify Result

```
GIVEN: Commit is created
WHEN: User views commit details
THEN: All data is correct:
  - Hash matches expected
  - Sentences list complete
  - Constraints shown with badges
  - Author displayed
  - Timestamp accurate
  - Branch shows "main"
```

**Verification Queries**:
```sql
-- Verify commit exists
SELECT * FROM commits_v3 WHERE hash = 'sha256:7f83b165...';

-- Verify content structure
SELECT content->'sentences' as sentences,
       content->'constraints' as constraints
FROM commits_v3 WHERE hash = 'sha256:...';

-- Verify lineage (should be root, no parents)
SELECT parents FROM commits_v3 WHERE hash = 'sha256:...';
-- Expected: []
```

**Criteria**:
- [ ] Database record exists
- [ ] All fields populated correctly
- [ ] Hash can be recomputed and verified
- [ ] Canvas displays accurate information

---

## Scenario 2: Leaf Generation

### Flow Diagram

```
Committed        Select          Configure       Generate        Validate
Commit           Leaf Type       Options         Output          Constraints
   │                │               │               │               │
   ▼                ▼               ▼               ▼               ▼
┌──────┐       ┌──────┐       ┌──────┐       ┌──────┐       ┌──────┐
│sha256│──────►│Tweet │──────►│Config│──────►│ LLM  │──────►│Check │
│:7f83 │       │      │       │ Form │       │Output│       │Pass/ │
└──────┘       └──────┘       └──────┘       └──────┘       │ Fail │
                                                            └──────┘
```

### Test Cases

#### Step 1: Select Leaf Type

```
GIVEN: User has a committed commit on canvas
WHEN: User clicks "Add Output" on the commit node
THEN: Leaf panel opens with type options

WHEN: User selects "Twitter"
THEN: Leaf configuration page opens
```

**Criteria**:
- [ ] Leaf panel shows all available types
- [ ] Types grouped by category (runner, output)
- [ ] Selection navigates to config page

---

#### Step 2: Configure Leaf

```
GIVEN: User is on leaf configuration page
WHEN: User configures:
  - Instructions: "Make it engaging and professional"
  - Include hashtags: Yes
  - Max length: 280 (default for Twitter)
THEN: Configuration is saved
```

**UI Fields**:
```
┌─────────────────────────────────────────────────────────┐
│ Create Tweet from Commit sha256:7f83...                 │
├─────────────────────────────────────────────────────────┤
│ Source Sentences:                                       │
│ • The service fee is $5,000 per month...               │
│ • We offer a 30-day money-back guarantee.              │
├─────────────────────────────────────────────────────────┤
│ Constraints:                                            │
│ ✓ REQUIRE: "$5,000" (exact)                            │
│ ✓ REQUIRE: "30-day money-back guarantee" (semantic)    │
│ ✗ EXCLUDE: "CompetitorX" (semantic)                    │
├─────────────────────────────────────────────────────────┤
│ Configuration:                                          │
│ Instructions: [Make it engaging and professional    ]  │
│ Include hashtags: [✓]                                  │
│ Max length: [280]                                       │
├─────────────────────────────────────────────────────────┤
│ [Generate]                                              │
└─────────────────────────────────────────────────────────┘
```

**Criteria**:
- [ ] Source commit info displayed
- [ ] Sentences listed
- [ ] Constraints shown with types
- [ ] Config form validates input
- [ ] Generate button enabled

---

#### Step 3: Generate Output

```
GIVEN: User has configured leaf
WHEN: User clicks "Generate"
THEN: Loading state shows
AND: LLM generates output
AND: Output appears in preview

Expected output example:
"Our service is just $5,000/month with a 30-day money-back guarantee!
No risk, all value. #BusinessServices #MoneyBackGuarantee"
```

**API Call**:
```bash
POST /api/v1/leaves
Body: {
  "commitHash": "sha256:7f83...",
  "type": "twitter",
  "config": {
    "instructions": "Make it engaging and professional",
    "includeHashtags": true,
    "maxLength": 280
  }
}
```

**Criteria**:
- [ ] Loading indicator shown during generation
- [ ] Output generated successfully
- [ ] Output respects max length
- [ ] Character count displayed

---

#### Step 4: Validate Constraints

```
GIVEN: Output is generated
THEN: Constraints are automatically validated

Validation Results:
✓ REQUIRE "$5,000": PASSED (found: "$5,000/month")
✓ REQUIRE "30-day money-back guarantee": PASSED (semantic match: 0.91)
✓ EXCLUDE "CompetitorX": PASSED (not found)

Overall: 3/3 constraints passed
```

**Constraint Result Structure**:
```typescript
[
  {
    constraintId: "c1",
    constraint: { type: "require", value: "$5,000", match: "exact" },
    passed: true,
    evidence: { found: "$5,000/month", location: 20 }
  },
  {
    constraintId: "c2",
    constraint: { type: "require", value: "30-day money-back guarantee", match: "semantic" },
    passed: true,
    evidence: { similarity: 0.91 }
  },
  {
    constraintId: "c3",
    constraint: { type: "exclude", value: "CompetitorX", match: "semantic" },
    passed: true,
    evidence: { similarity: 0.12 }  // Low = not similar = good for exclude
  }
]
```

**Criteria**:
- [ ] Each constraint validated
- [ ] Pass/fail badges displayed
- [ ] Evidence shown for each result
- [ ] Overall status calculated

---

#### Step 5: Handle Failed Constraints

```
GIVEN: User generates output that fails a constraint
Example bad output: "Our service costs five thousand dollars monthly..."

Validation Results:
✗ REQUIRE "$5,000": FAILED (not found - used "five thousand" instead)
✓ REQUIRE "30-day money-back guarantee": PASSED
✓ EXCLUDE "CompetitorX": PASSED

THEN: User sees failure message
AND: User can:
  - Click "Regenerate" to try again
  - Edit output manually to fix
  - Override with acknowledgment
```

**UI for Failed Constraint**:
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Constraint Validation Failed                         │
├─────────────────────────────────────────────────────────┤
│ ✗ REQUIRE "$5,000" (exact match)                       │
│   Expected: "$5,000"                                    │
│   Found: Not present                                    │
│   Suggestion: The output uses "five thousand dollars"  │
│               instead of the exact amount "$5,000"     │
├─────────────────────────────────────────────────────────┤
│ [Regenerate] [Edit Output] [Override ⚠️]                │
└─────────────────────────────────────────────────────────┘
```

**Criteria**:
- [ ] Failed constraints highlighted
- [ ] Clear explanation of failure
- [ ] Suggestion for fix
- [ ] Regenerate option available
- [ ] Manual edit option
- [ ] Override requires confirmation

---

#### Step 6: Save and View Lineage

```
GIVEN: Output passes all constraints (or user overrides)
WHEN: User clicks "Save"
THEN: Leaf is saved to database
AND: Leaf appears in commit's leaves section
AND: Lineage is traceable

Lineage:
Conversation (conv_123)
    └─► Commit (sha256:7f83...)
            └─► Leaf (leaf_abc) - Twitter
```

**Criteria**:
- [ ] Leaf saved with commit reference
- [ ] Appears in UnitNode's leaves section
- [ ] Can navigate: Leaf → Commit → Conversation
- [ ] Lineage visible in UI

---

## Scenario 3: Branch & Merge

### Flow Diagram

```
Main Commit      Create         Branch          Merge           Merged
(Initial)       Branch         Commit          Flow            Result
    │              │              │               │               │
    ▼              ▼              ▼               ▼               ▼
┌──────┐      ┌──────┐      ┌──────┐       ┌──────┐       ┌──────┐
│ C1   │─────►│branch│─────►│ C2   │──────►│Prepare│─────►│ C3   │
│(main)│      │"feat"│      │(feat)│       │Execute│      │(main)│
└──────┘      └──────┘      └──────┘       │Resolve│      │merged│
                                           └──────┘       └──────┘
```

### Test Cases

#### Step 1: Create Branch from Commit

```
GIVEN: User has committed commit C1 on main
WHEN: User clicks "Continue" on C1 node
AND: Selects "Create Branch"
AND: Names branch "feature/pricing-update"
THEN: New staging node appears
AND: Branch is created in database
```

**API Call**:
```bash
POST /api/v1/branches
Body: {
  "project_id": "proj_xxx",
  "name": "feature/pricing-update",
  "parent_branch": "main",
  "head_commit_hash": "sha256:7f83..."
}
```

**Criteria**:
- [ ] Branch created with name
- [ ] Branch points to parent commit
- [ ] New staging node appears on canvas
- [ ] Canvas shows branch color (amber)

---

#### Step 2: Make Changes on Branch

```
GIVEN: User is on feature branch
WHEN: User adds new conversation with turns:
  "What about enterprise pricing?"
  "For enterprise, the fee is $10,000 per month with dedicated support."
AND: Commits with:
  - New sentence: "Enterprise fee is $10,000 per month with dedicated support"
  - New constraint: REQUIRE "$10,000" (exact)
THEN: Commit C2 is created on feature branch
AND: C2 has C1 as parent
```

**Commit Structure**:
```typescript
{
  hash: "sha256:abc123...",
  schema: "commit/v3",
  parents: ["sha256:7f83..."],  // Points to C1
  branch: "feature/pricing-update",
  content: {
    sentences: [
      // Inherited from C1
      { id: "s1", text: "The service fee is $5,000 per month..." },
      { id: "s2", text: "We offer a 30-day money-back guarantee." },
      // New on branch
      { id: "s3", text: "Enterprise fee is $10,000 per month with dedicated support." }
    ],
    constraints: [
      // Inherited
      { type: "require", id: "c1", value: "$5,000", match: "exact" },
      { type: "require", id: "c2", value: "30-day money-back guarantee", match: "semantic" },
      { type: "exclude", id: "c3", value: "CompetitorX", match: "semantic" },
      // New
      { type: "require", id: "c4", value: "$10,000", match: "exact" }
    ]
  }
}
```

**Criteria**:
- [ ] C2 created on feature branch
- [ ] Parent hash points to C1
- [ ] Sentences include both inherited and new
- [ ] Constraints include both inherited and new
- [ ] Canvas shows C2 connected to C1

---

#### Step 3: Meanwhile, Update Main

```
GIVEN: Feature branch has C2
WHEN: Another user (or same user) updates main:
  - Adds new sentence: "Payment accepted via bank transfer or credit card."
  - Commits as C1' on main
THEN: Main and feature have diverged
```

**State after divergence**:
```
        C1 (main, original)
       /  \
     C1'   C2
   (main) (feature)
```

---

#### Step 4: Prepare Merge

```
GIVEN: Main has C1', feature has C2
WHEN: User clicks "Merge" on C2 (feature branch commit)
AND: Selects "Merge into main"
THEN: Merge preparation runs
AND: Merge panel opens with diff

Diff Categories:
- Identical: "30-day money-back guarantee" sentence
- Similar: "$5,000" vs "$10,000" pricing sentences (conflict!)
- Only in source (C2): Enterprise support sentence
- Only in target (C1'): Payment methods sentence
```

**API Call**:
```bash
POST /api/v1/merge/prepare
Body: {
  "project_id": "proj_xxx",
  "source_hash": "sha256:abc123...",  // C2 (feature)
  "target_hash": "sha256:def456..."   // C1' (main)
}

Response:
{
  "success": true,
  "data": {
    "identical": [
      { "sentenceId": "s2", "text": "We offer a 30-day money-back guarantee." }
    ],
    "similar": [
      {
        "source": { "id": "s1", "text": "Enterprise fee is $10,000 per month..." },
        "target": { "id": "s1", "text": "The service fee is $5,000 per month..." },
        "similarity": 0.72,
        "resolution": null  // User must choose
      }
    ],
    "onlyInSource": [
      { "id": "s3", "text": "Enterprise fee is $10,000 per month with dedicated support." }
    ],
    "onlyInTarget": [
      { "id": "s4", "text": "Payment accepted via bank transfer or credit card." }
    ]
  }
}
```

**Criteria**:
- [ ] Prepare API called successfully
- [ ] Sentences categorized correctly
- [ ] Similar pairs identified with similarity score
- [ ] Merge panel displays all categories

---

#### Step 5: Resolve Conflicts

```
GIVEN: Merge panel shows conflict in pricing sentences
WHEN: User resolves:
  - Similar pair: Keep BOTH (include both pricing tiers)
  - Only in source: KEEP enterprise support sentence
  - Only in target: KEEP payment methods sentence
THEN: All conflicts resolved
AND: "Execute Merge" button enabled
```

**Merge Panel UI**:
```
┌─────────────────────────────────────────────────────────┐
│ Merge: feature/pricing-update → main                    │
├─────────────────────────────────────────────────────────┤
│ ═══ CONFLICTS (1) ═══                                   │
│                                                         │
│ Similar Sentences (need resolution):                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Source (feature):                                   │ │
│ │ "Enterprise fee is $10,000 per month..."            │ │
│ │ ○ Use this                                          │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ Target (main):                                      │ │
│ │ "The service fee is $5,000 per month..."            │ │
│ │ ○ Use this                                          │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ● Keep both (recommended for different pricing)    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ═══ AUTO-MERGED ═══                                     │
│                                                         │
│ Identical (auto-kept):                                  │
│ ✓ "We offer a 30-day money-back guarantee."            │
│                                                         │
│ Only in source (feature):                               │
│ [✓] "Enterprise...with dedicated support."             │
│                                                         │
│ Only in target (main):                                  │
│ [✓] "Payment accepted via bank transfer..."            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [Cancel]                              [Execute Merge ✓] │
└─────────────────────────────────────────────────────────┘
```

**Criteria**:
- [ ] Conflict UI is clear
- [ ] User can choose source, target, or both
- [ ] Checkboxes for keep/discard unique sentences
- [ ] Execute button disabled until all resolved
- [ ] Execute button enabled after resolution

---

#### Step 6: Execute Merge

```
GIVEN: All conflicts resolved
WHEN: User clicks "Execute Merge"
THEN: Merge commit C3 is created
AND: C3 has two parents: [C1', C2]
AND: C3 contains merged sentences
AND: C3 is on main branch
AND: Canvas updates with merged node
```

**API Call**:
```bash
POST /api/v1/merge/execute
Body: {
  "project_id": "proj_xxx",
  "source_hash": "sha256:abc123...",
  "target_hash": "sha256:def456...",
  "resolutions": {
    "similar": [
      { "pairId": "pair1", "choice": "both" }
    ],
    "onlyInSource": [
      { "sentenceId": "s3", "keep": true }
    ],
    "onlyInTarget": [
      { "sentenceId": "s4", "keep": true }
    ]
  },
  "message": "Merge feature/pricing-update into main",
  "branch": "main"
}

Response:
{
  "success": true,
  "data": {
    "hash": "sha256:merged123...",
    "parents": ["sha256:def456...", "sha256:abc123..."],
    "content": {
      "sentences": [
        { "id": "m1", "text": "The service fee is $5,000 per month..." },
        { "id": "m2", "text": "Enterprise fee is $10,000 per month..." },
        { "id": "m3", "text": "We offer a 30-day money-back guarantee." },
        { "id": "m4", "text": "Payment accepted via bank transfer..." }
      ],
      "constraints": [
        // Merged constraints from both commits
      ]
    }
  }
}
```

**Criteria**:
- [ ] Merge commit created successfully
- [ ] Has two parents (source and target)
- [ ] Sentences merged correctly per resolutions
- [ ] Constraints merged (union of both)
- [ ] Canvas shows merge commit
- [ ] Canvas shows merge edges (two parents → one child)
- [ ] Branch pointer updated

---

#### Step 7: Verify Merge Result

```
GIVEN: Merge commit C3 exists
WHEN: User views C3 details
THEN: Data is correct:
  - Two parent hashes
  - All expected sentences present
  - Constraints from both branches
  - Marked as merge commit
```

**Verification**:
```typescript
// Expected merged commit
{
  hash: "sha256:merged123...",
  schema: "commit/v3",
  parents: ["sha256:def456...", "sha256:abc123..."],  // TWO parents!
  branch: "main",
  message: "Merge feature/pricing-update into main",
  content: {
    sentences: [
      { id: "m1", text: "The service fee is $5,000 per month..." },
      { id: "m2", text: "Enterprise fee is $10,000 per month..." },
      { id: "m3", text: "We offer a 30-day money-back guarantee." },
      { id: "m4", text: "Payment accepted via bank transfer..." }
    ],
    constraints: [
      { type: "require", id: "mc1", value: "$5,000", match: "exact" },
      { type: "require", id: "mc2", value: "$10,000", match: "exact" },
      { type: "require", id: "mc3", value: "30-day money-back guarantee", match: "semantic" },
      { type: "exclude", id: "mc4", value: "CompetitorX", match: "semantic" }
    ]
  }
}
```

**Criteria**:
- [ ] Two parent hashes present
- [ ] All resolved sentences present
- [ ] Sentence IDs regenerated (m1, m2, etc.)
- [ ] Constraints merged correctly
- [ ] No duplicate constraints
- [ ] Canvas displays correctly

---

## Scenario 4: Constraint Preservation

### Test: Constraints Flow Through Entire Pipeline

```
GIVEN: Constraint "$5,000" added at commit time
THEN: Constraint persists through:
  1. Commit storage
  2. Branch (inherited)
  3. Merge (combined)
  4. Leaf generation (validated)
```

### Test Cases

#### 4.1: Constraint in Initial Commit
```
GIVEN: User creates commit with REQUIRE "$5,000"
THEN: Constraint stored in commit.content.constraints
AND: Constraint has source_sentence_id linking to sentence
```

#### 4.2: Constraint Inherited on Branch
```
GIVEN: User creates branch from commit with constraints
WHEN: User creates new commit on branch
THEN: All parent constraints available
AND: User can add new constraints
AND: Commit includes both inherited and new
```

#### 4.3: Constraints Merged
```
GIVEN: Main has constraints [c1, c2]
AND: Feature has constraints [c1, c3]  // c1 shared, c2 only main, c3 only feature
WHEN: Merge executed
THEN: Merged commit has [c1, c2, c3]  // Union
AND: No duplicates
```

#### 4.4: Constraint Validated at Leaf Time
```
GIVEN: Commit has REQUIRE "$5,000" (exact)
WHEN: Leaf generates output without "$5,000"
THEN: Validation fails
AND: Error message shows expected vs actual
AND: User can regenerate or override
```

#### 4.5: EXCLUDE Constraint Works
```
GIVEN: Commit has EXCLUDE "CompetitorX"
WHEN: Leaf generates output mentioning "CompetitorX"
THEN: Validation fails
AND: Error shows the forbidden term was found
```

---

## Manual Test Checklist

### Pre-Flight Checks
- [ ] API server running (`pnpm dev:api`)
- [ ] WebUI running (`pnpm dev:webui`)
- [ ] Database accessible
- [ ] LLM API key configured (for leaf generation)

### Scenario 1: Basic Flow
- [ ] Create project
- [ ] Create conversation
- [ ] Add 4+ turns
- [ ] Review extracted sentences
- [ ] Confirm anchors as constraints
- [ ] Add EXCLUDE constraint manually
- [ ] Commit changes
- [ ] Verify commit on canvas
- [ ] Verify commit locked (can't delete)

### Scenario 2: Leaf Generation
- [ ] Select committed commit
- [ ] Open leaf panel
- [ ] Choose leaf type (Twitter)
- [ ] Configure options
- [ ] Generate output
- [ ] Verify constraints validated
- [ ] Test failed constraint scenario
- [ ] Save leaf
- [ ] Verify lineage

### Scenario 3: Branch & Merge
- [ ] Create branch from commit
- [ ] Make changes on branch
- [ ] Create commit on branch
- [ ] Update main (diverge)
- [ ] Initiate merge
- [ ] Verify diff categories
- [ ] Resolve conflicts
- [ ] Execute merge
- [ ] Verify merge commit
- [ ] Verify two parents

### Scenario 4: Constraint Preservation
- [ ] Verify constraint in initial commit
- [ ] Verify constraint inherited on branch
- [ ] Verify constraints merged
- [ ] Verify REQUIRE validation
- [ ] Verify EXCLUDE validation

---

## Automated Test Specifications

### Integration Test Suite

```typescript
// apps/api/src/__tests__/e2e/complete-flow.test.ts

describe('E2E: Complete T3X Flow', () => {
  let db: TestDB;
  let projectId: string;
  let conversationId: string;
  let commitHash: string;
  let branchCommitHash: string;
  let mergeCommitHash: string;

  beforeAll(async () => {
    db = await setupTestDB();
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Step 1: Project & Conversation', () => {
    it('creates a project', async () => {
      const res = await api.post('/v1/projects', {
        name: 'E2E Test Project'
      });
      expect(res.success).toBe(true);
      expect(res.data.project_id).toMatch(/^proj_/);
      projectId = res.data.project_id;
    });

    it('creates a conversation', async () => {
      const res = await api.post('/v1/conversations', {
        project_id: projectId,
        title: 'Test Conversation'
      });
      expect(res.success).toBe(true);
      conversationId = res.data.conversation_id;
    });

    it('adds turns with hash chain', async () => {
      const turns = [
        { role: 'user', content: 'What is the price?' },
        { role: 'assistant', content: 'The price is $5,000 per month.' },
      ];

      let parentHash = null;
      for (const turn of turns) {
        const res = await api.post('/v1/turns', {
          project_id: projectId,
          conversation_id: conversationId,
          parent_turn_hash: parentHash,
          ...turn
        });
        expect(res.success).toBe(true);
        expect(res.data.turn_hash).toMatch(/^sha256:/);
        parentHash = res.data.turn_hash;
      }
    });
  });

  describe('Step 2: Commit', () => {
    it('creates commit with sentences and constraints', async () => {
      const res = await api.post('/v1/commits-v3', {
        project_id: projectId,
        branch: 'main',
        message: 'Initial commit',
        content: {
          sentences: [
            { id: 's1', text: 'The price is $5,000 per month.', confidence: 0.95, source: { turn_hash: 'sha256:...', start_char: 0, end_char: 30 } }
          ],
          constraints: [
            { type: 'require', id: 'c1', value: '$5,000', match: 'exact', source_sentence_id: 's1' }
          ]
        },
        author: { name: 'Test', verification: 'none' }
      });

      expect(res.success).toBe(true);
      expect(res.data.hash).toMatch(/^sha256:/);
      commitHash = res.data.hash;
    });

    it('commit hash is deterministic', async () => {
      // Recreate with same content should give same hash
      const hash = computeCommitHash({
        schema: 'commit/v3',
        parents: [],
        content: { sentences: [...], constraints: [...] },
        author: { name: 'Test', verification: 'none' },
        committed_at: '...'
      });
      expect(hash).toBe(commitHash);
    });
  });

  describe('Step 3: Branch', () => {
    it('creates branch from commit', async () => {
      const res = await api.post('/v1/branches', {
        project_id: projectId,
        name: 'feature/test',
        parent_branch: 'main',
        head_commit_hash: commitHash
      });
      expect(res.success).toBe(true);
    });

    it('creates commit on branch with parent', async () => {
      const res = await api.post('/v1/commits-v3', {
        project_id: projectId,
        branch: 'feature/test',
        parents: [commitHash],
        message: 'Branch commit',
        content: {
          sentences: [
            { id: 's1', text: 'The price is $5,000 per month.', confidence: 0.95, source: {...} },
            { id: 's2', text: 'Enterprise is $10,000 per month.', confidence: 0.95, source: {...} }
          ],
          constraints: [
            { type: 'require', id: 'c1', value: '$5,000', match: 'exact' },
            { type: 'require', id: 'c2', value: '$10,000', match: 'exact' }
          ]
        },
        author: { name: 'Test', verification: 'none' }
      });

      expect(res.success).toBe(true);
      expect(res.data.parents).toContain(commitHash);
      branchCommitHash = res.data.hash;
    });
  });

  describe('Step 4: Merge', () => {
    it('prepares merge with diff', async () => {
      const res = await api.post('/v1/merge/prepare', {
        project_id: projectId,
        source_hash: branchCommitHash,
        target_hash: commitHash
      });

      expect(res.success).toBe(true);
      expect(res.data.identical).toBeDefined();
      expect(res.data.similar).toBeDefined();
      expect(res.data.onlyInSource).toBeDefined();
      expect(res.data.onlyInTarget).toBeDefined();
    });

    it('executes merge with resolutions', async () => {
      const res = await api.post('/v1/merge/execute', {
        project_id: projectId,
        source_hash: branchCommitHash,
        target_hash: commitHash,
        resolutions: {
          similar: [],
          onlyInSource: [{ sentenceId: 's2', keep: true }],
          onlyInTarget: []
        },
        message: 'Merge feature/test into main',
        branch: 'main'
      });

      expect(res.success).toBe(true);
      expect(res.data.parents).toHaveLength(2);
      expect(res.data.parents).toContain(commitHash);
      expect(res.data.parents).toContain(branchCommitHash);
      mergeCommitHash = res.data.hash;
    });

    it('merge commit has combined content', async () => {
      const commit = await api.get(`/v1/commits-v3/${mergeCommitHash}`);
      expect(commit.data.content.sentences).toHaveLength(2);
      expect(commit.data.content.constraints).toHaveLength(2);
    });
  });

  describe('Step 5: Leaf Generation', () => {
    it('generates leaf from commit', async () => {
      const res = await api.post('/v1/leaves', {
        commitHash: mergeCommitHash,
        type: 'twitter',
        config: {
          instructions: 'Be concise',
          maxLength: 280
        }
      });

      expect(res.success).toBe(true);
      expect(res.data.output).toBeDefined();
      expect(res.data.constraintResults).toBeDefined();
    });

    it('validates REQUIRE constraints', async () => {
      const res = await api.post('/v1/leaves', {
        commitHash: mergeCommitHash,
        type: 'article',
        config: {}
      });

      // Check that $5,000 and $10,000 requirements are validated
      const requireResults = res.data.constraintResults.filter(
        r => r.constraint.type === 'require'
      );
      expect(requireResults.length).toBeGreaterThan(0);
    });
  });
});
```

### Canvas Store E2E Tests

```typescript
// apps/web/src/__tests__/e2e/canvas-flow.test.ts

describe('E2E: Canvas Flow', () => {
  let store: CanvasStore;

  beforeEach(() => {
    store = createCanvasStore();
  });

  it('complete flow: conversation → commit → branch → merge', async () => {
    // 1. Add conversation
    const unitId = store.addUnitNode({ title: 'Test' });
    expect(store.getNode(unitId)?.data.commitStatus).toBe('staging');

    // 2. Commit
    await store.commitPendingCommit(unitId, {
      message: 'Initial',
      branch: 'main'
    });
    expect(store.getNode(unitId)?.data.commitStatus).toBe('committed');
    expect(store.getNode(unitId)?.data.commitHash).toMatch(/^sha256:/);

    // 3. Create branch and new commit
    const branchUnitId = store.addUnitFromUnit(unitId);
    store.setBranchForUnit(branchUnitId, 'feature/test');
    await store.commitPendingCommit(branchUnitId, {
      message: 'Branch commit',
      branch: 'feature/test'
    });

    // 4. Merge
    const mergeDraftId = await store.createMergePendingCommit(branchUnitId);
    expect(mergeDraftId).toBeDefined();

    // 5. Resolve and execute
    await store.executeMerge(mergeDraftId, {
      message: 'Merge',
      resolutions: {}
    });

    // 6. Verify merge commit exists
    const mergeNode = store.nodes.find(n => n.data.isMergeCommit);
    expect(mergeNode).toBeDefined();
  });
});
```

---

## Test Data Fixtures

### Sample Conversation

```typescript
export const sampleConversation = {
  turns: [
    { role: 'user', content: 'What is the service fee?' },
    { role: 'assistant', content: 'The service fee is $5,000 per month, payable within 30 days of invoice.' },
    { role: 'user', content: 'Is there a refund policy?' },
    { role: 'assistant', content: 'Yes, we offer a 30-day money-back guarantee for all new customers.' },
    { role: 'user', content: 'What payment methods do you accept?' },
    { role: 'assistant', content: 'We accept bank transfer and all major credit cards.' }
  ]
};
```

### Sample Commit

```typescript
export const sampleCommit = {
  schema: 'commit/v3',
  branch: 'main',
  message: 'Initial payment terms',
  content: {
    sentences: [
      { id: 's1', text: 'The service fee is $5,000 per month, payable within 30 days of invoice.', confidence: 0.95 },
      { id: 's2', text: 'We offer a 30-day money-back guarantee for all new customers.', confidence: 0.92 },
      { id: 's3', text: 'We accept bank transfer and all major credit cards.', confidence: 0.90 }
    ],
    constraints: [
      { type: 'require', id: 'c1', value: '$5,000', match: 'exact', source_sentence_id: 's1' },
      { type: 'require', id: 'c2', value: '30 days', match: 'exact', source_sentence_id: 's1' },
      { type: 'require', id: 'c3', value: '30-day money-back guarantee', match: 'semantic', source_sentence_id: 's2' },
      { type: 'exclude', id: 'c4', value: 'CompetitorX', match: 'semantic' }
    ]
  },
  author: { name: 'Alice', verification: 'none' }
};
```

### Sample Branch Commit

```typescript
export const sampleBranchCommit = {
  ...sampleCommit,
  branch: 'feature/enterprise',
  message: 'Add enterprise pricing',
  content: {
    sentences: [
      ...sampleCommit.content.sentences,
      { id: 's4', text: 'Enterprise pricing is $10,000 per month with dedicated support.', confidence: 0.95 }
    ],
    constraints: [
      ...sampleCommit.content.constraints,
      { type: 'require', id: 'c5', value: '$10,000', match: 'exact', source_sentence_id: 's4' }
    ]
  }
};
```

---

## Success Criteria

### Overall E2E Success

| Criteria | Requirement |
|----------|-------------|
| All scenarios pass | 100% |
| No data corruption | Hash chains valid |
| Lineage traceable | Every output → source |
| Constraints preserved | Through entire flow |
| UI reflects state | Real-time updates |

### Per-Scenario Success

#### Scenario 1: Basic Flow
- [ ] Project created with valid ID
- [ ] Conversation linked to project
- [ ] Turns form valid hash chain
- [ ] Sentences extracted correctly
- [ ] Commit hash is deterministic
- [ ] Canvas updates correctly

#### Scenario 2: Leaf Generation
- [ ] Leaf created from commit
- [ ] Output generated by LLM
- [ ] All constraints validated
- [ ] Failed constraints show clear errors
- [ ] Lineage is traceable

#### Scenario 3: Branch & Merge
- [ ] Branch created successfully
- [ ] Branch commit has correct parent
- [ ] Merge diff categorizes correctly
- [ ] Conflict resolution works
- [ ] Merge commit has two parents
- [ ] Merged content is correct

#### Scenario 4: Constraint Preservation
- [ ] Constraints stored in commit
- [ ] Constraints inherited on branch
- [ ] Constraints merged correctly
- [ ] REQUIRE validated at leaf time
- [ ] EXCLUDE validated at leaf time

---

## Appendix: Test Environment Setup

### Prerequisites

```bash
# Install dependencies
pnpm install

# Start services
pnpm dev:api    # Port 8000
pnpm dev:webui  # Port 3000

# Or use Docker
docker compose up -d
```

### Environment Variables

```bash
# .env.test
DATABASE_URL=postgresql://localhost:5432/t3x_test
ANTHROPIC_API_KEY=sk-test-xxx  # For leaf generation tests
```

### Running Tests

```bash
# Unit tests
pnpm test

# Specific test file
pnpm test:api -- --run src/__tests__/e2e/complete-flow.test.ts

# With coverage
pnpm test -- --coverage
```

---

*E2E Test Plan created January 2025. Covers complete T3X flow validation.*
