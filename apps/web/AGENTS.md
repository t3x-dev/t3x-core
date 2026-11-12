# WebUI Agent Guide

Follow the [repository guide](../../AGENTS.md). This file is the WebUI entry
point; detailed contracts live in `docs/`.

## Scope and required reading

- Read the relevant sections of [architecture](docs/architecture.md) before
  changing module responsibilities or data flow, and [business contracts](docs/business.md)
  before changing State, Schema or Workspace behavior.
- **Applies when** a WebUI task needs changes across packages or layers.
  - **Action** Use the task authorization to determine what can change and the
    owning contracts to determine where it belongs. Make authorized changes in
    their owning packages and preserve transport, authorization, application,
    storage, and protocol boundaries.
  - **Block when** a required change falls outside the task authorization. Pause
    that change and work that depends on it. For a backend gap in a frontend-only
    task, hand off the reproduction conditions, evidence, impact, and unknowns.
  - **Verify** Check the affected packages and behavior against the authorized
    scope before editing and again against the actual diff before delivery.
- Apply A-01 through A-05 and B-01 through B-07 within their declared scopes.
  Distinguish target rules from current implementation and verification evidence.
- Record deviations as implementation gaps. New requirements need an explicit
  decision in the owning contract; do not invent policy through an implementation
  or weaken an existing guard to accommodate a gap.

## Changes and verification

- Reuse existing patterns and keep changes scoped to the task. Inspect callers,
  data ownership and version boundaries before changing shared behavior.
- Follow the [repository verification policy](../../AGENTS.md#verification);
  available WebUI commands are indexed in the [README](README.md#checks).
- Preserve the distinction between code checks, rendered visual inspection and
  business acceptance. Verify the served checkout before browser inspection.
- Update the owning contract only when the rule and its scope are confirmed
  and the task explicitly authorizes writing that contract. Follow the
  [documentation maintenance policy](docs/architecture.md#verification-and-maintenance)
  for implementation gaps. Keep task plans, issue investigations, screenshots
  and execution logs outside maintained docs.
- Keep this guide and README as entry points; maintain detailed rules once in
  `docs/`, and link to system-owned contracts rather than duplicating them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
