---
name: daily-review-summary
description: Summarize the three T3X daily review issues onto one draft pull request. Use when the daily summary automation runs.
disable-model-invocation: true
---

# Daily review summary

This automation does not run the three checks. It cannot read their Memories. It reads the GitHub issues they already published.

## Automation prompt

```text
Summarize today's T3X daily reviews onto one draft pull request.
Read and follow .cursor/skills/daily-review-summary/SKILL.md.
Use the Memories tool. Do not change product code. Do not merge.
```

## Automation settings

- Trigger: daily, `30 9 * * *` UTC, after the three checks.
- Repository: `t3x-dev/t3x-core`, branch `dev`.
- Tools: Memories on. Computer use off. Pull request creation on, draft only.
- Model: whichever review model is selected for the automation.

## Inputs

Read open issues titled exactly:

- `daily: boundary`
- `daily: webui`
- `daily: memory-contract`
- `daily: boundary blocked`
- `daily: webui blocked`
- `daily: memory-contract blocked`

A lane with no open issue is `clear`. Ignore closed issues.

## Summary

Keep it to one line per lane, then the delta ids:

```text
boundary: clear
webui: deltas
- `api-boot` — API exited before health. `test-results/full-e2e/api.log`
memory-contract: clear

Reply `apply <id>` on this pull request to fix that item. Example: `apply api-boot`
```

Each bullet is one delta from the issue: id, one sentence, location. Do not add advice.

## Pull request

Search for an open pull request titled `daily review`.

- No deltas in any lane, and no such pull request: stop.
- No deltas, and that pull request is open: replace the body with the three clear lines, then close it. Do not push code.
- Deltas, and that pull request is open: replace the body. Do not push code.
- Deltas, and no such pull request: from `dev`, create branch `automation/daily-review` with one empty commit `daily review`, and open a draft pull request titled `daily review` whose body is the summary.

The empty commit is only there so GitHub has a branch. Do not add or edit files.

## Memory

Store the pull request URL and a fingerprint of the summary body. If today's summary matches the stored fingerprint, stop without editing the pull request.
