# Simplify LLM Extraction — Design Spec

**Goal:** Maximize extraction recall by making the LLM's job simpler (just extract everything) and moving all quality control to code. Reduce MeaningPipeline from 6 LLM agents to 2.

**Problem:** Current extraction produces sparse results (e.g., 2 slots from a rich Beijing trip conversation) because:
1. Verbatim quote requirement causes LLM to skip data it can't quote exactly
2. MeaningPipeline LLM agents (reviewer, contradiction_checker, slot_polisher) remove/modify extracted data
3. 7 LLM calls per extraction (1 extract + 6 post-process) = slow + expensive + data loss

**Principle:** LLM does extraction (high recall), code does quality control (high precision).

---

## Changes

### 1. Prompt Changes (`yopsPrompt.ts`)

**Current:** "source: VERBATIM quote from the conversation (copy-paste, not paraphrase)"

**New:** Relax to keyword-level quoting. LLM provides the closest matching text from the conversation. Code validates afterwards with fuzzy matching.

Update system prompt:
- Replace "VERBATIM copy-paste" with "closest matching text from the conversation — a few key words are enough"
- Add explicit instruction: "Extract MORE rather than less. Code will clean up duplicates and validate quotes."
- Keep the `from: T1` turn tag requirement (this is cheap and useful)
- Keep snake_case keys, clean values (not full sentences)

**User prompt (first extraction):** Add emphasis:
```
Extract ALL knowledge — every fact, number, list item, recommendation, and detail.
Do NOT skip information because you're unsure about quoting.
A short keyword quote is better than skipping the data entirely.
```

### 2. Extractor Changes (`extractor.ts`)

- `MAX_TOKENS`: 4096 → 8192 (complex conversations produce long YAML)
- No other changes to the extractor orchestration

### 3. MeaningPipeline Changes (`createMeaningPipeline.ts`)

Remove 4 LLM agents, keep 2 LLM + 6 CODE:

**Keep (unchanged):**
- `output_regulator` (CODE) — consolidate duplicates
- `nester` (CODE) — build tree structure
- `topic_namer` (LLM) — name root topic on first extraction
- `coverage_checker` (LLM) — verify all user points captured, auto-add missing
- `regression_checker` (CODE) — detect content loss
- `structural_validator` (CODE) — validate integrity
- `source_trace_validator` (CODE) — validate source refs

**Remove entirely:**
- `topic_evolver` (LLM) — code uses root tree key directly
- `slot_polisher` (LLM) — unnecessary beautification, LLM can produce clean keys directly
- `reviewer` (LLM) — biggest "data remover", quality is now code-enforced

**Convert to code-only:**
- `dedup_checker`: Replace LLM semantic dedup with code-based exact key matching + slot value similarity (Jaccard on string tokens). Only merge nodes with identical keys or >80% slot overlap.
- `contradiction_checker`: Replace LLM contradiction detection with code-based keyword scan. When user says "no X" / "avoid X" / "allergic to X", flag matching slots with `{ _conflict: true }` metadata — but NEVER delete them. Let the user decide in triage.

### 4. New: Fuzzy Quote Validator (CODE agent, added to pipeline)

After extraction, before other agents:
- For each slot's `source` quote, check if it appears in the conversation (case-insensitive substring or token overlap > 50%)
- If quote doesn't match any turn: set `confidence: 0.3` on that slot (low but not removed)
- If quote matches: keep original confidence
- This replaces the strict "no quote = no extraction" rule

### 5. Pipeline Agent Order (new)

```
1. output_regulator      (CODE) — consolidate duplicate frame types
2. fuzzy_quote_validator  (CODE) — validate source quotes, adjust confidence  [NEW]
3. code_dedup_checker     (CODE) — exact key + slot similarity dedup         [CHANGED from LLM]
4. nester                 (CODE) — build nested tree
5. topic_namer            (LLM)  — name root topic (first extraction only)
6. coverage_checker       (LLM)  — verify coverage, auto-add missing
7. code_contradiction     (CODE) — flag (not delete) contradicting slots     [CHANGED from LLM]
8. regression_checker     (CODE) — detect content loss
9. structural_validator   (CODE) — validate structural integrity
10. source_trace_validator (CODE) — validate source references
```

Result: 10 agents (8 CODE + 2 LLM), down from 12 agents (6 CODE + 6 LLM).

### 6. What This Does NOT Change

- YOps engine (`applyYOps`) — unchanged
- YOps parser (`yopsParser.ts`) — unchanged
- Extractor orchestration flow — unchanged (just higher MAX_TOKENS)
- API pipeline structure (`extraction-pipeline.ts`) — unchanged
- GateRunner validation — unchanged
- AmbiguityDetector — unchanged
- DriftDetector — unchanged
- ReadinessGate / SessionStateManager — unchanged

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| LLM calls per extraction | 7 (1+6) | 3 (1+2) |
| Extraction recall | Low (2 slots from rich conversation) | High (all facts captured) |
| Data loss from pipeline | High (reviewer/contradiction delete nodes) | None (code flags, never deletes) |
| Extraction speed | Slow (7 LLM roundtrips) | ~3x faster |
| API cost | High | ~60% reduction |

---

## Files to Change

| File | Change |
|------|--------|
| `packages/core/src/extractors/yopsPrompt.ts` | Relax quote requirement, strengthen "extract everything" |
| `packages/core/src/extractors/extractor.ts` | MAX_TOKENS 4096 → 8192 |
| `packages/core/src/extractors/createMeaningPipeline.ts` | Remove 4 agents, add 2 new CODE agents |
| `packages/core/src/extractors/agents/dedupCheckerAgent.ts` | Rewrite as CODE-only (exact key + Jaccard) |
| `packages/core/src/extractors/agents/contradictionCheckerAgent.ts` | Rewrite as CODE-only (keyword flag, no delete) |
| `packages/core/src/extractors/agents/fuzzyQuoteValidator.ts` | New CODE agent |
| `packages/core/src/extractors/agents/index.ts` | Update exports |

**Files to delete (or mark deprecated):**
- `packages/core/src/extractors/agents/slotPolisherAgent.ts`
- `packages/core/src/extractors/agents/reviewerAgent.ts`
- `packages/core/src/extractors/agents/topicEvolverAgent.ts`
