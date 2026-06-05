# Stability Policy

This document defines the minimum stability expectations for the T3X release
surface. It should evolve as packages move from alpha candidates into stable
support.

## Restricted Alpha Surface

The restricted alpha surface is limited to:

- `@t3x-dev/local`
- `@t3x-dev/yops`

Other packages may exist in the repository, but they are treated as internal or
restricted until explicitly promoted.

## Stability Tiers

`alpha` means:

- The package is intended for external users.
- Breaking changes are allowed, but they must be intentional and documented.
- User-visible changes require a changeset.
- Public behavior must be covered by tests or smoke checks appropriate to the
  risk of the change.

`internal` means:

- The package is not a supported public contract.
- It may change without a public deprecation window.
- It should not be documented as a public installation entrypoint.

## Change Rules

For `@t3x-dev/local`:

- Installer and runtime behavior must have smoke coverage before release.
- Runtime artifacts are published only when the local package is released.
- Unsupported platforms should fail with clear guidance.

For `@t3x-dev/yops`:

- `packages/yops/yops.yaml` is the public and runtime source of truth for this
  phase. It is not a documentation appendix.
- Public operation semantics must be documented before release.
- Breaking operation behavior requires a changeset and release note.
- Compatibility-sensitive changes should include fixture or golden-case tests.

### YOps Alpha Contract

The YOps contract-bearing surface includes:

- Operation names.
- Operation families (`ddl`, `dml`, `dtl`, `dcl`).
- Required and optional fields.
- Field types and enum values.
- Path syntax and path matching behavior.
- Engine runtime error codes.
- Validator diagnostic codes and severity.
- Conformance test cases in `yops.yaml`.
- Recipes and examples that users or agents may copy.
- Deprecation and removal rules.
- Versioning expectations for the restricted alpha package.

These surfaces may still change during restricted alpha, but they cannot change
casually. A PR that changes any contract-bearing surface must state whether the
change is additive, tightening, or breaking.

Additive or non-breaking YOps changes include:

- Adding an optional field whose omission preserves the previous behavior.
- Adding an enum value without changing how existing values behave.
- Adding a new operation without changing existing operation behavior.
- Adding an engine runtime error code for a newly introduced failure mode that
  previously did not occur for valid inputs.
- Adding a validator diagnostic code. This is explicitly non-breaking in
  `yops.yaml`.
- Adding conformance cases, recipes, or examples that document existing
  behavior without changing accepted inputs or results.

Additive public surface still requires documentation, conformance coverage, and
a changeset when it affects the released package API or user-visible behavior.

Breaking YOps changes include:

- Removing or renaming an operation.
- Moving an operation to a different family when tooling can observe the family.
- Removing or renaming a field.
- Making an optional field required.
- Making a required field optional when existing validators, schemas, or
  generated docs would describe a different contract.
- Narrowing a field type or enum value set.
- Changing the meaning, ordering, fail-fast behavior, or idempotency of an
  existing operation.
- Changing path parsing, path escaping, index matching, or key-match coercion
  for existing paths.
- Removing or renaming an engine runtime error code.
- Removing or renaming a validator diagnostic code. This is explicitly breaking
  in `yops.yaml`.
- Escalating a diagnostic from advisory (`info` or `warning`) to blocking
  `error` for inputs that were previously valid.
- Changing conformance cases, recipes, or examples in a way that invalidates
  previously documented behavior.

Breaking YOps changes require:

- Explicit owner or team review.
- A changeset that calls out the breaking surface.
- A release note.
- Updated conformance coverage.
- A small PR focused on one spec contraction at a time.

### YOps Tightening Gate

Follow-up YOps tightening work must use this decision gate before changing
`yops.yaml` behavior:

- No implementation PR should change the spec surface before analysis and
  target-spec docs are reviewed.
- The analysis must cover the current 18-operation surface.
- The analysis must cover the known overlap questions: `move` vs `nest`,
  `merge` vs `fold`, `pick` vs `omit`, `define` vs `set`, `assert` as a sibling
  operation vs an `if:` precondition, batch or transaction semantics, recipe
  placement, and path representation.
- YAML remains the public and runtime YOps source of truth for this phase.
- A first-class path AST is not required for the current YAML-based alpha
  tightening pass.
- If path AST work is still needed, defer it to a later `yschema` or
  JSON-oriented internal representation decision.
- Any spec-tightening PR must include at least 50 executable YAML or
  conformance examples before it is treated as release-safe. Those examples
  must cover previous behavior, target behavior, edge cases, and rejected
  inputs.
- Do not combine multiple spec contractions in one PR.

## Promotion Rules

A package can move from internal to public only when:

- Its intended user and entrypoint are documented.
- Its package access and publish state are declared.
- Its stability tier is declared.
- It has release checks appropriate to the package risk.
- An owner approves the promotion.

Removing a package from the public surface is treated as a breaking change.
