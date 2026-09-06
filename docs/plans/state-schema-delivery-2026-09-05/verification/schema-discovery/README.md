# Schema discovery and publication verification

This implementation slice builds on #1543 (Catalog) and #1544 (release introduction pins), under #1514 / #1515 / epic #1501.

## Delivered behavior

- Schemas opens Discover: large release cards, brief descriptions, optional author-selected covers and declared definition metadata. Search and official loose tag collections navigate to Browse.
- Browse uses compact rows and a responsive sidebar for tags, ecosystem, publisher, declared capabilities, definition kind and serialization format. Query/filter state lives in the URL; pagination loads from the scoped Catalog API. Old requests cannot overwrite a different project/filter result.
- A release opens an inspection drawer. Its author README and bundled cover resolve against the exact commit and presentation digest. A project-introduction link opens the existing State Overview; browser Back restores search/filter intent.
- Open in Studio selects the exact version in the existing workbench. It does not imply a persisted candidate was created or a Workspace schema was applied. Foreign project Blueprints do not offer unsupported import actions.
- Publication optionally pins the project's main-branch author introduction and a chosen bundled cover. It is opt-in, with no generated assets or inferred claims. The backend checks membership, digests and edit authority.
- Verification uses the exact saved composition, preserving externally created IDs and ordering metadata. Reconstructing it from visible modules could previously produce a different hash and fail publication after successful verification.
- Publish dialog keeps its heading and actions visible while the fields scroll, including on mobile.

## Design review

Compared with `01-discover.png`, `02-browse.png`, and the final State design, this slice preserves visual discovery versus dense browsing, the current project shell, and author-owned media. It reuses the existing detailed Studio rather than duplicating its structure editor. Outputs remains absent from navigation.

Screenshots come from Chromium against a built WebUI, API, runner and PostgreSQL. The fixture creates and deletes its own project through real APIs. Its cover is an explicitly supplied existing T3X State screenshot; it is not a claimed OSS integration, generated preview or execution result.

No-cover cards intentionally use a neutral T3X icon. Current data is labeled **Recently published**, not falsely presented as editorial release picks. Public curated covers, publisher asset authorization, richer tag facets and candidate import remain follow-up work in #1514/#1515. Exact page-depth/scroll restoration after leaving Browse is not yet guaranteed; URL search/filter restoration is covered. Those issues remain open.

## Validation

- WebUI: 258 test files, 1,596 tests passed, including URL navigation, project/request isolation, pagination deduplication/retry, exact introduction response validation, author opt-in, existing workspace bindings and saved-composition identity regression.
- Real browser: Discover desktop/mobile, Browse full catalog, no-match filters, clear filters, mobile ecosystem filtering, exact release drawer, project introduction and Back, exact-version Studio handoff, and publication from the UI. The outgoing request and resulting Catalog reference are checked against the original commit/presentation digests and cover path. No page errors.
- Typecheck, repository checks and full build are run before PR submission.

### Failure record

The first basic browser journey passed. Expanding the test exposed one incorrect test selector (the real empty label is “No matching definitions”), then a genuine saved-composition hash mismatch. The selector was corrected; the implementation now verifies the saved composition and the regression is covered. The first full WebUI run found three old assertions expecting the former default Schemas library; these were updated to the new Discover entry behavior. The subsequent full suite passed. No checks were disabled.

## Captures

- [Discover desktop](discover-desktop.png) / [mobile](discover-mobile.png)
- [Browse full catalog](browse-all-desktop.png) / [mobile](browse-mobile.png)
- [Exact release](release-desktop.png)
- [Studio handoff](studio-desktop.png)
- [Publish desktop](publish-desktop.png) / [mobile](publish-mobile.png)
