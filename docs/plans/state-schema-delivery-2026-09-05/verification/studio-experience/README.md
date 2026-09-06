# Studio — real browser verification

2026-09-06. Screenshots captured from the implementation, using isolated project fixtures and real API/PostgreSQL. They are not generated mockups.

- [Desktop](studio-desktop.png): saved candidates, module selection, native compiled definition, target Workspace and checks.
- [Review](studio-review.png): exact sources, target revision and actual definition changes before explicit apply.
- [Mobile](studio-mobile.png): contained candidate scrolling and stacked panels; no document overflow at 390 px.
- [Active](studio-active.png): exact applied sources and the current Workspace revision's schema review, with a return link to Workspace review/history.

Playwright: `schema-studio-experience.spec.ts` and `schema-studio-handoff.spec.ts` passed together. Covers Overview → cross-project candidate, unchanged Workspaces before apply, module changes, comparison, code/X-ray, cancellation, concurrent target modification invalidating confirmation, explicit refreshed review, apply, pinned binding, stale validation, and return to active diagnostics. No page errors.

The first browser run incorrectly expected legacy V1 `requires` to be mandatory. Existing V2 adaptation deliberately treats those as suggestions; the test was corrected without changing that architecture. A second run timed out because the stale review button correctly became disabled; an explicit refresh-review explanation/action was added and tested. Required V2 dependency locking and failed compiler reports have API/component coverage.

Preview shows the real compiled definition, not example execution results. This wave does not add an AI sample generator or execute third-party configurations. Published whole Schemas are atomic; independent declared Modules can be selected. Tags never determine compatibility.

Final validation: WebUI 1,601 tests passed (261 files); API 1,319 passed / 1 skipped (145 files); API/Web typechecks, architecture inventory, `pnpm check`, and full production build passed. The existing Workspace extraction fixture intermittently mutated pins before initial hydration completed; it now waits for that initial snapshot. Its behavioral assertions remain unchanged. Two existing author-image lint warnings remain.
