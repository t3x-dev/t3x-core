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

## Tools (43)

### Core Workflow

| Tool | Description |
|------|-------------|
| `t3x_extract` | Extract semantic knowledge from text into YAML |
| `t3x_show_draft` | Show draft content (trees + source quotes) |
| `t3x_edit_draft` | Edit draft with YOps (YAML Operations) |
| `t3x_commit` | Commit semantic knowledge as an immutable record |
| `t3x_show` | Show current semantic knowledge for a project |
| `t3x_check` | Validate text against leaf constraints |
| `t3x_schema` | Get T3X JSON Schema for semantic content |
| `t3x_validate` | Validate semantic content against schema |
| `t3x_yops_schema` | Get JSON Schema for YOps operations |

### Projects

| Tool | Description |
|------|-------------|
| `t3x_list_projects` | List all projects |
| `t3x_create_project` | Create a new project |
| `t3x_show_project` | Show project details and stats |
| `t3x_delete_project` | Delete a project (soft/permanent) |
| `t3x_restore_project` | Restore a soft-deleted project |

### Version Control

| Tool | Description |
|------|-------------|
| `t3x_list_commits` | List commits for a project |
| `t3x_show_commit` | Show full commit content |
| `t3x_diff` | Compare two commits (semantic diff) |
| `t3x_create_branch` | Create a new branch |
| `t3x_switch_branch` | Switch active branch |
| `t3x_list_branches` | List all branches |
| `t3x_current_branch` | Get the current active branch |

### Merge

| Tool | Description |
|------|-------------|
| `t3x_merge_prepare` | Analyze two commits for merging (conflicts, auto-kept, etc.) |
| `t3x_merge_execute` | Execute merge with user decisions |

### Conversations

| Tool | Description |
|------|-------------|
| `t3x_list_conversations` | List conversations in a project |
| `t3x_create_conversation` | Create a new conversation |
| `t3x_get_conversation` | Get conversation details |
| `t3x_delete_conversation` | Delete a conversation |
| `t3x_add_turn` | Add a message to a conversation |
| `t3x_list_turns` | List turns in a conversation |

### Drafts

| Tool | Description |
|------|-------------|
| `t3x_show_draft` | Show draft content |
| `t3x_edit_draft` | Edit draft with YOps |
| `t3x_list_drafts` | List drafts for a project |
| `t3x_delete_draft` | Delete a draft |

### Leaves

| Tool | Description |
|------|-------------|
| `t3x_list_leaves` | List leaves for a project |
| `t3x_create_leaf` | Create a leaf (output template) |
| `t3x_show_leaf` | Show leaf details |
| `t3x_delete_leaf` | Delete a leaf |
| `t3x_generate` | Generate output from a leaf |

### Import / Export

| Tool | Description |
|------|-------------|
| `t3x_import_url` | Import conversation from URL |
| `t3x_export` | Export project data as ledger |

### Chat

| Tool | Description |
|------|-------------|
| `t3x_chat` | LLM conversation through T3X |

### Webhooks & Sharing

| Tool | Description |
|------|-------------|
| `t3x_list_webhooks` | List webhooks |
| `t3x_create_webhook` | Create a webhook |
| `t3x_delete_webhook` | Delete a webhook |
| `t3x_create_share` | Create a share token |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `T3X_API_URL` | T3X API server URL | `http://localhost:8000/api` |
| `T3X_WEB_URL` | T3X WebUI URL (for auth callback) | `http://localhost:3000` |

## Example Workflow

```
Agent workflow: Extract → Triage → Edit → Commit

1. t3x_list_projects()                           -> find project
2. t3x_extract({ project_id, text })             -> extract knowledge, get draft_id
3. t3x_show_draft({ draft_id })                  -> review extraction
4. t3x_yops_schema()                             -> learn YOps format
5. t3x_edit_draft({ draft_id, yops, if_revision }) -> fix errors
6. t3x_commit({ project_id, draft_id })          -> commit knowledge

Merge workflow:
1. t3x_merge_prepare({ source_hash, target_hash }) -> analyze conflicts
2. t3x_merge_execute({ ..., decisions, message })   -> execute merge
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
