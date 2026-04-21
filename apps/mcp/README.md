# @t3x-dev/mcp

T3X MCP server for AI agents.

This package is the runnable stdio wrapper around `@t3x-dev/mcp-lib`.

## Current Surface

The current MCP server exposes three protocol surfaces:

- `Tools`
- `Resources`
- `Prompts`

### Tools

The tool surface is `tools-first` and uses 8 umbrella tools.

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

### Resources

The server currently exposes these resource templates:

- `t3x://projects/{project_id}`
- `t3x://commits/{commit_hash}`
- `t3x://workbench-drafts/{draft_id}`
- `t3x://conversations/{conversation_id}`
- `t3x://leaves/{leaf_id}`
- `t3x://merge-drafts/{draft_id}`

### Prompts

The server currently exposes these workflow prompts:

- `extract_review_commit`
- `inspect_workbench_draft`
- `prepare_resolve_merge`
- `generate_from_leaf`

Prompts are user-facing workflow entries for MCP hosts. Agent guidance still mainly comes from tool descriptions and server instructions.

## Installation

Add the server to your MCP host using the published binary:

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"],
      "env": {
        "T3X_TOOLSETS": "core,advanced",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

For local development inside this repo, the committed root `.mcp.json` already points at `apps/mcp/dist/index.js`.

## Runtime Model

This server currently runs over `stdio` only.

- `stdio` is implemented
- `http` is not implemented yet

The server talks directly to T3X storage:

- if `DATABASE_URL` is set, it uses Postgres
- otherwise it starts embedded Postgres under `.t3x/pg-data`

This means the MCP server does not use `T3X_API_URL` or `T3X_API_KEY`.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `T3X_TOOLSETS` | Comma-separated toolsets to enable | `core` |
| `T3X_TRANSPORT` | MCP transport | `stdio` |
| `DATABASE_URL` | Postgres connection string; when omitted, embedded Postgres is used | unset |
| `T3X_DATA_DIR` | Embedded Postgres data directory | `.t3x/pg-data` |
| `T3X_PG_PORT` | Embedded Postgres port | `5445` |
| `ANTHROPIC_API_KEY` | Required for `t3x_extract` and `t3x_generate` | unset |

## Example Workflow

```text
Extract -> Inspect -> Edit -> Commit

1. t3x_admin({ action: "create_project", name })         -> project_id
2. t3x_extract({ project_id, text })                     -> draft_id
3. t3x_query({ target: "draft", id: draft_id })          -> inspect workbench draft
4. t3x_edit({ draft_id, yops, if_revision })             -> refine draft
5. t3x_commit({ project_id, draft_id, message })         -> commit_hash

Merge

1. t3x_diff({ source_hash, target_hash })                -> semantic diff
2. t3x_merge({ action: "prepare", source_hash, target_hash })
3. t3x_query / resources/read merge draft for inspection
4. t3x_merge({ action: "resolve", ... })
5. t3x_merge({ action: "execute", ... })                 -> merge commit_hash
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
