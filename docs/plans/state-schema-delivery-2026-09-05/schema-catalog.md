# Schema Catalog: published release projection

Related: #1501, #1514. This is the catalog backend foundation, not completion of the whole Discover publishing experience.

## Routes

- `GET /v1/yschema/catalog`: official/community published definitions.
- `GET /v1/projects/{projectId}/yschema/catalog`: the same public releases plus this authorized project's private/team releases. Project read authority is checked before registry reads.
- `GET /v1/yschema/catalog/collections`: editorial tag aliases for discovery filters.

Production authentication remains the existing API authentication boundary. “Public” here describes registry visibility, not a new unauthenticated API exemption. Catalog responses use `Cache-Control: private, no-store`.

## Query contract

| Parameter | Meaning |
| --- | --- |
| `q` | Literal substring of canonical name, display title or description; SQL wildcards are escaped. |
| `tags` | Comma-separated exact tags; all must match. Up to 16. |
| `collection` | Official editorial alias; any of its tags may match. Combined with other filters. |
| `ecosystem` | Exact author tag `ecosystem:<value>`; not an adapter compatibility assertion. |
| `publisher` | Canonical-name namespace before `/`; owner project is returned separately. Not publisher verification. |
| `family` | Exact declared family, with no closed category enum. |
| `kind` | `core`, `module` or `schema`. |
| `capability` | Exact version-declared `provides` capability. Tags cannot satisfy it. |
| `format` | `json` or `yaml` serialization support, not the original source-file extension. Both apply to registry definitions. |
| `limit`, `cursor` | 1–100 rows (default 24); opaque keyset cursor. |

Malformed queries and cursors return 400. Visibility, archive/deletion state and all facets are applied before pagination. Results sort by immutable release creation time and unique version ID, descending. Each row is one release; several versions of one definition may appear. Reusing a cursor never grants access. This is a live index, not a frozen search snapshot: metadata changes may change filter membership between requests.

## Card data and ownership

`identity` contains the current registry title, description, tags, owner project, visibility and metadata revision. For legacy identities with absent title/description, the bounded, declared release title/description is used. Explicitly empty author metadata stays empty.

`release` contains exact version ID, version and content hash. `definition` contains the declared path count and `provides`/`requires`, with `contentKind: definition`. `license` is only a bounded declared string, or null when unknown. A catalog entry does not execute its configuration; validation remains `not-run`.

The projection does not return a raw manifest, README, resource bytes, starter instance, draft version list or private project State. It never invents renderer/check support from a tag, family or external-tool name. Archived identities, deprecated/draft releases and releases belonging to a deleted project are excluded. Exact historical artifact retrieval remains the existing Registry concern.

Collections are optional editorial labels rather than a type hierarchy. An empty collection stays empty; untagged built-ins are not silently classified by an AI or by their renderer. New custom tags work without extending the official list.

## Follow-up within #1514 / #1515

- Connect the existing Browse and Discover UI to this API and preserve filter URLs when opening State Overview.
- Bind avatar and optional editorial cover assets to an explicit publication reference. The current registry has no authoritative link to a State presentation revision; do not guess the project HEAD or copy private README resources into catalog cards.
- Add curated release selections and a publishing workflow for editorial media. The collections route currently supplies filters, not invented recommendations or images.
- Expose renderer/check support only from real adapter registrations, separately from declared structural capabilities.
- Keep Schema Studio candidate pinning and starter-instance previews separate from this definition listing.

## Verification

Focused API + composition persistence suites: 22 passed. Includes real PostgreSQL queries, equal-timestamp multi-version pagination, permission isolation with authentication enabled, cursor reuse, soft-deleted owners, drafts/archives, literal wildcard search, loose tags vs capabilities, immutable hashes across metadata edits and legacy built-in title fallback.

Initial local run used dependency output overwritten by the author-PR pre-push build; rebuilding dependencies resolved the missing runtime exports. A permission fixture passed `ownerId` through a helper that discards that field; the corrected fixture creates real namespace authority. Final results above follow both corrections.

After integrating #1542 from `dev` (`d68de453c1f76a5c281fcff073e09a51eeadb76e`), full `pnpm test` passed: 31 successful tasks, API 1,305 passed / 1 skipped, WebUI 1,586 passed. The route-policy merge retained all 284 entries and its inventory check passed.

## Release introduction binding

Schema publication accepts an optional `presentation_ref` containing exact `commitDigest`, `presentationDigest`, and an optional bundled `coverPath`. The project comes from the authorized route, never from request data. Publication verifies commit membership, normalizes and hashes the stored author introduction, and checks that the selected cover is in its bundled resources. The complete reference is saved in `manifest.registry.presentationRef` and covered by the immutable artifact hash. Existing releases cannot be repinned, and publishing without an introduction remains valid.

This is an introduction provenance link, not a claim that the introduction commit is the compiled Schema definition. `schemaHash` and the artifact release identity continue to describe the definition. Updating project HEAD never changes a released introduction.

Catalog returns this reference only for releases owned by the explicitly authorized project in the project-scoped endpoint. Public and foreign-project results return null, even if the release itself is public. The existing exact-commit presentation endpoint remains responsible for authorization and integrity checking when fetching README/image content. Public editorial image publication requires a separate explicit sharing workflow; this change does not create one.

The publication, identity update/archive, and composition save/apply routes now require `project:edit`. Reading definitions and introductions remains available to viewers. The previous read-only authorization on these mutations was insufficient.

Verification: 28 targeted tests passed across release introduction, catalog, and composition persistence. Includes corrupted content, foreign commits, wrong digests, unbundled covers, immutable repinning, HEAD advancement, backward-compatible publication, viewer rejection on all five write actions, and public/foreign catalog isolation.

Full regression: `pnpm test --concurrency=1` passed all 31 tasks (API 1,311 passed/1 skipped; WebUI 1,586 passed). The initial parallel run stopped during PostgreSQL shared-memory allocation, not an assertion; the serial run passed without system changes or skipped checks. A final focused publication suite also covers the v2 Blueprint pin.
