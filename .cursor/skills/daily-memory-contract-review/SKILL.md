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

The locked readers are:

- `packages/api/src/routes/conversations.openapi.ts` publishes `GetConversationMemoryResponse` and parses the payload with `ConversationMemorySchema`.
- `apps/web/src/infrastructure/pins.ts` reads that payload as `BuiltContext`.
- `apps/web/src/infrastructure/conversations.ts` `getConversationMemoryText` reads the same payload and returns `{ text }`.
- `apps/web/src/hooks/sourceThreads/conversationMemorySystemMessage.ts` places `text` on the system message.
- `apps/web/src/__tests__/hooks/sourceThreads/conversationMemorySystemMessage.test.ts` locks that choice.

A matching run is `clear`.

## What a new delta is

Comment only when something new appears since the stored fingerprint:

- a new reader or writer of `/memory` whose type is not `GetConversationMemoryResponse`
- a new field on that response
- the memory route schema is no longer `GetConversationMemoryResponse`
- generation sends `token_estimate` or `sources` to the model, or a model call appears on the Replay, Decide, or Commit path

Record the file pair or test as `evidence`. Do not edit the files.
