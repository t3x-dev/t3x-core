# @t3x-dev/cli

Command-line interface for T3X — semantic version control for AI conversations.

## Core Rule

**CLI mutations to drafts go through YOps.** The CLI is a YOps pipeline, not a
semantic editor. It does **not** offer convenience commands like `slot set` or
`node add` because that would introduce a second mutation protocol in parallel
to YOps and break the project's "all tree mutation goes through YOps"
invariant.

- To edit a draft interactively → use the WebUI.
- To edit a draft from a shell, script, or CI job → author a YOps YAML
  document and pipe it to `t3x yops apply`.
- To let an LLM agent edit a draft → use the MCP `t3x_edit` tool.

All three paths end up at `POST /v1/drafts/:id/apply-yops`, which writes to
`yops_log` for full audit / rebase traceability.

## Environment

- `T3X_API_URL` — API base URL (default `http://localhost:8000/api`).
- `T3X_API_KEY` — Bearer token for authenticated endpoints.
- `T3X_DRAFT` — default draft ID used when a command's `[draft-id]` positional
  is omitted. Commands that honour it: `yops apply`, `show draft`,
  `delete draft`.

## Draft Management

```bash
# List drafts in a project
t3x list drafts --project proj_abc

# Show a single draft (uses T3X_DRAFT if omitted)
t3x show draft draft_xyz
t3x show draft --json

# Delete a draft
t3x delete draft draft_xyz            # prompts for confirmation
t3x delete draft draft_xyz --force    # no prompt
t3x delete draft --json               # implies --force, prints JSON
```

## YOps

```bash
# Validate a YOps document (dry-run; does not modify the draft)
t3x yops validate --file ops.yaml
cat ops.yaml | t3x yops validate --stdin

# Apply a YOps document to a draft
t3x yops apply draft_xyz --file ops.yaml
cat ops.yaml | t3x yops apply draft_xyz --stdin

# With T3X_DRAFT set, the positional is optional:
export T3X_DRAFT=draft_xyz
t3x yops apply --file ops.yaml

# Explicit optimistic-locking revision (skips auto-fetch):
t3x yops apply draft_xyz --file ops.yaml --if-revision 7

# View YOps history for a conversation
t3x yops log -c conv_abc
```

### YOps YAML format

```yaml
yops:
  - set:       { path: trip/budget, value: 5000 }
  - define:    { path: trip/activities }
  - populate:  { path: trip/hotel, values: { type: ryokan, area: Asakusa } }
  - drop:      { path: trip/old_plan }
```

See `packages/yops/yops.yaml` for the full 18-operation spec. Use
`t3x schema yops` to print the JSON Schema.

## Revision handling (`--if-revision`)

`POST /v1/drafts/:id/apply-yops` requires an `if_revision` for optimistic
locking. When `--if-revision` is omitted, the CLI fetches the draft first,
reads its current `revision`, and applies — two round-trips but zero
arguments to think about.

For concurrent or CI workloads where you want a deterministic conflict
failure, pass `--if-revision <n>` explicitly.
