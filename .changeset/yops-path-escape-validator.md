---
"@t3x-dev/yops": minor
---

YOps path escape (proposal A′) and document validator skeleton.

**Path escape — quoted segments.** A path segment that begins with `"` is now read
as a quoted key with a small escape grammar: `\"` is a literal double quote and
`\\` is a literal backslash. Every other character inside the quotes is literal,
including `/`, `[`, `]`, and `=`. Unquoted segments are unchanged. This lets
paths address keys that legitimately contain reserved characters
(`config/"db/prod"/host` resolves to the key `db/prod` under `config`) without
forking the wire format.

**`tryParsePath`.** Strict parser for the validator. Returns typed
`UNCLOSED_QUOTE` / `INVALID_ESCAPE` errors instead of falling through to a
silent literal-key interpretation. Existing callers continue to use `parsePath`,
which stays permissive.

**Document validator (`validateYOpsYaml` / `validateYOpsOps`).** New surface
that returns `YOpsDiagnostic[]` for pre-flight checks: never throws, never
auto-fixes. Two entry points so callers with parsed objects (API, MCP, CLI)
don't pay a YAML round-trip. Catches: YAML envelope shape, op-key
uniqueness/recognition, payload mapping shape, required/unknown/typed/enum
fields, path-syntax errors, and op-specific cross-field refinements
(starting with `assert` requiring at least one of `equals`, `exists`, or
`type` — mirrors the `.refine(...)` clause in `schema.ts` so preflight
and apply-time agree on which payloads are well-formed).

**Engine-validator alignment.** The validator deliberately does NOT
impose a key-format grammar (no SNAKE_CASE_KEY rule). The runtime parser
and engine accept any non-empty string as a plain key — including
hyphens, dots, and whitespace — and there are explicit edge-case tests
covering keys like `my-config.v2` and `my key`. Validator findings must
not reject inputs the engine would happily apply. Reserved characters
(`/`, `[`, `]`, `=`, `"`) are addressed via the quoted-segment escape,
not via a SNAKE_CASE-style restriction.

**Advisory `YOPS_PATH_LIKELY_DOUBLE_ESCAPED`.** Emitted at `severity:
info` when `\"` patterns appear OUTSIDE any quoted segment (heuristic
for accidental YAML+YOps double-quoting). Inside a quoted segment `\"`
is the documented escape for a literal `"` and never triggers the
advisory. Never blocks apply.

**Stable diagnostic codes.** All codes documented in `yops.yaml` under
`diagnostic_codes:` and exported as `YOPS_DIAGNOSTIC_CODES`. Adding new
codes is non-breaking; renaming or removing requires a major bump.

Design proposed in #930, pending maintainer alignment. Out of scope for
this release: dry-run preflight (lives in `@t3x-dev/core`, future PR),
`source_span` population (reserved in the type, returns null for now),
WebUI / API / MCP / CLI consumer integration (wait for validator to
stabilise), removing the `. → /` silent normalisation in
`@t3x-dev/core`'s extractor compiler (separate follow-up; validator
becomes its first consumer).
