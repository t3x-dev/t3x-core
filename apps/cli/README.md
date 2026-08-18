# @t3x-dev/cli

Command-line interface for T3X structured-state workflows.

## Preview status

The CLI is a preview/internal surface. It is not part of the current public
alpha package surface; the public alpha packages are `@t3x-dev/local`,
`@t3x-dev/yops`, `@t3x-dev/transition`, and `@t3x-dev/yschema`.

## First-Stage Scope

The legacy compatibility path remains available:

`create project -> extract -> show draft -> yops apply -> commit -> create leaf -> generate leaf`

The `commit` command is part of that path and commits a draft, not a local
YAML/JSON file.

Source-backed Repository extraction uses the same persisted Workspace contract
as MCP and WebUI:

```bash
t3x extract -p proj_abc \
  --workspace workspace_abc \
  --source-thread conv_abc \
  --turn-hash sha256:turn_1 sha256:turn_2 \
  --if-revision 3
```

This mode returns a durable Workspace candidate that WebUI can inspect. Raw
`--text` extraction continues to return a workbench `draft_id` for compatibility.

## Transition Control Plane

`t3x transition` is the canonical CLI surface for the Transition lifecycle. It
does not construct protocol authority facts locally. The CLI supplies task
inputs and idempotency keys; the API resolves the Workspace, Source material,
actor, policy, review digest, Statement issuer, Decision envelope, and ref CAS.

The full lifecycle is:

```text
propose -> inspect -> verify -> attach-statement* -> decide -> commit
```

`attach-statement` is optional and intended for allowlisted external evidence.
It accepts only predicate content and graph roles; the Statement envelope and
issuer are server-owned.

The command group mirrors the API client one-to-one:

| CLI command | API client method | Mutates history? |
| --- | --- | --- |
| `t3x transition propose` | `proposeTransition` | No |
| `t3x transition inspect` | `inspectTransition` | No |
| `t3x transition verify` | `verifyTransition` | No, records verification Statements |
| `t3x transition attach-statement` | `attachTransitionStatement` | No, records external evidence |
| `t3x transition decide` | `decideTransition` | No, records a Decision |
| `t3x transition commit` | `commitTransition` | Yes, only after accepted/authorized Decision and exact-head CAS |

The important negative contract is as important as the happy path: the CLI has
no flags for actor, policy, issuer, workspace projection, observed Statement
set, or ref head observation beyond `--expected-head`/`--empty-head` at commit
time. Those facts are server-derived or server-checked.

Structured YOps proposals can come from inline operations or from a
server-owned extraction candidate:

```bash
t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:rename-device:1 \
  --operations-json '[{"set":{"path":"device/name","value":"greenhouse"}}]' \
  --if-revision 7

t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:from-source:1 \
  --extraction-candidate-id candidate_abc
```

Exact-source proposals use the same command with an explicit closed kind:

```bash
t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:import-source:1 \
  --kind exact_source_import \
  --artifact-json '{"format":"t3x.dev/workspace-source-artifact/v1","root_path":"docs/device.yaml"}' \
  --root-json '{"material_id":"material:source:root"}'

t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:edit-source:1 \
  --kind exact_source_edit \
  --artifact-json '{"format":"t3x.dev/workspace-source-artifact/v1","root_path":"docs/device.yaml"}' \
  --operations-json '[{"op":"replace_scalar","path":["frontmatter","title"],"expect":"Old","value":"Reviewed"}]'

t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:revert-source:1 \
  --kind exact_source_revert \
  --commit-id sha256:previous_commit
```

After proposal:

```bash
t3x transition inspect trn_abc -p proj_abc --json
t3x transition verify trn_abc -p proj_abc --request-id verify:trn_abc:1 --json

t3x transition attach-statement trn_abc \
  -p proj_abc \
  --request-id statement:ci:1 \
  --predicate-type example.dev/ci-review/v1 \
  --predicate-json '{"outcome":"passed"}' \
  --subjects effect,result

t3x transition decide trn_abc \
  -p proj_abc \
  --request-id decision:trn_abc:1 \
  --outcome accepted \
  --precondition-json '{"workspace_revision":7,"ref_name":"main","ref_head":null,"effect_digest":"sha256:...","proposal_digest":"sha256:...","statement_digests":[],"policy_digest":null}'

t3x transition commit trn_abc \
  -p proj_abc \
  --request-id commit:trn_abc:1 \
  --decision-digest sha256:decision \
  --empty-head
```

## Core Rule

**CLI mutations to drafts go through YOps.** The CLI is a YOps pipeline, not a
semantic editor. It does **not** offer convenience commands like `slot set` or
`node add` because that would introduce a second mutation protocol in parallel
to YOps and break the project's "all tree mutation goes through YOps"
invariant.

## Environment

- `T3X_API_URL` — API base URL (default `http://localhost:8000/api`)
- `T3X_API_KEY` — Bearer token for authenticated endpoints
- `T3X_DRAFT` — default draft ID used when a command's `[draft-id]` positional
  is omitted by `show draft`, `delete draft`, `yops apply`, and `commit`

## Local Shared Access

For a one-machine local setup, the CLI and MCP read one machine-local config
file, and WebUI can manage that same file through the standalone API:

```text
~/.t3x/config.json
```

This file stores the current `api_url` and the single active `api_key` for this
machine. The effective lookup order is:

```text
T3X_API_URL / T3X_API_KEY (environment)
-> ~/.t3x/config.json
-> built-in defaults
```

That means environment variables always win. File changes still persist, but
they will not take effect until the environment override is removed.

Use the CLI to inspect or update the shared config:

```bash
t3x auth use-key t3xk_xxx
t3x auth status
t3x auth check
t3x config set api-url http://localhost:8000/api
t3x config show
```

The same shared values are also visible in WebUI under `/settings/access` when
WebUI is pointed at the same standalone API instance. Use `t3x auth check`
after changing either value to confirm whether the target API is reachable, and
whether that deployment requires or accepts the configured key.

## Main Path

```bash
# 1. Create a project
t3x create project "Travel Notes"

# 2. Extract text into a draft
t3x extract -p proj_abc --text "I have 5000 yuan and want a 5-day Hangzhou trip."

# 3. Inspect the draft
t3x show draft draft_xyz
export T3X_DRAFT=draft_xyz

# 4. Apply YOps to the draft
t3x yops apply --file ops.yaml

# 5. Commit the draft
t3x commit -p proj_abc -m "Refine travel plan"

# 6. Create a leaf from the commit
t3x create leaf -p proj_abc -c sha256:commit_hash -t article --title "Hangzhou plan"

# 7. Generate the leaf output
t3x generate leaf leaf_abc
```

## Draft Commands

```bash
t3x list drafts --project proj_abc
t3x show draft draft_xyz
t3x delete draft draft_xyz --force
```

## YOps

```yaml
yops:
  - set:       { path: trip/budget, value: 5000 }
  - define:    { path: trip/activities }
  - populate:  { path: trip/hotel, values: { type: ryokan, area: Asakusa } }
  - drop:      { path: trip/old_plan }
```

```bash
t3x yops validate --file ops.yaml
t3x yops apply draft_xyz --file ops.yaml
export T3X_DRAFT=draft_xyz
t3x yops apply --file ops.yaml
t3x yops apply draft_xyz --file ops.yaml --if-revision 7
```

`POST /v1/drafts/:id/apply-yops` requires an `if_revision` for optimistic
locking. When `--if-revision` is omitted, the CLI fetches the draft first,
reads its current `revision`, and applies — two round-trips but zero
arguments to think about.
