---
name: apply-review-deltas
description: Apply one accepted T3X daily-review delta list. Use only when a human comment contains the marker "apply deltas".
disable-model-invocation: true
---

# Apply review deltas

Read `.cursor/skills/daily-review-memory/SKILL.md`. Do not start from a daily automation's own issue or comment. Cursor does not wake an automation from the `cursor` bot.

## Automation prompt

```text
A human asked to apply daily-review deltas on t3x-dev/t3x-core.
Read and follow .cursor/skills/apply-review-deltas/SKILL.md.
Use the Memories tool. Push the fix to the existing branch. Do not merge.
```

## Automation settings

- Trigger: GitHub "Comment added" on a pull request, and GitHub issue comments if that trigger is available.
- Repository: `t3x-dev/t3x-core`. The pull request supplies the branch.
- Tools: Memories on. Computer use on only when a delta names a WebUI flow. Pull request creation stays off because the branch already exists.
- Model: the implementation model selected for the automation.

## Gate

Run only when the triggering comment contains `apply deltas` and was written by a human account. Ignore comments from `cursor` and other bots.

The comment must point at one daily issue or quote one delta list. If it does not, reply with `no delta list` and stop.

## Work

1. Read the delta ids in that list. Change only the files named in `location`.
2. Re-run the `evidence` command for each delta.
3. If a WebUI delta names a spec, run that Playwright spec. Do not explore other screens.
4. Commit and push to the pull request branch.
5. Reply on the same thread with the commands you ran and their results.
6. Update the matching memory lane: remove the fixed delta ids and recompute `fingerprint`. Leave the lane `deltas` when any id remains.

Do not change `AGENTS.md`, `RELEASE.md`, `release/surface.yaml`, or the protocol packages unless the accepted delta names that file. Do not add a memory field. Do not merge.
