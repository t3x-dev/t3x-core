# T3X Product Demo Script v2 (Investor Version)

> **Core improvement**: Through multi-version demo data, let investors see the version iteration capability of "Git for Meaning" firsthand
>
> Target audience: Non-technical decision makers
> Demo duration: 15-20 minutes
> Core message: T3X makes enterprise AI knowledge management like Git manages code — traceable, comparable, rollbackable

---

## Demo Data Preparation (Important!)

### Scenario: Three Iterations of E-commerce Return Policy

To help investors feel the value of "version control," we need to prepare a **dataset with a story**:

```
Timeline:
Day 1  → v1: Standard return policy (30 days)
Day 15 → v2: Double 11 promotion, changed to 60 days  ← A "trap" is planted here
Day 45 → v3: Promotion ends, changed back to 30 days, but discovered v2 has problems
```

### Data to Prepare

**Project**: `Return Policy Knowledge Base`

**Conversation 1**: Initial policy discussion (generates v1)
```
User: What is our standard return policy?
Assistant: The standard return policy is returns within 30 days of purchase, must maintain original packaging...
User: What about defective items?
Assistant: Defective items extend to 90 days, we cover shipping costs...
```

**Conversation 2**: Promotion policy discussion (generates v2, on feature/double11 branch)
```
User: Double 11 promotion coming up, can we extend the return period?
Assistant: Yes, recommend extending to 60 days. But note this only applies to items purchased during the promotion period...
User: OK, then 60 days. Also can we mention we're better than competitors?
Assistant: OK, our 60-day return period is longer than most competitors' 30 days...  ← This mentions competitors (violation!)
```

**Conversation 3**: Policy rollback discussion (generates v3, preparing to merge back to main)
```
User: Promotion is over, need to change back to 30 days
Assistant: OK, restoring standard 30-day policy...
User: Wait, I looked at v2's output, it seems to mention competitors?
Assistant: Yes, that version did have problems, we should...
```

**Commits**:
- `main` branch: v1 (hash: abc1234) → v3 (hash: ghi7890)
- `feature/double11` branch: branched from v1 → v2 (hash: def5678)

**Leaf**:
- Type: `email` (customer service email template)
- Constraints:
  - MUST HAVE: "30 days" or "60 days" (depending on version)
  - MUST NOT HAVE: "competitor" (no version should mention competitors)

---

## Demo Script

### Act 1: Opening - "AI Said Something Wrong" (2 minutes)

> **Purpose**: Create tension, make investors realize the severity of the problem

#### Script

> "Before the formal demo, I want to show everyone an 'incident scene.'
>
> This is a real case from one of our e-commerce clients (anonymized):
>
> Their AI customer service sent this email to customers during Double 11—"

**[Open a screenshot or document of the 'problematic' email]**

> "Look here: 'Our 60-day return period is longer than most **competitors'** 30 days...'
>
> What's the problem? **Mentioned competitors.**
>
> This is strictly prohibited in many companies — could involve unfair competition, could trigger legal disputes.
>
> By the time the client discovered this problem, over 2,000 emails had already been sent.
>
> They wanted to figure out three things:
>
> 1. **When was this error introduced?** — Which modification caused the problem?
> 2. **Can we quickly revert to the previous correct version?** — Stop the bleeding
> 3. **How do we prevent this from happening again?** — Build a defense
>
> Can traditional AI systems answer these questions? **No.**
>
> Because there's no version records, no change history, no constraint validation.
>
> But T3X can. Let me demonstrate."

---

### Act 2: Version History - "Tracing the Problem Source" (3 minutes)

> **Purpose**: Demonstrate commit history and diff functionality

#### Steps
1. Open project canvas `/project/[projectId]`
2. Click the problematic Commit node (v2)
3. Open right panel, click "View commit history"
4. Show three versions in the timeline

#### Script

> "This is T3X's project canvas. Each node represents a 'knowledge commit,' just like Git commits.
>
> **[Click v2 node, open details]**
>
> This is the problematic version — v2, the Double 11 promotion version.
>
> Look at the top right: branch is `feature/double11`, not `main`.
>
> This means this version was created on an **independent branch**, originally shouldn't affect the main workflow.
>
> But the problem is, this branch's content eventually got merged to production.
>
> **[Click View commit history]**
>
> Now let's look at version history."

**[Show CommitHistoryPanel]**

> "This is a timeline view, from top to bottom is newest to oldest.
>
> At the top is HEAD — current version, v3.
>
> In the middle is v2 — Double 11 version, **this is the version with problems**.
>
> At the bottom is v1 — the original standard policy version.
>
> **[Click v2, show diff]**
>
> I click v2, below it shows the **difference comparison** between this version and the previous version.
>
> Look here:
> - Green is added content
> - Red is deleted content
> - Yellow is modified content
>
> **[Point to specific diff]**
>
> Found it! Look at this sentence:
>
> 'Our 60-day return period is longer than most **competitors'** 30 days'
>
> This sentence was added in v2, and contains the word 'competitor.'
>
> **[Click View full diff, open fullscreen diff view]**
>
> Open the fullscreen comparison view for a clearer look.
>
> Left is v1 (original), right is v2 (problematic version).
>
> The system not only tells you which sentences changed, but precisely **which words changed** — red deleted, green added.
>
> **[Click pin icon on a sentence, show source tracing]**
>
> More importantly, I click this icon to see where this sentence **originally came from in which conversation**.
>
> Look, this is the conversation record from that time:
>
> User said: 'Can we mention we're better than competitors?'
>
> The AI assistant complied.
>
> **Problem found: This conversation introduced the error.**"

---

### Act 3: Constraint Validation - "Why Wasn't It Blocked?" (3 minutes)

> **Purpose**: Demonstrate Leaf's constraint mechanism, explain why it wasn't blocked this time, and how to prevent it next time

#### Steps
1. Return to canvas, click the associated Leaf node
2. Open Leaf details page
3. Show constraint configuration

#### Script

> "We know where the problem is, the next question is: **Why didn't the system automatically block this error?**
>
> **[Click Leaf node, open details]**
>
> This is the email template generated from v2.
>
> Look at the constraint configuration below:
>
> MUST HAVE:
> - '60 days' — must mention 60 days ✓ Satisfied
>
> MUST NOT HAVE:
> - (empty)
>
> **The problem is right here — 'must not mention competitors' constraint wasn't set.**
>
> **[Demonstrate adding constraint]**
>
> Now let me add this constraint:
>
> Click MUST NOT HAVE → Add → Enter 'competitor' → Match mode select 'Semantic'
>
> This way, whether AI writes 'competitor', 'rival', 'peer', or 'other companies', the system will recognize and block it.
>
> **[Click Re-validate]**
>
> Now re-validate the current content—
>
> Look, a red warning appeared: 'MUST NOT HAVE violation: competitor detected'
>
> **This is the fundamental difference between T3X and regular AI systems.**
>
> Regular systems are 'discover after the fact' — only know there's a problem when users complain.
>
> T3X is 'block beforehand' — after content is generated, before publishing, the system automatically validates, blocking anything that doesn't meet constraints."

---

### Act 4: Branch Merging - "Iterate Safely" (4 minutes)

> **Purpose**: Demonstrate merge workspace, this is the feature that best embodies "Git thinking"

#### Steps
1. Return to canvas
2. Demonstrate merging from `feature/double11` to `main` (if there's a merge entry)
3. Or open an existing merge workspace

#### Script

> "What we just covered was 'how to trace when problems occur.'
>
> Now let's talk about 'how to iterate safely and avoid problems.'
>
> **[Point to branch structure on canvas]**
>
> Look at this structure:
>
> `main` branch is the knowledge base used in production — standard 30-day return policy.
>
> `feature/double11` branch was created for the promotion — 60-day return policy.
>
> This is like Git branches in software development:
> - Main branch runs stably
> - Feature branches for experimentation
> - After successful experiments, merge back to main branch
>
> **Why do this?**
>
> Because promotion activities have risks — could have copy errors, policy loopholes, compliance violations.
>
> If you modify directly on main branch, once there's a problem, production is immediately affected.
>
> The benefit of branches is: **test in sandbox first, merge after no problems.**
>
> **[Open Merge Workspace]**
>
> Now the promotion is over, we want to merge some valuable content (like defective item policy improvements) back to main branch.
>
> Click 'Merge' to enter the merge workspace.
>
> **[Show Merge Workspace interface]**
>
> This interface has three areas:
>
> Top is **status bar**: Shows which branch merging to which branch, and how many conflicts remain unresolved.
>
> Middle is **conflict list**:
> - Green are 'identical' — both sides the same, automatically kept
> - Yellow are 'conflicting' — both sides different, needs manual decision
> - Blue are 'only on one side' — can choose to keep or discard
>
> Bottom is **preview area**: Shows the final merged result
>
> **[Demonstrate resolving a conflict]**
>
> Look at this conflict:
>
> Left (source): 'Return period extended to 60 days'
> Right (target): 'Standard return period is 30 days'
>
> The system even marks **exactly which words are different** — '60' vs '30'.
>
> Which should I choose? Promotion is over, should choose 'target' (30 days).
>
> **[Click target button]**
>
> Selected, conflict resolved.
>
> **[Point to preview area below]**
>
> Look at the preview below, updated in real-time — final version will contain '30 days'.
>
> **[If there's a 'competitor'-related conflict, emphasize this demo]**
>
> Look at this one:
>
> source has a sentence mentioning 'competitors.'
>
> I choose 'Discard' — discard, don't merge this sentence.
>
> **This is why branches + merging is so important.**
>
> You can experiment boldly on branches, carefully review when merging.
>
> Problematic content can be filtered out during merge, won't enter main branch."

---

### Act 5: Overview - "Enterprise-Grade Knowledge Governance" (2 minutes)

> **Purpose**: Raise perspective, show T3X's full picture as an enterprise platform

#### Steps
1. Open Insights page
2. Show knowledge cards from multiple projects

#### Script

> "Just now we looked at one project's details in depth.
>
> Now let's raise our perspective and see what T3X looks like as an enterprise platform.
>
> **[Open Insights page]**
>
> This is the Insights page — enterprise knowledge panoramic view.
>
> Each card represents a piece of structured knowledge:
> - Return policy
> - Shipping policy
> - Warranty terms
> - Brand voice guide
> - ...
>
> Each piece of knowledge shows:
> - Which project it belongs to
> - Which branch
> - How many pieces of supporting evidence
> - Last update time
>
> **[Point to different branch labels]**
>
> Look here, some are `main`, some are `feature/xxx`.
>
> At a glance you can see: which is officially effective knowledge, which is still experimental.
>
> **This is what enterprise-grade knowledge governance looks like.**
>
> Not scattered documents, not prompts with unclear versions, not changes where no one knows who made them.
>
> But rather:
> - Every piece of knowledge has a source
> - Every change has a record
> - Every version is traceable
> - Every output is verifiable"

---

### Act 6: Summary - "Git for Meaning" (2 minutes)

#### Script

> "Alright, that concludes the demo.
>
> Let me summarize T3X's core value.
>
> **[Hold up three fingers]**
>
> I opened with three problems with enterprise AI:
>
> **First, knowledge is untraceable.**
>
> T3X's solution: Every piece of knowledge has a commit hash, traceable to original conversation.
>
> Just like when you ask a programmer 'who wrote this line of code,' they can use `git blame` to find out.
>
> T3X lets you do the same: 'Which conversation said this? Who said it? When?'
>
> **Second, outputs are uncontrollable.**
>
> T3X's solution: Leaf constraint system — MUST HAVE, MUST NOT HAVE.
>
> Not 'hoping' AI complies, but automatic validation after generation, blocking non-compliance.
>
> **Third, iteration is unsustainable.**
>
> T3X's solution: Branches + merging + version history.
>
> Want to change? Open a branch first. Done changing? Merge review. Problems? Trace the diff.
>
> Every change has a record, every version can be compared.
>
> **[Pause]**
>
> One sentence summary:
>
> **T3X is 'Git for Meaning' — a semantic version control system.**
>
> Programmers use Git to manage code, enterprises use T3X to manage AI knowledge.
>
> This isn't a feature, this is a **paradigm shift**.
>
> Thank you everyone, questions are welcome."

---

## Demo Data Preparation Checklist

### Required Data

| Data Item | Quantity | Description |
|-----------|----------|-------------|
| Project | 1 | "Return Policy Knowledge Base" |
| Conversations | 3 | Source conversations for v1/v2/v3 |
| Commits | 3 | v1(main) → v2(feature/double11) → v3(main) |
| Branches | 2 | main, feature/double11 |
| Leaf | 1 | email type, with constraints |
| Merge Draft | 1 | Merge draft for feature/double11 → main (optional, for merge workspace demo) |

### Key Content

**v1 Commit content (main branch)**:
```
- Standard return policy allows returns within 30 days of purchase
- Electronics must maintain original packaging with all accessories
- Receipt or order confirmation required
- Return window for defective items extended to 90 days
- Company covers return shipping for confirmed defects
```

**v2 Commit content (feature/double11 branch)**:
```
- Double 11 promotion extends return period to 60 days
- Only applies to items purchased during promotion period
- Our 60-day return period is longer than most competitors' 30 days ← Problem sentence
- Defective items still enjoy 90-day return window
```

**v3 Commit content (main branch, after merge)**:
```
- Standard return policy allows returns within 30 days of purchase
- Electronics must maintain original packaging with all accessories
- Receipt or order confirmation required
- Return window for defective items extended to 90 days
- Company covers return shipping for confirmed defects
- (Removed competitor-related content)
```

**Leaf constraint configuration**:
```
MUST HAVE:
- "30 days" (exact match)
- "defective" (semantic match)

MUST NOT HAVE:
- "competitor" (semantic match) ← Added later
```

---

## Demo Checklist

### Before Demo

- [ ] Demo data prepared (3 commits, 2 branches)
- [ ] v2 commit actually contains "competitor"-related content
- [ ] Leaf's MUST NOT HAVE constraint **left empty initially** (add during demo)
- [ ] Commit history can display diff normally
- [ ] Merge workspace has demonstrable merge draft
- [ ] WebUI running normally, no loading lag

### During Demo

- [ ] Act 1: Show "incident," create tension
- [ ] Act 2: Use commit history + diff to trace problem
- [ ] Act 3: Explain constraint mechanism, demonstrate adding constraint
- [ ] Act 4: Demonstrate merge workspace, focus on conflict resolution
- [ ] Act 5: Insights overview, raise perspective
- [ ] Act 6: Summarize three problems, three solutions

### Key Demo Actions

1. **Diff comparison**: Must open fullscreen diff, show red-green comparison + source tracing
2. **Adding constraint**: Add MUST NOT HAVE on the spot, then Re-validate shows red warning
3. **Merge conflict**: Show source vs target selection process, especially word-level diff
4. **Discard problematic content**: Demonstrate Discard on the sentence containing "competitor"

---

## Alternative Demo Routes

If time is tight (10-minute version):

```
Opening (1min) → Diff tracing (3min) → Constraint validation (3min) → Summary (3min)
```

Skip: Merge workspace, Insights overview

If investors are interested in technology (extended version):

```
Basic demo (15min) → Technical architecture explanation (5min) → Live Q&A (10min)
```

Technical explanation content:
- Three-layer architecture (Core / Storage / Agentic)
- Deterministic algorithms vs LLM
- Hash chain data integrity
- Embedding semantic matching

---

*Last updated: 2026-02-04*
