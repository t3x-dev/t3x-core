# Schema delivery design QA — 2026-09-06

## Wave 1: browser authoring

Reference: `docs/plans/state-schema-delivery-2026-09-05/06-state-overview.png` (1483 × 1061). Implementation: `docs/plans/state-schema-delivery-2026-09-05/verification/browser-authoring/delivery-editor.png` (1480 × 960), plus mobile (390 × 844).

The reference and actual desktop screenshot were opened together in one comparison input. This is a layout-language comparison, not a pixel match: the reference is a schema project's Overview, while this is a Workspace editing sheet. Shared decisions: author content left, T3X-derived reading/status right, restrained blue accents, genuine semantic values, independent desktop scrolling. No author illustration is invented.

Iterations: (1) removed repetitive empty add controls; (2) replaced raw tree-envelope preview with the existing semantic reader; (3) retained edits across realtime refresh and invalidated stale review; (4) corrected mobile to a single scroll; (5) corrected action text contrast. Production browser journey passed with real native validation, commit and byte-exact export. Existing 33 Workspace tests passed.

Remaining P3: deeply nested generic structures still have more nesting chrome than the reference's domain-specific evaluation reader. No domain-specific runtime or execution result is implied.

Wave 1 result: passed.

## Wave 2: Discover and author introduction

Reference and production screenshots were opened together for both Discover and Overview. Evidence: `docs/plans/state-schema-delivery-2026-09-05/verification/discovery-reading/`. Actual browser tests cover author uploads, versioned description/Markdown, stale edits and catalog-to-release-to-Studio navigation. API tests cover exact-source hash, authorization and bounded catalog projection.

Critique and iteration: removed large empty fallback icons, shortened capability text, tightened the editorial cards, moved author editing onto the title row, and used real service configuration instead of one-pixel/empty presentation fixtures. Preserve author provenance and native rendering. No fake editor endorsement or runtime result.

Wave 2 result: passed for implemented release reading and visual fallback. Editorial imagery/curation is a content gap, not a claim of an existing collection.

## Wave 3: Studio samples

Reference `05-studio.png` and actual Studio screenshot were compared together before and after refinement. Evidence: `docs/plans/state-schema-delivery-2026-09-05/verification/studio-samples/`. Replaced excessive recursive rows with declared repeated-node tables; preserved names, actual fields, missing values, local edit provenance and true native check status. Source/code/structure and existing apply controls retain their jobs.

Real author sample, native missing-field failure, browser repair, mobile layout, late response invalidation and no-AI Workspace commit/export are verified. No preview data is adopted implicitly.

Wave 3 result: passed.

## Remaining wave gates

Cloud compatibility remains in progress. No overall completion is claimed.

Overall result: blocked (remaining wave implementation and qualification pending).
