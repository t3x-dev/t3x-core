# Pinned composition Overview projection

Continuation of #1316 and #1510, based on the shared registry in #1527.

`buildCommittedCompositionOverview` renders an actual committed instance using
its exact YSchema Composition V2 binding. It is an API service-layer adapter over the application registry, not a
new endpoint or a replacement for generic State rendering.

The adapter lives alongside existing YSchema resolution in `packages/api/src/lib`.
Application keeps its renderer contracts independent of the YSchema package; no
dependency-boundary exemption or pass-through re-export is introduced.

## Authority and resolution

The caller supplies a CommitV2, State, commit digest, a JSON pointer to the binding
inside that State, an optional JSON pointer to the instance content, and the
composition/module documents fetched by a resolver. The content pointer defaults
to the full State value. Neither pointer is guessed from tags or field names.

The function verifies Commit/State integrity through the shared export boundary,
then reads `compositionId`, `compositionRevision`, `compositionHash` and
`schemaHash` from the committed binding itself. Each module reference must have
an exact hash. The existing V2 compiler checks artifact bytes, dependencies and
policies, and the projection checks both compiled hashes against the committed
binding. Missing, changed or incompatible sources fail explicitly. No branch
HEAD, latest release, mutable catalog metadata or built-in substitute is read.

Inputs are snapshotted before asynchronous hashing. A caller changing an object
while resolution is running cannot swap the content being rendered.

## Presentation

The shared registry selects the local `t3x.yschema-markdown` adapter for this
verified composition identity/revision. It calls the existing deterministic
`renderYSchemaMarkdown` function. It does not install renderer code from an
artifact. Markdown is presentation data: a Web adapter must treat it as inert
Markdown and disable raw HTML; this PR does not implement the Web adapter.

The response explicitly labels the content as `committed-instance`; normalized
schema definition and instance rendering are separate fields. Full canonical
JSON/YAML recovery includes fields omitted by schema rendering.

Module summaries follow the compiler's render plan. Module title/description
come from the pinned artifact; node descriptions and requiredness come from the
compiled declaration. Missing optional nodes stay marked absent. No missing
prose is synthesized, and arbitrary instance fields do not become modules.

Each top-level declared node has a schema path and an RFC 6901 pointer into the
full State. Compiler origin maps are returned separately as `yschema-path`
coordinates. Repeated-instance origin expansion is deliberately not invented.

A valid composition is not a validated instance. Status remains `not-run` for
instance validation. Schema resolution and renderer selection have separate
status fields.

## Remaining work

This PR does not close #1316 or #1510. Generic/unbound projects continue using
the registry fallback; this entry point is specifically for pinned V2 instance
compositions. Remaining work includes artifact/V1 resolution, schema-definition
rendering, generic section summaries, author sidecar aggregation from #1526,
API/client integration, rich adapters, repeated-node origin navigation and the
Overview Web layout. Workspace resolution is unchanged.

Verification covers actual content, explicit module metadata, escaped pointers,
absent nodes, history/input isolation, module/schema/manifest tampering, missing
artifacts, unpinned modules, unresolved required capabilities, deterministic
output and tag-independent renderer selection.
