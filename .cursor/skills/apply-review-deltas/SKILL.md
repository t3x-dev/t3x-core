---
name: apply-review-deltas
description: Apply named T3X daily-review delta ids after a human comment on the daily review pull request.
disable-model-invocation: true
---

# Apply review deltas

The three checks do not start this automation. A human comment on the open `daily review` pull request does.

## Automation prompt

```text
A human named daily-review delta ids to apply on t3x-dev/t3x-core.
Read and follow .cursor/skills/apply-review-deltas/SKILL.md.
Use the Memories tool. Push only those fixes to the daily review pull request branch. Do not merge.
```

## Automation settings

- Trigger: GitHub "Comment added" on a pull request.
- Repository: `t3x-dev/t3x-core`. The commented pull request supplies the branch.
- Tools: Memories on. Computer use on only when a named delta is a WebUI flow. Pull request creation off.
- Model: the implementation model selected for the automation.

## Gate

Run only when all of these are true:

- The pull request title is `daily review`.
- The comment was written by a human account. Ignore `cursor` and other bots.
- The comment contains `apply` followed by one or more delta ids that appear in the pull request body.

If the comment says `apply deltas` and names no id, reply `name an id, for example apply api-boot` and stop. If an id is not in the body, reply `unknown id` and stop. Do not edit files.

## Work

1. For each named id, read its evidence and location from the matching open `daily: <lane>` issue.
2. Change only the files named by those locations.
3. Re-run the evidence command for each named id. For a WebUI spec, run that spec only.
4. Commit and push to this pull request branch.
5. Reply on the comment with the ids applied, the files changed, and the command results. Leave every unnamed delta untouched.

Do not change `AGENTS.md`, `RELEASE.md`, `release/surface.yaml`, or the protocol packages unless the named delta's location is that file. Do not merge.
