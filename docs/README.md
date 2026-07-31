# T3X Documentation

T3X is version control for structured state. Its central idea is **change as a
verifiable object**: a proposed change binds its exact Base, replayable Effect,
derived Result, surrounding Statements, Decision, and optional CommitV2.

The deterministic State law and governance lifecycle are:

```text
Result = Replay(Base, DefinitionOf(Effect))
Propose -> Verify* -> Decide -> Commit?
```

YOps and YSchema remain independently useful engines. One-way adapters compose
them with the leaf Transition kernel, storage, external checks, and task-first
product surfaces.

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
