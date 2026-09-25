---
name: daily-memory-contract-review
description: Daily read-only check that T3X conversation memory still has one response shape. Use when the daily memory-contract automation runs.
disable-model-invocation: true
---

# Daily memory-contract review

Read `.cursor/skills/daily-review-memory/SKILL.md` and follow its record, silence, and comment rules. This lane's section is `memory-contract`.

## Automation prompt

```text
Run the daily memory-contract review for t3x-dev/t3x-core on the dev branch.
Read and follow .cursor/skills/daily-memory-contract-review/SKILL.md.
Use the Memories tool. Do not edit code, invent a memory schema, open a pull request, or merge.
```

## Automation settings

- Trigger: daily, `0 9 * * *` UTC.
- Repository: `t3x-dev/t3x-core`, branch `dev`.
- Tools: Memories on. Computer use off. Pull request creation off.
- Model: whichever review model is selected for the automation.

## The object

`GetConversationMemoryResponse` in `packages/api/src/schemas/contracts.ts` is the only memory shape. It is `text`, `token_estimate`, and `sources` of `{ type, id, title? }`. Generation may place `text` into a system message. Replay, Decide, and Commit do not read this object and do not call a model.

Known readers of `GET /v1/conversations/:id/memory`:

- `packages/api/src/schemas/contracts.ts` defines the response.
- `apps/web/src/infrastructure/pins.ts` expects `BuiltContext`.
- `apps/web/src/infrastructure/conversations.ts` `getConversationMemoryText` expects `{ text }` only.
- `packages/api/src/lib/context-manifest.ts` builds the manifest that projects into the response.
- `apps/web/src/hooks/sourceThreads/useSourceThreadGeneration.ts` reads `text` as a system message.

While those readers disagree, the standing result is `unarmed`. That disagreement is already known. Do not comment on it again, and do not design a replacement object.

## What a new delta is

Comment only when something new appears since the stored fingerprint:

- a new reader or writer of `/memory` whose type is not `GetConversationMemoryResponse`
- a new field on that response
- a new model call on the Replay, Decide, or Commit path
- a new test that locks this response, which moves the lane from `unarmed` to `clear` if the readers match

Record the file pair or test as `evidence`. Do not edit the files.
