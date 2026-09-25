---
name: daily-review-memory
description: Memory record for the T3X daily review automations. Use when a daily boundary, WebUI, or memory-contract review starts or finishes, or when applying accepted review deltas.
disable-model-invocation: true
---

# Daily review memory

The automation Memories tool stores this record outside the git working tree. The default entry is `MEMORIES.md`. Read it before doing any work. Write it back before the run ends.

Do not store this file in the repository. Do not store guesses, proposed schemas, or source code.

## Record

Keep one section per lane. Replace that lane's section on every run.

```text
## boundary
last_run: YYYY-MM-DD
result: clear | deltas | blocked
fingerprint: <stable hash of the delta ids, or "none">
deltas:
- id: <short-id>
  evidence: <command or check name>
  location: <path>
  detail: <one sentence>

## webui
last_run: YYYY-MM-DD
result: clear | deltas | blocked
fingerprint: <stable hash of the delta ids, or "none">
source: <GitHub Actions run URL or "unavailable">
deltas:
- id: <short-id>
  evidence: <spec or job name>
  location: <path or route>
  detail: <one sentence>

## memory-contract
last_run: YYYY-MM-DD
result: unarmed | clear | deltas | blocked
fingerprint: <stable hash of the delta ids, or "none">
deltas:
- id: <short-id>
  evidence: <file pair or test name>
  location: <path>
  detail: <one sentence>
```

`fingerprint` is the sorted delta ids joined with commas. A clear or unarmed run uses `none`.

## Silence rule

If today's fingerprint equals the stored fingerprint, update `last_run` and stop. Do not open an issue, comment, or change code. A repeated failure is still the same feedback.

## Comment rule

Write feedback only when the fingerprint changes.

- Clear, and the previous result was not clear: one line, `daily <lane>: clear`.
- Deltas: one issue titled `daily: <lane>` whose body is the delta list. Each delta has `id`, `evidence`, `location`, and `detail`.
- Blocked: one issue titled `daily: <lane> blocked` with the command that could not be run. Do not invent a review.

If `gh` cannot create the issue, leave the delta list in the run summary and in memory. Do not open a pull request and do not edit the tree.

## Action rule

A checker issue is feedback. Checkers do not open a pull request.

`.cursor/skills/daily-review-summary/SKILL.md` reads the open `daily:` issues and, when any lane has deltas, opens or updates one draft pull request titled `daily review`. The pull request body is the summary. It does not change product code.

Code changes happen only under `apply-review-deltas`, on that pull request, after a human comment names the delta ids to apply.
