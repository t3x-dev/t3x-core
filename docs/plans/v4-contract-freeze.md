# V4 Contract Freeze Notice

> **Effective**: 2026-01-23
> **Duration**: Until V4 E2E Run-Through phase complete
> **Status**: Active

---

## Purpose

This document establishes the contract freeze rules for the V4 E2E Run-Through parallel development phase. Following these rules prevents merge conflicts and ensures both tracks can work independently.

---

## Frozen Files

The following files are **FROZEN** during parallel development. Any changes require:

1. Developer identifies the need for change
2. Creates discussion issue or Slack/team channel message
3. **Both developers acknowledge** the proposed change
4. Single developer makes the change in a dedicated PR
5. Other developer rebases immediately after merge

### Type Definitions (packages/core)

| File | Purpose |
|------|---------|
| `packages/core/src/types/v4/index.ts` | V4 type exports |
| `packages/core/src/types/v4/commit.ts` | CommitV4 type definition |
| `packages/core/src/types/v4/leaf.ts` | Leaf type definition |
| `packages/core/src/types/v4/pin.ts` | Pin type definition |

### Database Schema (packages/storage)

| File | Purpose |
|------|---------|
| `packages/storage/src/schema-v4.ts` | V4 database schema (Drizzle) |

### API Contracts (apps/api)

| File | Purpose |
|------|---------|
| `apps/api/src/schemas/v4-contracts.ts` | API request/response schemas |

---

## File Ownership Matrix

| File/Directory | Track A (Backend) | Track B (Frontend) |
|----------------|-------------------|-------------------|
| `apps/api/src/routes/*.openapi.ts` | ✅ Primary | ❌ Read-only |
| `apps/api/src/__tests__/*.test.ts` | ✅ Primary | ❌ Read-only |
| `apps/api/src/lib/errors.ts` | ✅ Primary | ❌ Read-only |
| `apps/api/src/lib/context-formatter.ts` | ✅ Primary | ❌ Read-only |
| `packages/storage/src/queries/*.ts` | ✅ Primary | ❌ Do not touch |
| `apps/web/src/components/**` | ❌ Read-only | ✅ Primary |
| `apps/web/src/store/**` | ❌ Read-only | ✅ Primary |
| `apps/web/src/app/**` | ❌ Read-only | ✅ Primary |
| `apps/web/src/lib/api.ts` | ⚠️ Types only | ✅ Primary |
| `apps/web/src/__tests__/**` | ❌ Read-only | ✅ Primary |
| `docs/plans/*.md` | ⚠️ Coordinator | ⚠️ Coordinator |

### Legend

- ✅ **Primary**: This developer owns this file, can modify freely
- ❌ **Read-only**: Do not modify, reference only
- ⚠️ **Shared**: Coordinate before modifying

---

## Branch Strategy

```
main
 │
 └── feat/v4-e2e-runthrough          (Integration branch - Coordinator owns)
      │
      ├── feat/v4-e2e-track-a        (Backend developer)
      │
      └── feat/v4-e2e-track-b        (Frontend developer)
```

### Rules

1. Each track works on their own feature branch
2. PRs go to `feat/v4-e2e-runthrough` (NOT directly to main)
3. Coordinator merges both tracks into integration branch
4. **Rebase from integration branch at least once per day**
5. Final integration branch merges to main when phase complete

### Branch Commands

```bash
# Initial setup (run once)
git checkout main && git pull
git checkout -b feat/v4-e2e-runthrough
git push -u origin feat/v4-e2e-runthrough

# Backend developer
git checkout feat/v4-e2e-runthrough
git checkout -b feat/v4-e2e-track-a
git push -u origin feat/v4-e2e-track-a

# Frontend developer
git checkout feat/v4-e2e-runthrough
git checkout -b feat/v4-e2e-track-b
git push -u origin feat/v4-e2e-track-b

# Daily rebase (both developers)
git fetch origin
git rebase origin/feat/v4-e2e-runthrough
```

---

## Communication Protocol

### Daily Sync (5 minutes)

Each day, briefly share:
1. What I finished yesterday
2. What I'm working on today
3. Any blockers or contract changes needed

### Before Touching Shared Files

1. Announce in team channel: "I need to modify [file] because [reason]"
2. Wait for acknowledgment from other developer
3. Make change quickly in dedicated commit
4. Notify when PR is merged
5. Other developer rebases immediately

### Contract Change Request Process

If a frozen contract file needs modification:

1. Create issue titled: `Contract Change Request: [brief description]`
2. Add labels: `contract-change`, `v4`
3. Include in issue body:
   - Current behavior
   - Proposed change
   - Impact on Track A
   - Impact on Track B
4. Wait for both developers to approve
5. Single developer implements the change
6. Both developers rebase after merge

---

## Integration Checkpoints

| Checkpoint | Trigger | Verification |
|------------|---------|--------------|
| **CP1** | G1+G2 complete | Both developers agree on acceptance criteria |
| **CP2** | A1+B2 complete | API response shapes match frontend type expectations |
| **CP3** | A2+B1 complete | Error handling works end-to-end (API → UI toast) |
| **CP4** | All Phase 2.2 complete | Full integration test using runbook |

At each checkpoint:
1. Both developers sync their branches
2. Run full test suite: `pnpm test`
3. Manual verification of integration points
4. Document any issues found

---

## Conflict Resolution

If merge conflicts occur:

1. **Same file, different sections**: Resolve by keeping both changes
2. **Same file, same section**:
   - Identify which track "owns" the file
   - Owner's version takes precedence
   - Non-owner re-applies their changes on top
3. **Contract file conflict**: STOP - this shouldn't happen
   - Investigate why both touched frozen file
   - Revert one change
   - Follow contract change process

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│                  PARALLEL DEV RULES                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ DO:                                                 │
│  • Work on your assigned track branch                   │
│  • Rebase from integration branch daily                 │
│  • Communicate before touching shared files             │
│  • Run tests before every PR                            │
│                                                         │
│  ❌ DON'T:                                              │
│  • Modify frozen contract files alone                   │
│  • Push directly to main or integration branch          │
│  • Modify files owned by the other track                │
│  • Skip daily rebase                                    │
│                                                         │
│  ⚠️ IF CONFLICT:                                        │
│  • Stop and communicate                                 │
│  • File owner resolves                                  │
│  • Both rebase after resolution                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Sign-off

By signing below, developers agree to follow this contract freeze during the V4 E2E Run-Through phase.

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Backend Developer (Track A) | | | |
| Frontend Developer (Track B) | | | |
| Coordinator | | | |
