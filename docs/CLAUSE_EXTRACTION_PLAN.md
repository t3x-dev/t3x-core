# Clause Extraction Pipeline Plan

> Implementation plan for "Bridge as filter, preference as boost" architecture

## User Goal

- Conversations in WebUI canvas with all text saved and hashed
- Commit process grabs conversation history
- Compare cosine similarity between clauses and bridge template + user preference to extract relevant clauses

---

## Current Architecture Assessment

### Stable Components

| Layer | Status | Files |
|-------|--------|-------|
| Hash chains | ✅ Stable | `t3x-core/src/storage/utils.ts:48-69` |
| Storage (PostgreSQL/JSONL) | ✅ Stable | `t3x-storage/src/schema.ts:45-81` |
| Ring extraction | ✅ Stable | `t3x-core/src/extractors/ringExtractor.ts` |
| Turn window commits | ✅ Stable | `t3x-storage/src/queries/turns.ts:185-212` |
| Embedding/cosine | ⚠️ Partial | `t3x-core/src/providers/embedding/base.ts` |
| WebUI canvas chat | ✅ Acceptable | Modal-based (confirmed OK) |

### Hash Chain Implementation

```typescript
turn_hash = SHA256(JCS({
  parent_turn_hash, project_id, conversation_id, role,
  content, language, rings_json, created_at, schema_version
}))
```

### Ring Extraction (Deterministic, No LLM)

| Ring | Extracts |
|------|----------|
| Ring 1 | Keywords, polarity, entities, time anchors |
| Ring 2 | Intent seed, facets, preferences |
| Ring 3 | Sentence segments with char offsets |

---

## Recommended Design: Bridge + Intent Clause Extraction

### Architecture: "Bridge as filter, preference as boost"

```
1. Clause Extraction (Ring 3)
   - NLP segments from turns in window
   - Each segment embedded via EmbeddingProvider

2. Bridge Filtering
   - Embed bridge template (e.g., /plan, /summary)
   - cosine(clause_embedding, bridge_embedding) >= threshold (0.70)
   - Output: clauses relevant to bridge type

3. Intent Ranking
   - Embed user intent string
   - cosine(clause_embedding, intent_embedding) → boost score
   - Rank filtered clauses by combined score

4. Manual Override
   - User can add/remove clauses freely
   - Final selection stored with provenance
```

### Why This Design

1. **Separation of concerns**: Bridge = output type, Intent = topic focus
2. **Deterministic core**: All filtering/ranking via embedding+cosine
3. **User agency**: Manual override as final step
4. **Tunable thresholds**: Bridge and intent thresholds independent

---

## Implementation Plan

### Phase 1: Bridge Infrastructure (t3x-core)

**New files:**
- `t3x-core/src/bridges/types.ts` - BridgeTemplate, BridgeEmbedding interfaces
- `t3x-core/src/bridges/loader.ts` - Load YAML templates, compute/cache embeddings
- `t3x-core/src/bridges/index.ts` - Exports

```typescript
interface BridgeTemplate {
  bridge: string;       // 'plan' | 'summary' | 'explain' | 'clarify'
  label: string;
  threshold: number;    // Default: 0.60
  description: string;  // Used for embedding
  prompt: string;
}
```

### Phase 2: Clause Selection Engine (t3x-core)

**New files:**
- `t3x-core/src/clause/types.ts` - Clause, ScoredClause, ClauseSelectionRequest
- `t3x-core/src/clause/selector.ts` - ClauseSelector class
- `t3x-core/src/clause/index.ts` - Exports

**Algorithm:**
```
1. Get bridge embedding from cache
2. For each Ring 3 clause:
   - bridgeScore = cosine(clause_embedding, bridge_embedding)
   - boost = count(must_have in clause) / len(must_have)
   - penalty = count(mustnt_have in clause) / len(mustnt_have)
   - finalScore = bridgeScore * (1 + 0.3*boost - 0.3*penalty)
3. Filter: finalScore >= threshold
4. Sort by finalScore descending
5. Mark autoSelected = true for filtered clauses
```

### Phase 3: Storage Updates (t3x-storage)

**Modify:** `t3x-storage/src/schema.ts`
- Add `bridge_embeddings` table (cache)
- Add `clause_provenance` table (tracking)

**New files:**
- `t3x-storage/src/queries/bridgeEmbeddings.ts` - CRUD for bridge embeddings

### Phase 4: API Endpoints (t3x-webui)

**New files:**
- `t3x-webui/src/app/api/v1/clauses/select/route.ts`
  ```
  POST /api/v1/clauses/select
  Body: { project_id, turn_window, bridge_id, user_intent?, must_have?, mustnt_have? }
  Response: { clauses: ScoredClause[], threshold, stats }
  ```
- `t3x-webui/src/app/api/v1/bridges/route.ts`
  ```
  GET /api/v1/bridges
  Response: { bridges: [{ id, label, threshold, description }] }
  ```

**Modify:** `t3x-webui/src/lib/api.ts`
- Add `selectClauses()` and `listBridges()` functions

### Phase 5: WebUI Components

**New files:**
- `t3x-webui/src/components/ClausePicker.tsx` - Bridge selector + clause list
- `t3x-webui/src/components/ClauseItem.tsx` - Single clause with score bar + toggle

**Modify:** `t3x-webui/src/components/NodeModal.tsx`
- Add bridge selector state
- Call clause selection API when building pending commit
- Integrate ClausePicker below text block

### Phase 6: Testing

- `t3x-core/src/__tests__/clause/selector.test.ts` - Determinism, scoring, filtering
- `t3x-core/src/__tests__/bridges/loader.test.ts` - YAML loading, embedding cache
- `t3x-storage/src/__tests__/bridgeEmbeddings.test.ts` - DB operations
- `t3x-webui/src/__tests__/api/clauses.test.ts` - API endpoint tests

---

## Implementation Order

```
Phase 1 (bridges) ──┐
                    ├──► Phase 4 (API) ──► Phase 5 (WebUI)
Phase 2 (clause) ───┤
                    │
Phase 3 (storage) ──┘

Phase 6 (tests) - incremental throughout
```

---

## Critical Files Summary

| File | Purpose |
|------|---------|
| `t3x-core/src/clause/selector.ts` | Core algorithm |
| `t3x-core/src/bridges/loader.ts` | Bridge template + embedding cache |
| `t3x-webui/src/app/api/v1/clauses/select/route.ts` | API endpoint |
| `t3x-webui/src/components/ClausePicker.tsx` | UI component |
| `t3x-storage/src/schema.ts` | New tables |
