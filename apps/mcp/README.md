# @t3x-dev/mcp

T3X MCP Server -- semantic version control tools for AI agents.

## Installation

### Claude Code

Add to your MCP settings (`~/.claude.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"],
      "env": {
        "T3X_API_URL": "http://localhost:8000/api",
        "T3X_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"],
      "env": {
        "T3X_API_URL": "http://localhost:8000/api"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `t3x_extract` | Extract semantic knowledge from text into YAML. Pass `conversation_id` for incremental extraction with drift detection. |
| `t3x_commit` | Commit reviewed YAML as an immutable semantic record. |
| `t3x_check` | Validate text against leaf constraints (require/exclude rules). |
| `t3x_generate` | Generate output from a leaf using committed knowledge as context. |
| `t3x_show` | Show the current semantic knowledge for a project. |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `T3X_API_URL` | T3X API server URL | `http://localhost:8000/api` |
| `T3X_API_KEY` | API key for authentication | _(none, optional for local dev)_ |

## Example Workflow

```
User: "commit our last conversation about pricing"

Claude Code (via MCP):
  1. t3x_show({ project_id: "proj_abc" })        -> reads current knowledge
  2. t3x_extract({ project_id: "proj_abc", text: "..." })  -> extracts YAML
  3. Shows user the YAML for review
  4. t3x_commit({ project_id: "proj_abc", draft_id: "..." })  -> commits
```

## Self-Hosted / Docker

Point `T3X_API_URL` to your Docker instance:

```json
{
  "env": {
    "T3X_API_URL": "http://your-t3x-server:8000/api"
  }
}
```
