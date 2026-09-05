# Leaf retirement contract

Tracks #1502, #1499. This inventory does not authorize deletion or claim zero usage.

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

No deployment database was scanned for this implementation. Consumer owners must
record a deployment scan and acknowledge external clients before #1507 proceeds.

## Rollout and retention gates

1. Ship YAML/JSON exports that read an exact verified State (#1503/#1504).
2. Adapt Workspace output targets (#1505), with explicit mapping failures.
3. Remove New Leaf and Outputs; old URLs remain read-only (#1506).
4. Announce writer deprecation to API/CLI/MCP consumers. Keep existing writers
   during the compatibility window until replacements and caller acknowledgments
   are recorded. The window ends on evidence, not an invented date.
5. Retired writer endpoints return a typed `LEAF_WRITER_RETIRED` response (410)
   with export/delivery migration guidance; they do not silently redirect writes.
   GET access remains authorized and unchanged.
6. Delete exclusive unreachable code in small reviewed PRs. Physical table/data
   deletion is explicitly out of scope and needs a separate retention decision.

Before switching off writers, verify legacy output/history/edit/assertion export,
tenant isolation, old bookmarked URLs, API-client/CLI/MCP compatibility, and an
exact-state export from a historical commit. Roll back the application switch
without restoring rewritten data: this rollout never rewrites retained records.
