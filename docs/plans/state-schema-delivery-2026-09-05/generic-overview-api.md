# Generic State Overview API

Continuation of #1510 / Epic #1500. The endpoint is the generic, always-readable
Overview path; #1528's pinned Composition V2 service adapter remains separate
until the schema-resolution dispatch is integrated.

`GET /v1/projects/{projectId}/commits/{commitDigest}/overview`

The endpoint checks project read access and verified project membership of the
exact commit. It never substitutes the current branch head. Optional
`state_digest` and `presentation_digest` query parameters enforce exact expected
content; mismatches return 409. Responses are private and not cached.

The shared application projection returns:

- `revision`: commit, State and optional author presentation digests;
- `author`: verified description, README, loose tags and bundled images, or null;
- `summary`: factual top-level sections, JSON pointers, value types and immediate
  child counts. There are no invented descriptions or module boundaries;
- `render`: the existing shared generic renderer, complete State value and
  canonical JSON/YAML recovery.

The summary is limited to 100 entries with explicit total and truncated fields.
This is a presentation limit; full committed content remains available in render
and recovery. Scalar and empty roots have no fabricated sections. Object keys
are preserved, including escaped RFC 6901 pointer characters.

Author data is separately hashed and never injected into business State. A
missing sidecar stays null; a corrupt sidecar fails closed. Since a sidecar may
be first published after the commit exists, an unpinned read can change from
null to that immutable publication. Persist the returned presentation digest
with the commit when an exact author revision is needed. This API does not
claim that absence of a sidecar is permanently immutable.

Generic status deliberately says `schema: not-requested`, `renderer: fallback`
and `validation: not-run`. It does not assert the project has no schema or that
schema resolution or validation has succeeded. Tags never select a renderer.
The API client validates this generic response contract and encodes project IDs
and expected revision parameters.

README and supplied images remain author content; Markdown is inert data. Web
rendering must disable raw HTML and use the existing bundled-resource/link
resolver. No UI or Markdown execution is introduced here.

Remaining #1510 work: combine schema-specific resolution with this author and
section projection, support versioned schema-definition rendering and complete
origin navigation. #1511 owns the Overview layout and sidebar; #1512 owns view
switching/editing. No second renderer registry or protocol authority is added.

Verification: application projection tests; HTTP historical-version, author
publication, wrong pins, foreign-project, corruption and viewer authorization
tests; OpenAPI metadata contract; API client response/query tests; full build,
formatting, route inventory and architecture boundary checks.
