# Phase 0 Protocol (Trace + Suite)

This phase introduces two JSON Schemas as the shared “contract” for T3X automation:

- **Trace schema**: `t3x-runner/schemas/trace.schema.json`
- **Suite schema**: `t3x-runner/schemas/suite.schema.json`

They are intended to be used consistently by `t3x-runner`, `agent-demo`, `t3x-webui`, and CI tooling.

## Scope (Phase 0)

Phase 0 intentionally only defines the **envelope**:

- The trace envelope pins only `schema_version`, `run_id`, timestamps, and an `events[]` list.
- The suite envelope pins only `schema_version`, `suite_id`, `cases[]`, and a minimal set of assertion types.

Both `payload` (trace events) and `input` (suite cases) are **not strongly constrained** in Phase 0. We keep them open to allow incremental evolution; Phase 1 will refine their internal structure.

## Versioning Policy

- Backward-compatible changes: only **add new optional fields**.
- Breaking changes: bump `schema_version` (and keep old schemas around if needed).

## Validation (TODO)

This repo does not currently include `ajv` (or an equivalent JSON Schema validator) as a dependency.
Recommended next step: add `ajv-cli` (or `ajv`) and a `schema:check` script to validate `eval-suites/*.json` against `t3x-runner/schemas/suite.schema.json` in CI.

