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
