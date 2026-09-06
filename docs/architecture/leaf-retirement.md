# Leaf retirement contract

Tracks #1502, #1499, #1507. The owner authorized writer retirement on 2026-09-06 after confirming there are no users. This does not authorize deleting historical records.

## Boundaries

Leaf is a persisted generated output attached to a commit. It is not a tree leaf
node, an alpha leaf package, a CommitV2, or the renderer. Preserve those shared
concepts and the inference runtime, billing evidence, validators and runner.

| Consumer / owner | Current entry | Disposition |
| --- | --- | --- |
| Web / #1506 | ProjectOutputsTab, ProjectLeafManager, Canvas Leaf creation, intro demo | Replace creation with direct export/delivery; remove Outputs navigation |
| Workspace / #1505 | OutputTargetsTab, buildOutputTargetLeafInput | Map export targets to exact commit delivery; generation targets remain labelled legacy |
| API / #1507 | leaves-crud/generation/history/ml routes | Retain GET readers; deprecate writers after replacement is qualified |
| CLI / #1507 | commands/leaves.ts and generate leaf | Keep historical read/export; retire create/generate with migration guidance |
| MCP / #1507 | leaf resource, query reads, legacy writers | Preserve scoped reads; retire product writers, not generic state queries |
| Storage / #1502 | leaves, leaf_history, leaf_output_edits | Retain output, attempts, prompts, assertions, edits and attribution; no DROP/cascade cleanup |
| Sources / #1502 | pins referring to a Leaf | Preserve reference resolution; audit mismatches before migration |
| Runner / #1505 | Leaf runner_assertions and agent outputs | Preserve evidence; no assumption that deploy_agent is a working deployment adapter |
| Inference / #1507 | leaf-gen, learning and comparison metering | Retire only Leaf callsites; retain shared runtime and historical billing attribution |
| Archive / #1418 | full project backup and restore | Independently prove exact graph and resource retention; Leaf JSON export is not a backup |

## Read-only scan

`node tools/leaf-retirement-audit.mjs` inventories all 16 current routes and marks
deployment data as **not-scanned**. It does not contact a database.

An authorized deployment operator can supply a least-privilege read role through
an environment variable and an explicit project:

```sh
node tools/leaf-retirement-audit.mjs --project PROJECT_ID --database-url-env T3X_AUDIT_DATABASE_URL
```

The tool uses a repeatable-read, read-only transaction with a statement timeout.
All data queries have a project parameter; output is aggregate counts only.
Connection errors are redacted. It detects edit/pin reference inconsistencies,
counts retained generations and outputs, and never reports a successful scan as
permission to retire. A missing table fails the scan rather than reporting zero.
Unattributable history orphans and exact commit integrity require #1418's
operator-level verifier; this scoped scan must not inspect another project's
content to guess ownership. Leaf has no artifact-version column.

No deployment database was scanned for this implementation. The owner explicitly waived the external-client waiting gate because there are no users; see [authorization on #1507](https://github.com/t3x-dev/t3x-core/issues/1507#issuecomment-5558788779). This is owner authorization, not a measured zero-row claim. The scan remains available for future deployments.

## Rollout and retention gates

1. Ship YAML/JSON exports that read an exact verified State (#1503/#1504).
2. Adapt Workspace output targets (#1505), with explicit mapping failures.
3. Remove New Leaf and Outputs; old URLs remain read-only (#1506).
4. The owner ended the external compatibility waiting period on 2026-09-06. API writers now return 410; CLI/MCP compatibility commands return explicit retirement guidance without calling storage or a model.
5. Retired writer endpoints return a typed `LEAF_WRITER_RETIRED` response (410)
   with export/delivery migration guidance; they do not silently redirect writes.
   GET access remains authorized and unchanged.
6. Delete exclusive unreachable code in small reviewed PRs. Physical table/data
   deletion is explicitly out of scope and needs a separate retention decision.

Before switching off writers, verify legacy output/history/edit/assertion export,
tenant isolation, old bookmarked URLs, API-client/CLI/MCP compatibility, and an
exact-state export from a historical commit. Roll back the application switch
without restoring rewritten data: this rollout never rewrites retained records.

## Retirement implementation

All 12 product Leaf writers are closed; four authorized GET readers remain. API Leaf generation/ML handlers and the exclusive generation operation are removed. Runner ingestion retains run evidence without rewriting a historical Leaf or appending synthetic Leaf history. MCP no longer invokes the Leaf generator directly. Web legacy writer adapters reject locally; Canvas creation panels and generation/deletion menu actions are removed. Shared Core libraries, storage queries for historical archives, tables, pins and billing evidence remain.

Historical browser fixtures are seeded through storage only into the full runner’s disposable embedded database; production writer endpoints are never temporarily reopened for testing.
