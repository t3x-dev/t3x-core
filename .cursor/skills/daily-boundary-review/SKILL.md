---
name: daily-boundary-review
description: Daily read-only review of T3X repository boundaries and contracts. Use when the daily boundary automation runs.
disable-model-invocation: true
---

# Daily boundary review

Read `.cursor/skills/daily-review-memory/SKILL.md` and follow its record, silence, and comment rules. This lane's section is `boundary`.

## Automation prompt

```text
Run the daily boundary review for t3x-dev/t3x-core on the dev branch.
Read and follow .cursor/skills/daily-boundary-review/SKILL.md.
Use the Memories tool. Do not edit code, open a pull request, or merge.
```

## Automation settings

- Trigger: daily, `0 8 * * *` UTC.
- Repository: `t3x-dev/t3x-core`, branch `dev`.
- Tools: Memories on. Computer use off. Pull request creation off.
- Model: whichever review model is selected for the automation.

## Checks

Run only these commands. Quote their result. Do not replace them with a prose review.

```bash
pnpm check:architecture-inventory
pnpm check:release-surface
```

Then run the contract tests that lock the writer inventory, the conversation-contract inventory, and the transition control-plane ledger:

```bash
pnpm --filter @t3x-dev/api exec vitest run \
  src/__tests__/contracts/repository-writer-inventory.test.ts \
  src/__tests__/contracts/conversation-contract-inventory.test.ts \
  src/__tests__/contracts/transition-control-plane-migration.test.ts \
  src/__tests__/contracts/repository-convergence-proof.test.ts
```

If a listed test file is absent, record `blocked` for that file and continue with the commands that exist.

## What a delta is

A delta is a failing command, or a contract ledger that changed on `dev` since `last_run` while its test was not run. Record the command or test name as `evidence`.

These ledgers are the boundary:

- `packages/api/contracts/repository-writer-inventory.json`
- `packages/api/contracts/conversation-contract-inventory.json`
- `packages/api/contracts/repository-convergence-proof.json`
- `RELEASE.md`
- `release/surface.yaml`

Do not propose a new protocol noun, a second writer, or a release-surface change.
