# State renderer foundation

First bounded implementation for #1316, prerequisite to #1510 / #1500.
This PR introduces the shared application registry; it does not yet migrate the
Web readers or complete the Overview read model.

## Contract

`createStateRendererRegistry` accepts trusted, locally installed pure adapters.
Each registration declares a unique key, integer contract version, deterministic
priority, identity/version or family/capability matchers, a portable model schema
identifier, and an executable model validator. External artifacts cannot install
code. The generic fallback is reserved and always available.

Committed-State rendering first uses the same integrity and canonical export
boundary as State delivery. Both the exact CommitV2 and its resulting State must
match the requested descriptors. There is no mutable branch lookup.

Schema bindings are application-resolver inputs, not protocol objects. The
caller must verify the immutable artifact and its binding to the selected State
before supplying identity, version, hash, family, capabilities or a default
renderer. This registry is deliberately not an HTTP endpoint. It checks State
binding and immutable identity fields but does not independently authenticate an
artifact, resolve references, or establish artifact provenance. Those remain
resolver work before product integration. Never map catalog tags or arbitrary
request data into `ResolvedRenderBinding`.

Selection order is exact compatible identity/version, family, capability, then
generic. Within a tier, higher priority wins; equal priorities use lexical key
order. A declared default must exist, match the binding and support its exact
renderer contract version. Invalid declarations fail explicitly, rather than
silently presenting generic output as a successful declared render.

Unknown or unavailable schemas use generic `{ value }` rendering. Canonical
JSON and YAML are returned for every render, including rich adapters that omit
some fields. No fields are classified as modules, inferred from names, or
interpreted as executable instructions. Display tags have no selection role.

State loaded, schema resolved/unbound/unavailable, renderer selected/fallback,
and validation passed/failed/not-run are distinct. Supplied validation must
match both the State digest and the schema hash; the registry does not run a
validator or turn successful rendering into validation success.

Context and registration metadata are copied and frozen. Adapter results must
be protocol-serializable and pass their declared model validator. Adapters are
trusted code and must be pure: freezing protects against mutation, not arbitrary
IO or nondeterministic implementation. No third-party code sandbox is implied.

## Follow-up boundaries

- #1316: verified artifact/compiled-schema resolver, origin maps, Tier-0 YSchema
  Markdown registration, PRD/Prompt/Skill model adapters, Web dispatch migration,
  immutable Changes and artifact contexts.
- #1510: consume this shared registry after resolver integration; add explicit
  section/module summaries, source paths, author presentation and resolution
  details. Do not invent a second registry.
- #1511: implement the actual Overview UI with the compact author header,
  derived summary, flexible README and scrollable render sidebar.

The existing State UI is unchanged by this foundation PR. No visual completion,
full #1316 completion or full #1510 completion is claimed.
