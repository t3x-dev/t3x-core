# Stability Policy

This document defines the minimum stability expectations for the T3X public
surface. It should evolve as packages move from alpha candidates into stable
support.

## Public Alpha Surface

The initial public alpha surface is limited to:

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

- Public operation semantics must be documented before release.
- Breaking operation behavior requires a changeset and release note.
- Compatibility-sensitive changes should include fixture or golden-case tests.

## Promotion Rules

A package can move from internal to public only when:

- Its intended user and entrypoint are documented.
- Its package access and publish state are declared.
- Its stability tier is declared.
- It has release checks appropriate to the package risk.
- An owner approves the promotion.

Removing a package from the public surface is treated as a breaking change.
