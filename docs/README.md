# T3X Documentation

T3X is a structured source of truth for AI-produced work. It captures meaning
from conversations, documents, transcripts, specs, and notes into reviewable
knowledge, mutates that knowledge through deterministic YOps, and versions it
with commits, diffs, merges, and leaves.

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

- [Stability policy](release/stability-policy.md)
- [Branch protection](contributing/branch-protection.md)
- [PR and release guards](contributing/pr-and-release-guards.md)

## Related Root Files

- [`README.md`](../README.md) is the first-stop product overview and quickstart.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) covers contributor basics.
- [`SECURITY.md`](../SECURITY.md) covers security reporting expectations.
- [`LIMITATIONS.md`](../LIMITATIONS.md) covers restricted alpha limitations.
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) covers self-hosted and source deployment
  expectations.
- [`STABILITY.md`](../STABILITY.md) summarizes the alpha contract surface.
- `.github/` contains issue templates, workflows, ownership rules, and
  maintainer-facing release policy.
