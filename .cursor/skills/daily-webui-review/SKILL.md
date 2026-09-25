---
name: daily-webui-review
description: Daily read-only review of T3X WebUI functional failures from the dev Playwright run. Use when the daily WebUI automation runs.
disable-model-invocation: true
---

# Daily WebUI review

Read `.cursor/skills/daily-review-memory/SKILL.md` and follow its record, silence, and comment rules. This lane's section is `webui`.

## Automation prompt

```text
Run the daily WebUI review for t3x-dev/t3x-core on the dev branch.
Read and follow .cursor/skills/daily-webui-review/SKILL.md.
Use the Memories tool. Do not edit code, open a pull request, browse the product, or merge.
```

## Automation settings

- Trigger: daily, `0 8 * * *` UTC. Run after the boundary review, or at `30 8 * * *` UTC.
- Repository: `t3x-dev/t3x-core`, branch `dev`.
- Tools: Memories on. Computer use off. Pull request creation off.
- Model: whichever review model is selected for the automation.

## Evidence

Read the latest completed `Full-stack E2E` workflow run on `dev`. The workflow file is `.github/workflows/full-stack-e2e.yml`. It already runs on every push to `dev`.

```bash
gh run list --workflow full-stack-e2e.yml --branch dev --limit 1 --json databaseId,url,conclusion,headSha,createdAt
```

If that run's conclusion is `success`, the result is `clear`. Store the run URL as `source`.

If the conclusion is `failure` or `cancelled`, open the failed job log and record one delta per failed spec. `evidence` is the spec name. `location` is the spec path. `detail` is the first assertion or timeout line.

If `gh` cannot read the workflow, the result is `blocked`. Do not start the WebUI and do not click through the product. A free browser pass is not this review.

## Scope

The functional set already covered by that workflow is the review. Do not add a new journey in the daily run. Do not compare the UI to a design render. Render matching is a separate, manual automation.
