# Project Workbench Boundaries

This document defines the product and UI ownership boundaries for the
project-first T3X workbench. It is the shared reference for the UI refactor
workstreams around Project, Schema, Workspace, Reviews, Outputs, and their
workspace-level sub-surfaces.

The core product path stays:

```text
Source bundle -> Candidate -> YSchema -> YOps -> Commit -> Leaf artifact
```

## Purpose

The UI must keep project-level assets separate from workspace-level work in
progress. The most important distinction is that `Schema` and `YSchema` are not
the same surface:

- `Schema` is the project-level template and version registry.
- `YSchema` is the workspace-level transformation and validation surface.

This boundary keeps old commits auditable, prevents one workspace from silently
changing another workspace, and makes schema upgrades explicit reviewable
events.

## Project-Level Surfaces

| Surface | Owns | Must not own |
| --- | --- | --- |
| `State` | Committed state, commit graph, state nodes, structured diff, provenance | Workspace drafts, schema template editing |
| `Schema` | Schema templates, schema versions, active/draft/deprecated status, project default, publish and deprecate actions | Workspace YSchema transformation, workspace gap fixing |
| `Workspace` | Entry point to workspace candidates and their source-to-commit work | Project-level schema registry, committed leaf artifact lists |
| `Reviews` | Workspace candidate reviews, schema upgrade reviews, merge reviews, publish approvals | Live workspace editors or real-time YSchema validation UI |
| `Outputs` | Committed leaf artifacts, source commit, schema version, leaf target, freshness | Draft leaf config or uncommitted workspace output targets |
| `Community` | Discussion, notes, and links to workspace/review/output records | Direct mutation of committed state |
| `Settings` | Provider, model, automation, output rules, and project default summaries | Schema release detail editing or workspace operation surfaces |

## Workspace-Level Surfaces

| Surface | Owns | Must not own |
| --- | --- | --- |
| `Sources` or `Chat` | Chat turns, documents, prompt runs, imports, and source bundle evidence | Schema release management |
| `YSchema` | Transforming source/candidates with the selected schema, validation, gap fixing, draft overrides, schema change proposals | Project-level schema registry and publish history |
| `YOps` | Deterministic operation drafts, apply preview, operation log, commit handoff | Schema template publishing or release management |
| `Canvas` | Workspace-local source -> candidate -> YOps -> commit/leaf relationships | Project-wide long-term state registry |
| `Leaf config` | Draft leaf targets and generation settings for this workspace | Already generated committed leaf artifacts |

## Boundary Rules

1. `Schema` is project-level template and version management.
2. `YSchema` is workspace-level transformation and validation.
3. A workspace may create a schema draft, draft override, or schema change
   proposal.
4. A project schema gets a new version only after an explicit publish or promote
   action.
5. Published schema versions are immutable. Do not edit `v2` in place to mean a
   different contract later.
6. Commits record the schema/template version used at commit time.
7. `Leaf config` lives in the workspace as draft generation configuration.
8. `Outputs` are committed leaf artifacts generated from committed state.
9. `Reviews` are approval queues for cross-boundary decisions, not live editors.
10. Community discussion can link to records but cannot directly mutate state.

## Schema Upgrade Flow

Schema changes discovered during workspace work should follow this path:

```text
Project Schema v2
  -> selected by a Workspace
  -> Workspace / YSchema validates candidate and proposes schema changes
  -> schema draft or change proposal
  -> review and publish
  -> Project Schema v3 appears
```

The old version remains available for old commits and pinned workspaces.

## Leaf Output Flow

Leaf output work should follow this path:

```text
Workspace / Leaf config
  -> commit or committed-state generation
  -> Project Outputs
  -> committed leaf artifact
```

Project `Outputs` should not display uncommitted draft targets from a workspace.

## S1 Scope

S1 owns only project-level shells and mock semantics for:

- `Schema`: schema template/version registry.
- `Reviews`: project-level approval queues.
- `Outputs`: committed leaf artifacts.

S1 must not build the workspace-level `YSchema`, `YOps`, or `Leaf config`
surfaces.

## W1 Scope

W1 owns workspace-level construction:

- workspace selector and workspace header.
- source bundle presentation.
- workspace `YSchema` transformation and validation surface.
- workspace `YOps` draft surface.
- workspace canvas.
- workspace `Leaf config`.

W1 should reference project `Schema` versions, but not implement project-level
schema release management.

## I1 Scope

I1 connects the boundaries after S1 and W1 land:

- preserve project context and selected tab state.
- keep `Schema` registry distinct from workspace `YSchema`.
- keep workspace `Leaf config` distinct from project `Outputs`.
- verify old chat, draft, commit, merge, and leaf routes still render.
- fix layout, wording, routing, and regression issues without adding large new
  product surfaces.
