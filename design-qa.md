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
