# V4 Parallel Development Guidelines

> Guidelines for parallel development of V4 features (Track A: Merge V4, Track B: Leaf Generate + WebUI)

---

## Contract Files (Do NOT modify without coordination)

| File | Purpose | Owner |
|------|---------|-------|
| `packages/core/src/types/v4/index.ts` | TypeScript types | Shared |
| `packages/storage/src/schema-v4.ts` | Database schema | Shared |
| `apps/api/src/schemas/v4-contracts.ts` | API contracts | Shared |

**Rule: Contract = Law, Implementation = Freedom**

- Implement according to contracts freely
- Do NOT modify contract files without team agreement
- If contract needs change: discuss first, modify together, both review PR

---

## Track Assignment

### Track A: Merge V4

**New files (owned by Track A):**
- `packages/core/src/merge/prepareMergeV4.ts`
- `packages/core/src/merge/executeMergeV4.ts`
- `apps/api/src/routes/merge-v4.openapi.ts`
- `apps/api/src/__tests__/merge-v4.test.ts`

### Track B: Leaf Generate + WebUI

**Files to modify (owned by Track B):**
- `apps/api/src/routes/leaves.openapi.ts` (add generate/validate)
- `apps/web/src/components/leaf/*`
- `apps/web/src/store/leafStore.ts` (if needed)

---

## Branching Strategy

- Track A: `feat/merge-v4`
- Track B: `feat/leaf-generate`
- Both branch from `main` after this issue is merged
- Rebase on `main` daily to catch conflicts early

---

## Merge Order

1. Merge Track A first (Merge V4 is foundational)
2. Track B rebases on updated main
3. Merge Track B
4. Integration testing

---

## Import Rules

```typescript
// CORRECT: Import from @t3x/core
import { CommitV4, Leaf, Pin, Constraint, MergeV4Result } from '@t3x/core';

// WRONG: Redefine types locally
interface Leaf { ... }  // DON'T DO THIS
```

---

## Naming Conventions

| Layer | Convention | Example |
|-------|------------|---------|
| TypeScript types | snake_case | `commit_hash`, `selected_pin_ids` |
| DB columns | snake_case | `commit_hash`, `selected_pin_ids` |
| API JSON | snake_case | `{ "commit_hash": "..." }` |
| JS variables | camelCase | `const commitHash = ...` |

---

## ID Prefixes

| Entity | Prefix | Example |
|--------|--------|---------|
| Sentence | `s_` | `s_abc123` |
| Constraint | `cst_` | `cst_def456` |
| Assertion | `ast_` | `ast_ghi789` |
| Leaf | `leaf_` | `leaf_jkl012` |
| Pin | `pin_` | `pin_mno345` |

---

## V4 Architecture Summary

```
CommitV4 = Sentences only (pure knowledge, NO constraints)
Leaf = Constraints + Output + Validation (application layer)
Pin = Source selection (for commit sources + conversation context)
```

---

## Acceptance Criteria

- [ ] Merge V4 types added to `packages/core/src/types/v4/index.ts`
- [ ] Merge V4 API schemas added to `apps/api/src/schemas/v4-contracts.ts`
- [ ] Core package exports updated in `packages/core/src/index.ts`
- [ ] TypeScript compilation passes (`pnpm build:core`)
- [ ] This guidelines document created
- [ ] PR reviewed and merged to main

---

## Communication

- Before modifying any contract file, post in team channel
- Daily sync on progress and blockers
- If you encounter a contract limitation, discuss before working around it
