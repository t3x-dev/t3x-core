# @t3x-dev/cli

Command-line interface for T3X repository workflows.

## Preview status

The CLI is a preview/internal surface. It is not part of the current public
alpha package surface; the public alpha packages are `@t3x-dev/local`,
`@t3x-dev/yops`, `@t3x-dev/transition`, and `@t3x-dev/yschema`.

## Repository workflow

Repository changes use one authority path across CLI, MCP, WebUI, and REST:

```text
immutable Source turns
  -> Workspace extraction candidate
  -> Transition proposal
  -> review and verification
  -> Decision
  -> exact-head CommitV2
```

The CLI does not maintain a separate conversational Draft model. Historical
YOps remain readable as archived evidence, but cannot define current project
state.

### 1. Select exact Source evidence

Create or select a project, Source Thread, and persisted Repository Workspace.
Then extract from explicit immutable turn hashes:

```bash
t3x extract -p proj_abc \
  --workspace workspace_abc \
  --source-thread conv_abc \
  --turn-hash sha256:turn_1 sha256:turn_2 \
  --if-revision 3
```

The response contains a durable extraction `candidate_id`. It does not create
a workbench Draft.

### 2. Propose a Transition

Propose the extraction candidate:

```bash
t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:from-source:1 \
  --extraction-candidate-id candidate_abc
```

Or propose structured YOps directly:

```bash
t3x transition propose workspace_abc \
  -p proj_abc \
  --request-id proposal:rename-device:1 \
  --operations-json '[{"set":{"path":"device/name","value":"greenhouse"}}]' \
  --if-revision 7
```

`t3x yops apply <workspace-id>` is a compatibility command name, but it is a
thin adapter to the same Transition proposal API:

```bash
t3x yops validate --file ops.yaml
t3x yops apply workspace_abc \
  -p proj_abc \
  --request-id proposal:yops:1 \
  --file ops.yaml \
  --if-revision 7
```

### 3. Review, decide, and commit

```bash
t3x transition inspect trn_abc -p proj_abc --json
t3x transition verify trn_abc \
  -p proj_abc \
  --request-id verify:trn_abc:1 \
  --json

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

The top-level `t3x commit` command remains as a thin compatibility alias for
`t3x transition commit`; it does not commit a Draft or a local file.

`attach-statement` can add allowlisted external review evidence. The caller
supplies predicate content and graph roles only; actor, issuer, policy,
Workspace projection, observed Statements, and ref state remain server-owned.

## Exact-source transitions

The same proposal command supports the closed exact-source request kinds:

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

## Historical YOps evidence

Legacy YOps are retained for audit and migration, never as active repository
authority:

```bash
t3x yops log \
  --project proj_abc \
  --conversation conv_abc \
  --json
```

This reads the project-scoped archived-evidence endpoint. It does not revive
the retired conversation YOps writer or Draft lifecycle.

## Generated outputs

After a CommitV2 exists, a leaf can select and generate an output:

```bash
t3x create leaf -p proj_abc -c sha256:commit_hash -t article --title "Hangzhou plan"
t3x generate leaf leaf_abc
```

Merge Drafts remain available under the merge commands. They are temporary
conflict-resolution artifacts and are not repository mutation authority.

## Environment

- `T3X_API_URL` — API base URL (default `http://localhost:8000/api`)
- `T3X_API_KEY` — bearer token for authenticated endpoints

For a one-machine local setup, CLI and MCP can share:

```text
~/.t3x/config.json
```

The lookup order is:

```text
T3X_API_URL / T3X_API_KEY
-> ~/.t3x/config.json
-> built-in defaults
```

Manage and verify the shared configuration with:

```bash
t3x auth use-key t3xk_xxx
t3x auth status
t3x auth check
t3x config set api-url http://localhost:8000/api
t3x config show
```

## Authority rule

All active repository mutations converge on Workspace/Transition commands.
Compatibility names may adapt to that authority, but they must not create a
second write model. Optimistic concurrency is enforced with Workspace revision
checks during proposal and exact ref-head comparison during commit.
