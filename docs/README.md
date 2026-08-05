# T3X Documentation

T3X is version control for structured state. It helps people and agents review,
validate, and commit changes without losing their source, checks, decisions, or
history.

YOps and YSchema remain independently useful engines. Their detailed package
documentation lives next to the code.

This directory contains curated project documentation that is intended to be
tracked in git, reviewed in pull requests, and published with the open source
repository.

## Documentation Policy

- `docs/` is for public, maintained documentation.
- `notes/` is for local working notes, AI-generated drafts, audits, and
  exploratory plans. It is ignored by git.
- Draft material should move from `notes/` into `docs/` only after an owner
  edits it into a stable project document.

## Current Public Docs

- [Deployment guide](deployment.md)
- [Alpha limitations](limitations.md)
- [Stability summary](stability.md)
- [Stability policy](release/stability-policy.md)
- [Transition conformance](../packages/transition/conformance/README.md)
- [Branch protection](contributing/branch-protection.md)
- [PR and release guards](contributing/pr-and-release-guards.md)

## Related Root Files

- [`README.md`](../README.md) is the first-stop product overview and quickstart.
- [`AGENTS.md`](../AGENTS.md) gives cross-agent development guidance.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) covers contributor basics.
- [`SECURITY.md`](../SECURITY.md) covers security reporting expectations.
- [`RELEASE.md`](../RELEASE.md) declares the current npm release surface.
- `.github/` contains issue templates, workflows, ownership rules, and
  maintainer-facing release policy.
