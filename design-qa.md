# State Overview — three views and readable content

Reference: docs/plans/state-schema-delivery-2026-09-05/06-state-overview.png.

Scope: author introduction and README at left, compact T3X section summary,
independent render sidebar, and Overview / Structure / Code navigation.

## Findings addressed

- Replaced raw JSON wall with deterministic fields, lists and record tables.
  Recognized repository content is decoded through the existing Core adapter;
  actual section names replace codec envelope keys in the UI summary. Unknown
  or invalid codecs retain the full generic representation and exact export.
- Fixed naked Tailwind hues that failed the repository visual-token CI contract.
  Author prose stays neutral; T3X surfaces use semantic info tokens.
- Preserved existing PRD, Prompt and Skill readers under Overview. Legacy
  `view=render` opens Overview while preserving revision parameters.
- Browser capture exposed the PRD outline occupying most of the narrow sidebar.
  Added compact document mode; expanding restores the original full reader.
- No invented modules, requiredness, examples, execution results or author images.

## Verification

39 focused WebUI tests and 11 application projection tests passed. Production
browser tests cover desktop/mobile layout, inert Markdown, blocked remote images,
section selection, panel expansion, historical revision isolation, and the
existing State/Code/Canvas journey. Actual screenshots inspected before commit.
The first browser run passed assertions but hit a PostgreSQL temporary-directory
cleanup race; the subsequent two-test run exited cleanly. A later type-check
failure in the new client projection was corrected and rebuilt.

## Limits

This is a document/structured-data reader migration, not completion of pinned
schema renderer resolution (#1316/#1510). Existing specialized-reader behavior
is retained, with PRD compact mode added. Author editing remains #1512 work.
Structure still defaults on existing unqualified routes in this PR; changing the
landing route is the next separately reviewable step. Outputs retirement remains
gated by the existing retention work; it is not hidden as part of this UI change.

## Navigation follow-up (#1512)

Default Overview and per-project snapshot-view memory verified with 32 focused
tests plus both production browser journeys (2 passed, clean exit). Explicit
legacy Render links override a saved Code preference; commit pins survive view
switches. Desktop capture re-inspected with no layout regression. Author editing
and shared README controls remain outside this navigation slice.

## Newer shared shell reconciliation (#1508)

Adopted the source branch's T3X header, project identity and selected-tab design.
Changed absolute centering to normal responsive flow. Inspected actual desktop
Overview plus long-name 1200px and 390px captures; project identity and navigation
remain separate. Browser geometry checks cover 1480/1200/1000/390px and Workspace
routing. Eight focused shell/token tests passed. All three production browser
journeys passed (14.4s); the harness then failed removing a PostgreSQL temporary
`pg_stat` directory (ENOTEMPTY). This is a teardown failure, not a clean test-run
exit. The initial new test incorrectly looked for a banner landmark inside the
app's main landmark; its title locator was corrected before the passing run.
Captures: plan verification/project-shell/{overview,mobile}.png.
Workspace internal Review/Compose migration is not included in this slice.

## Workspace Compose / Review navigation

The newer design's two top-level modes now group existing workflow surfaces.
Review restores its last mounted step; existing generation, validation, preview
and commit gates are preserved. This does not claim the three-column Review or
new Compose controller is ported. Actual seeded Compose and populated Validation
captures inspected before commit (verification/workspace-modes).

Final full WebUI suite: 251 files / 1590 tests passed. Final production multi-source
proposal-to-audited-commit browser journey: 1 passed (5.9s); harness then failed PG
cleanup with ENOTEMPTY. Earlier runs found obsolete direct Commit navigation after
reload and a stale build after switching parent branches; final run rebuilt the
branch and used Review explicitly. Cross-page legacy navigation tests were updated
and their State/header portions pushed back to the owning parent PRs.

## Workspace validation evidence — 2026-09-06

- Preserves the selected Compose/Review shell. Validation uses the existing YOps result, not operation count or a loaded historical commit.
- YOps replayability and schema review findings are separate; no inferred per-field PASS or YSchema pass in the diff.
- Inspected actual Chromium captures under `docs/plans/state-schema-delivery-2026-09-05/verification/validation-evidence/`: neutral not-run/included badges; green aggregate only after validation.
- Complete browser flow passed through proposal, validation, preview and audited commit; shutdown and temporary PostgreSQL cleanup exited 0.
- Full WebUI run: 1589 passed, one legacy text assertion failed; updated that assertion and reran its owning test successfully. Focused WorkspaceWorkbench: 32 passed.
- Scope: backend validation, schema finding resolution and commit policy are unchanged. The view does not claim an external schema validator ran.

## Shared State README — 2026-09-06

Structure and Code expose a collapsed-by-default author README. Opening it loads the exact selected commit through the existing Overview hook. Content is bounded to 40vh and scrollable, preserving the node/code workspace. The shared Markdown renderer retains inert HTML and bundled-image-only handling. Editing remains separate work under #1512.

Validation: 33 focused tests and all 1,590 WebUI tests passed. Final Chromium verified both views, exact historical revision changes, empty README revisions, unsafe content handling and mobile width; exit 0 including PostgreSQL cleanup. Inspected settled Structure and mobile screenshots before commit. Full check passes with the two existing native-image warnings, one now in the shared renderer. Screenshots are under `verification/shared-readme/`; this independent branch predates the navigation-only PR #1536.
## Outputs navigation retirement — 2026-09-06

Primary project navigation and its output count are removed. Legacy `/outputs` and `tab=outputs` parsing remains. This is the navigation slice of #1506; creation controls and historical read-only conversion remain pending.

Four component tests passed. Chromium verified navigation geometry at 1480/1200/1000/390 widths and the legacy empty Outputs route; shutdown exited 0. Inspected desktop screenshot before commit (`verification/outputs-navigation/desktop.png`).

## Canvas Leaf affordance retirement — 2026-09-06

Removed New Leaf from shared commit actions and expanded node Leaf lists; removed inline delete and write context-menu dispatch. Existing Leaf links remain. Empty floating action panels no longer render. Selection copy directs delivery to State/Commit Export.

111 Canvas component tests passed, including retained Open Leaf panel reanchoring. Four Chromium Canvas workflows passed (load, select/no-create-controls, fit, console); teardown exited 0. Inspected the selection screenshot before commit. This continues #1506; template/onboarding creation and backend writer retirement are not claimed complete.
## Legacy Leaf reader — 2026-09-06

Replaced generation/editor pages with a read-only archive and removed Outputs create/delete controls. Retains source commit links, saved output, paged generation history, current saved evidence and text/JSON export. History exports carry record identity and source commit; current evidence is explicitly separate from historical generation. No backend writers or stored records are removed. Canvas/template creation affordances remain follow-up work.

Full WebUI: 253 files / 1,583 tests passed before adding one additional export-provenance regression; final focused hook/reader tests: 5 passed. Chromium verified retained author-edited output, downloaded record content, source revision, missing bookmark, no Leaf write requests, and desktop/mobile layouts; final run and shutdown exited 0. Inspected screenshots before commit. Existing raw output is rendered as inert text. Output-edit ledger storage is retained but its timeline UI is not added here.

## Legacy template archive — 2026-09-06

- `/templates` retains the structured PRD starter and searchable legacy prompts. Removed template creation/deletion and Use → Create Leaf; prompt templates are not represented as YSchema definitions.
- Retained system/user prompts, variables, and Markdown/JSON/clipboard export. Backend APIs and saved data remain intact pending retirement audit.
- Chromium: seeded a real template, searched, previewed, downloaded JSON, verified original ID and prompts, and observed no template/Leaf writes from the browser. Mobile width checked at 390px.
- First browser attempt hit ambiguous Preview buttons before debounced search completed; waiting for the filtered result fixed the test. Final run passed with clean teardown. Twenty starter/export unit tests passed.
- Inspected desktop, mobile and settled dialog captures in `docs/plans/state-schema-delivery-2026-09-05/verification/template-archive/`. Applied the React review checklist; no direct infrastructure imports were introduced in components.
