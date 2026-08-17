# @t3x-dev/mcp

T3X MCP server for AI agents.

This package is the runnable stdio wrapper around `@t3x-dev/mcp-lib`.

## Preview status

The MCP server is a preview/internal surface. It is not part of the current
public alpha package surface; the public alpha packages are
`@t3x-dev/local`, `@t3x-dev/yops`, and `@t3x-dev/yschema`.

## Current Surface

The current MCP server exposes three protocol surfaces:

- `Tools`
- `Resources`
- `Prompts`

### Tools

The default tool surface is `tools-first` and uses 8 umbrella tools.

Core:

- `t3x_query`
- `t3x_extract`
- `t3x_edit`
- `t3x_commit`
- `t3x_generate`

Advanced:

- `t3x_diff`
- `t3x_merge`
- `t3x_admin`

Transition (opt-in, API backend only):

- `propose_transition`
- `inspect_transition`
- `verify_transition`
- `attach_statement`
- `decide_transition`
- `commit_transition`

The Transition toolset exposes task-oriented transition views. It does not
accept caller-written actors, policy facts, workspace projection facts, or other
trust-chain metadata. Decision and Commit operations are routed through the API
backend so authority, review preconditions, and ref CAS remain server-owned.

### Resources

The server currently exposes these resource templates:

- `t3x://projects/{project_id}`
- `t3x://commits/{commit_hash}`
- `t3x://workbench-drafts/{draft_id}`
- `t3x://source-threads/{source_thread_id}`
- `t3x://leaves/{leaf_id}`
- `t3x://merge-drafts/{draft_id}`

`t3x://conversations/{conversation_id}` remains a compatibility alias for the
source-thread resource.

### Prompts

The server currently exposes these workflow prompts:

- `extract_review_commit`
- `inspect_workbench_draft`
- `prepare_resolve_merge`
- `generate_from_leaf`

Prompts are user-facing workflow entries for MCP hosts. Agent guidance still mainly comes from tool descriptions and server instructions.

## Installation

After this package is promoted and published, it can be added to an MCP host
with the package binary:

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"],
      "env": {
        "T3X_TOOLSETS": "core,advanced,transition",
        "T3X_MCP_BACKEND": "api"
      }
    }
  }
}
```

Model-backed tools (`t3x_extract`, `t3x_generate`) now prefer the same
DB-backed provider credentials used by the T3X app. If you have already
configured providers in WebUI/API settings, MCP reuses them automatically.
Environment variables remain available as a local fallback.

For local development inside this repo, the committed root `.mcp.json` already points at
`apps/mcp/dist/index.js`, enables the Transition toolset, and defaults to the
`api` backend so MCP follows the same persisted Workspace path as CLI and WebUI.

## Runtime Model

This server currently runs over `stdio` only.

- `stdio` is implemented
- `http` is not implemented yet

The server supports two backends:

- `storage`
  - if `DATABASE_URL` is set, it uses Postgres
  - otherwise it starts embedded Postgres under `.t3x/pg-data`
- `api`
  - talks to the T3X API via `T3X_API_URL`
  - reuses `T3X_API_KEY` or the shared `~/.t3x/config.json` key when present

The opt-in `transition` toolset requires the `api` backend. In `storage` mode,
all four Transition tools fail closed with `API_BACKEND_REQUIRED`; there is no
direct-storage fallback for authenticated authority or issuer context.

API-backed resources and Source evidence reads also pass through the API
boundary. `source_evidence` is unavailable in storage mode because project
authorization and observation completeness belong to the Source service.
Direct storage remains available for the legacy single-user extract/edit/commit
workflow; it is not a mutation authority for Source or Transition operations.

Local Codex/Cursor development should prefer the `api` backend so MCP and CLI
see the same data without each process trying to own embedded Postgres.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `T3X_TOOLSETS` | Comma-separated toolsets to enable: `core`, `advanced`, `transition` | `core` |
| `T3X_TRANSPORT` | MCP transport | `stdio` |
| `T3X_MCP_BACKEND` | Backend mode: `storage` or `api` | `storage` |
| `T3X_API_URL` | Base API URL for `api` backend | `http://localhost:8000/api` |
| `T3X_API_KEY` | Optional API key for `api` backend | unset |
| `DATABASE_URL` | Postgres connection string; when omitted, embedded Postgres is used | unset |
| `T3X_DATA_DIR` | Embedded Postgres data directory | `.t3x/pg-data` |
| `T3X_PG_PORT` | Embedded Postgres port | `5445` |
| `ANTHROPIC_API_KEY` | Optional fallback for Anthropic-backed generation/extraction | unset |
| `OPENAI_API_KEY` | Optional fallback for OpenAI-backed generation/extraction | unset |
| `GOOGLE_AI_STUDIO_KEY` | Optional fallback for Gemini-backed generation/extraction | unset |

## Example Workflow

```text
Legacy compatibility: Extract -> Inspect -> Edit -> Commit

1. t3x_admin({ action: "create_project", name })         -> project_id
2. t3x_extract({ project_id, text })                     -> draft_id
3. t3x_query({ target: "draft", id: draft_id })          -> inspect workbench draft
4. t3x_edit({ draft_id, yops, if_revision })             -> refine draft
5. t3x_commit({ project_id, draft_id, message })         -> commit_hash

Merge

1. t3x_diff({ source_hash, target_hash })                -> structured diff
2. t3x_merge({ action: "prepare", source_hash, target_hash })
3. t3x_query / resources/read merge draft for inspection
4. t3x_merge({ action: "resolve", ... })
5. t3x_merge({ action: "execute", ... })                 -> merge commit_hash

Transition (requires `T3X_MCP_BACKEND=api`)

1. propose_transition({ project_id, ... })              -> transition_id + TransitionViewV1
2. inspect_transition({ project_id, transition_id })    -> current task-oriented view
3. verify_transition({ project_id, transition_id, ... }) -> replay/validation observations
4. attach_statement({ project_id, transition_id, ... }) -> updated view
5. decide_transition({ project_id, transition_id, ... }) -> decision_digest + updated view
6. commit_transition({ project_id, transition_id, ... }) -> commit_digest + TransitionViewV1
```

## Build

```bash
pnpm build:core
pnpm --filter @t3x-dev/mcp-lib build
pnpm --filter @t3x-dev/mcp build
```

## Development

```bash
pnpm --filter @t3x-dev/mcp dev
```
