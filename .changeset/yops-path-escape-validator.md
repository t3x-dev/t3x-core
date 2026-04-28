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
fields, path syntax errors. Advisory `YOPS_PATH_LIKELY_DOUBLE_ESCAPED`
emitted at `severity: info` for heuristic detection of accidental
YAML+YOps double-quoting; never blocks apply.

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
