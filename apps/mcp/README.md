# @t3x-dev/mcp

T3X MCP server for AI agents.

This package runs `@t3x-dev/mcp-lib` over stdio or Streamable HTTP.

## Preview status

The MCP server is a preview/internal surface. It is not part of the current
public alpha package surface; the public alpha packages are
`@t3x-dev/local`, `@t3x-dev/yops`, `@t3x-dev/transition`, and
`@t3x-dev/yschema`.

## Current Surface

The current MCP server exposes three protocol surfaces:

- `Tools`
- `Resources`
- `Prompts`

### Tools

In stdio mode, the default toolset is `core`. Enable `advanced` and `transition`
through `T3X_TOOLSETS`. Streamable HTTP uses a
[business capability allowlist](#business-capability-configuration).

Core:

- `t3x_query`
- `t3x_extract`
- `t3x_edit`
- `t3x_commit`
- `t3x_generate`
- `t3x_resolve_repository` (API backend)
- `t3x_committed_state` (API backend)
- `t3x_open_workspace` (authenticated API backend)

Use `t3x_resolve_repository` with an `owner/repo` address and explicit branch
name. It returns the canonical path, project ID, ref, and a `null` head for an
empty branch. Pass a non-null head to `t3x_committed_state` to read the full
value or export exact YAML or JSON. Its `schema_binding` action reports
`bound`, `unbound`, or `unknown` from historical Commit evidence.
Use `t3x_query` for history and `t3x_diff` to compare two exact Commits.
In API mode, two repository SemanticContent documents produce a tree and relation diff.
Other YOps document pairs produce `kind: "document"` with added, removed and modified
values addressed by JSON Pointer. Array positions are compared by index.

Use `t3x_open_workspace` with the project, explicit branch, expected head and
request ID. It opens the caller's private Workspace and reports its basis
separately from the current branch head. Use `t3x_query` with
`target=workspace_activity` and an optional JSON Pointer `path` to inspect
the saved Draft before using `t3x_edit mode=draft` or its reconciliation modes.

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
- `t3x_draft_review`
- `t3x_commit_result`

The Transition toolset exposes task-oriented transition views. It does not
accept caller-written actors, policy facts, workspace projection facts, or other
trust-chain metadata. Decision and Commit operations are routed through the API
backend so authority, review preconditions, and ref CAS remain server-owned.

#### Transition surface map

The MCP Transition toolset intentionally mirrors the CLI/API lifecycle without
turning protocol nouns into separate product models:

| Lifecycle step | MCP tool | API client method | Boundary rule |
| --- | --- | --- | --- |
| Prepare saved Draft Review | `t3x_draft_review` | `workspaces.authoring.prepareReview` | exact Draft revisions and base ref head |
| Read fixed Review | `t3x_draft_review` | `workspaces.getReviewSnapshot` | project, owned Workspace and snapshot ID |
| Prepare Proposal | `propose_transition` | `proposeTransition` | caller sends only a closed task request |
| Inspect review state | `inspect_transition` | `inspectTransition` | read-only, project-scoped Transition view |
| Verify | `verify_transition` | `verifyTransition` | Replay and external checks stay server-owned |
| Add external evidence | `attach_statement` | `attachTransitionStatement` | caller sends predicate content and subject roles only |
| Decide | `decide_transition` | `decideTransition` | caller copies the latest immutable review precondition |
| Commit | `commit_transition` | `commitTransition` | caller supplies `decision_digest` and exact `expected_head` |
| Read committed result | `t3x_commit_result` | `getCommitForTransition`, `inspectTransition`, branch and Workspace reads | fixed Commit plus separately read current branch and authorized Workspace |

`propose_transition` accepts the same closed request kinds as the API:

- `structured_yops`
  - either a non-empty `operations` array, or a server-owned
    `extraction_candidate_id`
- `exact_source_import`
  - an exact-source `artifact` selector and `root` material selector
- `exact_source_edit`
  - an exact-source `artifact` selector and `replace_scalar` operations
- `exact_source_revert`
  - a CommitV2 `commit_id` from the server's Transition graph

Anything that would assert trust-chain facts locally is intentionally absent
from the MCP schema: actor, policy, issuer, workspace projection, observed
Statement set, and ref head are all resolved or checked at the API boundary.

### Business capability configuration

Set `T3X_MCP_CAPABILITIES` to choose an allowlist on the authenticated API
backend. An explicit list takes precedence over the managed repository profile
on an OAuth-enabled HTTP deployment. Bearer-only HTTP requires an explicit
list. In stdio mode it takes precedence over
`T3X_TOOLSETS`. The legacy toolsets, resource aliases, and prompts remain
available in stdio mode when the capability variable is unset.

Set `T3X_MCP_BACKEND=api` and supply an API URL and credential for the target
deployment. Each business tool or resource read checks the current credential
through the API. The API authorizes the selected project, Workspace, operation,
and ref policy separately. A deployment capability never grants API authority.
An API running with local authentication disabled cannot serve this profile.

`read-only` is a shorthand for `context,repositories,state`. Use it alone for
a read-only profile. An explicit comma-separated list can enable additional
capabilities:

| Capability | Exposed operations |
| --- | --- |
| `context` | Current credential context |
| `repositories` | Repository and branch lookup, project resource |
| `repositories:create`, `branches:create` | Independently enable personal repository creation or branch creation. `repositories:write` continues to enable both. |
| `state` | Commit history, exact State read, Schema binding, export, diff, Commit resource |
| `workspace` | Workspace and Draft reads, Workspace resource |
| `workspace:write` | Open, edit, initialize, and reconcile a Workspace |
| `workspace:candidates:write` | Publish an existing governed generation candidate to its Draft |
| `schemas` | List, read, and validate against releases; read and preview saved Schema candidates; preview Content preparation |
| `schemas:candidates:write` | Save a Schema definition candidate in its Workspace |
| `schemas:write` | Exact Schema Draft action |
| `sources` | Source, evidence, and pin reads, exact excerpts, exact-source artifact selectors, and available models |
| `sources:write` | Extract a candidate, create or delete a pin |
| `sources:ingest` | Create a Source Thread, append machine-origin text, upload an attachment, and recover the request receipt |
| `sources:generate` | Generate a governed candidate from exact authorized Sources at a saved Workspace revision |
| `runs`, `runs:trigger` | Independently enable reading saved Commit YSchema Runs or starting a Run |
| `runs:workspace`, `runs:workspace:trigger` | Independently enable reading owned exact Draft validation Runs or starting a Run |
| `runs:repository:trigger` | Dispatch a project-configured evaluation for an exact CommitV2 |
| `state:presentation:revise` | Commit a complete author presentation on a ref at an expected head |
| `state:restore` | Restore historical structured Content to a fresh owned Draft |
| `delivery:deploy`, `delivery:rollback` | Independently enable preview assignment and rollback |
| `delivery`, `delivery:prepare` | List targets and receipts, or prepare a portable artifact in an owned Workspace |
| `runs:repository` | List saved repository evaluation Runs and read one by Run ID |
| `transitions` | Inspect Transition, read fixed Review or Commit result, Transition resource |
| `transitions:prepare` | Prepare an explicit proposal or a saved Draft Review |
| `transitions:verify` | Run Transition verification |
| `transitions:attach` | Attach Transition evidence |
| `decision:accept`, `decision:reject`, `decision:override` | Enable each Decision outcome independently |
| `commit` | Commit through `commit_transition` or `t3x_commit` |

Discovery shows the enabled values for multi-action tools. Calls and resource
URIs are checked against the same allowlist. Branch reads in this profile skip
legacy initialization of missing branches. Legacy workflow prompts are
available only through the legacy toolset configuration.

### Source Context

Use `t3x_source_context` to page the existing project material list with
`materials`, then read one exact text range with `material_excerpt`. Use
`t3x_query` with `source_evidence` to find immutable turn hashes, and
`turn_excerpt` to quote an original user turn. Excerpts return the source
URI, SHA-256 digest of its exact text, and inclusive start and exclusive end
UTF-16 offsets. Pass `expected_digest` to pin a later request to that text.
For parsed materials, the import's `content_hash` identifies the imported
source and the resource digest identifies the returned text. The `models`
action reads the server catalog and reports available generation models.

Enable `sources:ingest` with a project-bound Agent credential that has project
edit access. Use `t3x_ingest_source` with a stable `request_id` for
`create_thread`, `append_turn`, or `upload_material`. Appends require the
expected parent turn hash, or `null` on an empty thread. Attachments use
canonical base64 for up to 5 MiB of decoded bytes and return the submitted
bytes digest and the stored material hash. The API records the ingestion
actor and retains the material's existing creator on duplicate bytes.

After an interrupted request, use the `receipt` action with the original
request ID before retrying. An exact retry returns the stored receipt,
including after later turns or archival. A different payload under the
same ID returns a conflict. Agent-ingested text and newly created attachments
carry machine origin and are excluded from original human Source evidence.

Use `t3x_generate_proposal` with the saved Workspace revision, a stable
`request_id`, and exact material IDs or original user turn hashes. The
server resolves the selected provider and model. Keep the returned
`transition_id` for the separate `t3x_publish_candidate` action, then
prepare and read a fixed Review through `t3x_draft_review`.

Use `t3x_source_artifact` before an exact-source Proposal. For import, select
the root path, root material ID, and any resource paths and material IDs.
For scalar edit, the tool reads the saved artifact selector, and the caller
provides `replace_scalar` operations for supported plain string scalars.
For revert, the tool reads the exact branch head of the Workspace, and the
API derives the reverse Effect.
Pass the returned `proposal` plus a stable `request_id` to
`propose_transition`. The API checks the saved revision, Source eligibility,
and the ref when proposing.

File entries report the Material `content_hash` and the SHA-256 digest of
the stored UTF-8 text. During import, supply an `expected_digest` computed
from input bytes to verify preservation against the original file. The
tool rejects duplicate paths, mismatched digests, and text whose digest
differs from the material hash. For parsed attachments such as CSV, use
`t3x_source_context` to read the stored representation and its text digest.

### Commit validation

Use `t3x_commit_validation` with `action=run`, a project ID, an exact
CommitV2 `commit_hash`, and the canonical `schema_name` and `schema_version`
of a Schema supported by the Commit YSchema API. The response records the
validated Commit, Schema digest, status, findings, and source provenance
when available. The digest identifies the definition used for this Run.
Use `action=read` with the same project ID and returned `run_id` to retrieve
the saved result after newer Commits or Runs exist. Each successful trigger
creates a new Run. The API requires project edit access to trigger and
project read access to retrieve a saved result.

### Workspace validation

Use `t3x_workspace_validation` with `action=run` and the exact saved
`expected_workspace_revision`. For an authoring-managed Draft, also send
`expected_composition_revision` from `workspace_activity`. This workflow
validates the saved ESPHome `device` input. The API returns a conflict if
the input revisions differ at capture. A later edit leaves the result bound to
the captured revisions, subject digest, and input digest.

Use `action=read` with the project, Workspace and Run ID to recover the
recorded status, failure reason and findings. Exact Draft Runs require
project access and the Workspace owner recorded at creation. This applies to
Run reads and project Checks. Legacy Runs retain their project visibility.

### Restore historical Content

Enable `state:restore` and call `t3x_restore_content` with the project,
Workspace, source Commit digest, request ID, expected Workspace revision and
expected ref head. Open and initialize an owned authoring Workspace at the
target head first. Its composition revision must be zero for a new restore.
A successful Commit also renews the Workspace with a fresh Draft.
The source must be a verified Commit in the same project with a supported
YOps mapping document. The API requires project edit and proposal authority.

The result includes the source Commit and State digests, the effective Schema
hash and validation issues. Inspect the Draft diff, resolve issues in the
Draft, then prepare a fixed Review, decide and commit using the normal tools.
An identical request recovers the original action within the same Draft.

### State presentations

Use `t3x_read_state_presentation` under `state` or `read-only` with
`project_id`, `commit_digest` and `state_digest`. An optional
`presentation_digest` pins the author document. A Commit without an author
document returns `presentation: null`.

Enable `state:presentation:revise` for `t3x_revise_state_presentation`. Supply
`project_id`, `ref`, `expected_head` and the full `presentation` document.
The API checks project edit access and ref authority. Success advances the
ref to a new Commit with the same State digest. A presentation revision records
its exact parent so historical Schema reads and fresh Workspaces can recover the
parent’s verified binding. An ordinary presentation attachment or an older
revision without that record supplies no binding evidence. After a lost response, read
the ref and its presentation before deciding whether to submit another revision.

### Workspace Delivery

Call `t3x_workspace_delivery` with `action=list`, `project_id` and
`workspace_id` to read targets, receipts, the current Workspace revision
and its last committed digest. For `action=prepare`, pass that revision as
`workspace_revision`, the exact `commit_digest`, and a UUID `request_id`.
Reuse all three values to recover the same receipt after a lost response.
A prepared receipt includes the portable bundle in `artifact.content`,
with its UTF-8 byte length, SHA-256 digest and committed Schema digest.
A failed preparation returns a failed receipt and a null artifact.

Use `action=deploy` with a prepared portable receipt's `delivery_id` and a
UUID `request_id` to assign it to the built-in `preview` slot. To roll back,
use `action=rollback` with the historical `deployment_id` and a fresh UUID.
Both actions require project edit access to the owned Workspace. Replay a
write with its original UUID. The list response includes recent preview
deployment records and `current_deployment`. Its `actualArtifactDigest`
identifies the artifact currently assigned to the slot.

### Repository Runs

Use `t3x_repository_runs` with `action=list` and `project_id`, optionally
filtering by status. Use the returned `next_offset` to page through the
saved records, or supply a `run_id` with `action=read` to retrieve the
stored result. A reported Commit reference is the one stored on the Run.
The API authorizes project reads. Review evidence remains subject to its
issuer and subject rules.

To enable dispatch, set `T3X_REPOSITORY_RUN_WEBHOOKS` on the API to a JSON
object mapping exact project IDs to n8n webhook IDs, for example
`{"project_123":"evaluate-commit-v1"}`. Use a versioned webhook ID when
changing the workflow. Deploy the matching Runner and apply storage schema
v88. Grant the MCP host `runs:repository:trigger` and call
`t3x_trigger_repository_run` with `project_id`, `commit_digest` and
`request_id`. The API requires an authenticated project editor. The first
request pins the configuration digest. Reuse the same request ID with the
same actor and project to recover the Run, including after configuration
changes. A different Commit returns HTTP 409. A queued Run may represent
an interrupted or unacknowledged dispatch. Read its status before considering
a new request ID, which starts a separate execution.

### Repository, candidate, and Schema operations

- With `t3x_admin`, use a human credential for `create_project`. For
  `create_branch`, pass the exact `head_commit_hash` in API mode when
  inheriting an older Commit. Read the resulting owned Workspace from
  `t3x_query` using its exact ID.
- With `t3x_publish_candidate`, use the governed `transition_id` from
  Draft activity and keep its `request_id` for retries. If an action needs
  generated-deletion confirmation, open the same Workspace in signed-in Web,
  confirm the exact action in Draft activity, and prepare a fresh Review.
- Use `t3x_schema_registry` to select a release by canonical name, version
  and artifact digest. Supply Content relative to the Schema root for a
  structural check. A Commit binding supplies a separate definition digest
  that can be passed as `schema_hash`. Definitions unavailable through the
  authorized release registry may still have an exact historical binding.
- Use `t3x_schema_candidate` to preview the editing Base, save with the
  candidate revision and retry key, and read back the saved candidate.
  Preview that exact candidate to obtain `reviewHash`, then use
  `t3x_schema_preparation` to inspect the impact and proposed Content
  changes at the exact Draft revision. Open the same Workspace in signed-in
  Web to review and adopt the candidate, then use `t3x_draft_review` to
  prepare a fixed Review.

### Authenticated core qualification

Build the current checkout and check a running authenticated API before
qualification. Use a test credential. The optional tool names are checked
against the selected profile, which defaults to `read-only` and must expose
`t3x_context`. Set `T3X_API_URL` and `T3X_API_KEY` in the environment.

```bash
pnpm exec turbo run build --filter=@t3x-dev/mcp
node tools/mcp-preflight.mjs t3x_resolve_repository
```

The preflight reads credential context and tool definitions over stdio. Follow
the [operability standard](docs/operability.md#qualification-prerequisites-and-coverage)
to check the effective database, fixture configuration, and scenario dependencies.

Use the qualification coordinator to review the phase plan or explicitly run
any selection. An empty phase selection after `--run` runs all planned phases.

```bash
node tools/mcp-qualification.mjs --plan
node tools/mcp-qualification.mjs --run api web
```

The coordinator builds the checkout, uses a fresh authenticated embedded
database for each phase, and writes `qualification.json` with individual
scenario outcomes and evidence paths. The report identifies fixture-backed
dependencies. A skipped or empty phase cannot qualify its scenarios.

Open the [qualification workbench](../../tools/mcp-workbench/index.html) in a
browser and select the complete report folder. It reads the phase outcomes and
sanitized MCP diagnostics locally. The overview supports a copyable summary,
and each phase shows the recorded call and API request IDs when available.

Issue an Agent credential in Web Settings → API Tokens for an explicit
project. The form defaults to seven days and lets you select Decision and
Commit scopes independently. For human confirmation, sign in to Web and open
the exact Review snapshot; the Agent keeps its own credential.

Run each core phase on its own fresh stack:

```bash
node tools/mcp-qualification.mjs --run api web
node tools/mcp-qualification.mjs --run restore presentation
```

The API phase uses API-issued fixture credentials. The Web phase issues and
revokes the Agent credential through Web and confirms a fixed Review in the
signed-in Web session. Machine Decision uses a fixture ref with an explicit
test policy. The restore and presentation phases verify historical Content
restore and presentation revisions independently.

Select other phases by their names in the plan:

```bash
node tools/mcp-qualification.mjs --run repositories workspace-candidate schema-authoring
node tools/mcp-qualification.mjs --run source-context source-ingestion proposal-generation source-artifact
node tools/mcp-qualification.mjs --run commit-validation workspace-validation repository-runs
node tools/mcp-qualification.mjs --run write-recovery workspace-reconciliation transition-authority transition-statement
node tools/mcp-qualification.mjs --run journey workspace-validation-oci
```

Proposal Generation and the Web-authorized journey use a deterministic
OpenAI-compatible server on loopback. The journey follows a Source-backed change
through a fixed Web Review, exact Commit read-back, and built-in preview rollback.
The exact-source phase verifies byte preservation and parsed attachment
reads. Commit validation checks persisted findings and separate read and
trigger permissions. `workspace-validation` simulates a missing OCI runtime.
`workspace-validation-oci` requires Docker or Podman and the pinned ESPHome
image. Repository Runs uses a loopback workflow webhook and signed Runner
callbacks to verify both `completed` and `failed` records. The Statement phase
uses an isolated API instance with one explicitly allowed fixture predicate.
The report identifies these dependencies for each phase.

### Resources

The server currently exposes these resource templates:

- `t3x://projects/{project_id}`
- `t3x://projects/{project_id}/commits/{commit_digest}`
- `t3x://projects/{project_id}/transitions/{transition_id}`
- `t3x://projects/{project_id}/workspaces/{workspace_id}`
- `t3x://source-threads/{source_thread_id}`
- `t3x://leaves/{leaf_id}`
- `t3x://merge-drafts/{draft_id}`

`t3x://conversations/{conversation_id}` remains a compatibility alias for the
source-thread resource.

### Prompts

The server currently exposes these workflow prompts:

- `extract_review_commit`
- `prepare_resolve_merge`
- `generate_from_leaf`

Prompts are user-facing workflow entries for MCP hosts. Agent guidance still mainly comes from tool descriptions and server instructions.

## Installation

After this package is promoted and published, it can be added to a stdio MCP
host with the package binary.

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

For local stdio development, the root `.mcp.json` launches the built entry point
through `tools/mcp-codex-wrapper.mjs`. It enables the Transition toolset and
selects the `api` backend so MCP follows the same persisted Workspace path as
CLI and WebUI.

## Runtime Model

- `stdio` (default) runs as a subprocess of a local MCP client. It supports
  both the `storage` and `api` backends.
- `http` runs as a standalone service and accepts Streamable HTTP requests at
  `/mcp`. It requires the authenticated `api` backend. The operator can select
  an explicit business capability allowlist or enable the managed OAuth profile.

### Backends

- `storage`
  - if `DATABASE_URL` is set, it uses Postgres
  - otherwise it starts embedded Postgres under `.t3x/pg-data`
- `api`
  - talks to the T3X API via `T3X_API_URL`
  - in stdio mode, reuses `T3X_API_KEY` or the shared `~/.t3x/config.json` key
    when present
  - in HTTP mode, uses the request's `Authorization: Bearer <token>` header

The opt-in `transition` toolset requires the `api` backend. In `storage` mode,
all six Transition tools fail closed with `API_BACKEND_REQUIRED`; there is no
direct-storage fallback for authenticated authority or issuer context.

API-backed resources and Source evidence reads also pass through the API
boundary. `source_evidence` is unavailable in storage mode because project
authorization and observation completeness belong to the Source service.
Direct storage remains useful for local read and generation surfaces, but it is
not repository mutation authority. The compatibility-named `t3x_extract`,
`t3x_edit`, and `t3x_commit` tools require the API backend and adapt requests to
the same Workspace/Transition path as WebUI and CLI.

Local Codex/Cursor development should prefer the `api` backend so MCP and CLI
see the same data without each process trying to own embedded Postgres.

### Streamable HTTP

From the repository root, build the service and start it on loopback against
an authentication-enabled T3X API.

```bash
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@t3x-dev/mcp
T3X_TRANSPORT=http T3X_MCP_BACKEND=api \
  T3X_API_URL=http://127.0.0.1:8000/api \
  T3X_MCP_CAPABILITIES=read-only \
  node apps/mcp/dist/index.js
```

Connect a Streamable HTTP client to `http://127.0.0.1:3001/mcp` and configure
it to send `Authorization: Bearer <token>` on every MCP request. Issue the
token from the Web Settings → API Tokens page on the same T3X deployment. For
a single repository, use a project-bound Agent token with the required scopes.

The server validates each request's credential with the T3X API and uses that
credential for the operation. The API enforces the caller's access. The endpoint
uses stateless JSON responses over `POST`, with no MCP session ID or SSE stream.
Authenticated `GET` and `DELETE` requests to `/mcp` receive `405`. [Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http)

#### Repository delegation with OAuth

Configure these values on both the API and the MCP service. The Web server
connects to that API through `T3X_API_URL`.

| Variable | Value |
| --- | --- |
| `T3X_MCP_RESOURCE_URL` | Canonical MCP resource, such as `https://mcp.example.com/mcp`. Use the same URL in the client and in `T3X_MCP_PUBLIC_URL` if set. |
| `T3X_MCP_OAUTH_ISSUER` | Public Web origin serving the authorization page and discovery, such as `https://t3x.example.com`. HTTP loopback is supported for local development. |
| `T3X_MCP_OAUTH_SECRET` | A shared 32-byte random key encoded as base64url, stored in the deployment secret manager. Rotating the key invalidates previously issued OAuth access tokens. |

On the API, register the host in `T3X_MCP_OAUTH_CLIENTS`. Each JSON array
entry supplies its public client ID, display name and exact accepted callback
URLs. For example, a host with the indicated HTTPS callback can register
`[{"client_id":"editorial-agent","client_name":"Editorial Agent","redirect_uris":["https://agent.example.com/oauth/callback"]}]`.
Use the callback supplied by the actual host.

Connect the registered client to the canonical MCP URL. A request without a
credential returns a Bearer challenge pointing to
`/.well-known/oauth-protected-resource/mcp`. This document identifies the Web
issuer, the resource audience and the enabled tool groups in
`t3x_capabilities`. The host discovers the authorization endpoint and starts
an authorization code flow with PKCE. After confirmation it exchanges the code
for an MCP access token and resumes its pending task. MCP checks the token's
audience and expiry, then authenticates its repository credential against the
configured API on every request. Existing pre-issued Bearer tokens continue to
use their existing credential path. [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

A chat host keeps its conversation and pending instruction under its OAuth
`state`. It can add `repository=owner/name` and `branch=main` to the
authorization request when the task identifies a target. Omit `repository`
to let the person choose in T3X. An optional `task` field shows a short
description on consent. Keep the full conversation in the host. On return,
the host validates the issuer and state, completes PKCE and calls
`t3x_context` to confirm the granted project before resuming that task.
Reuse a sufficient unexpired grant for later requests to the same repository.

With OAuth enabled, leaving `T3X_MCP_CAPABILITIES` unset selects the managed
profile for reading repositories, editing Drafts, working with Sources,
checking changes, preparing fixed Reviews, deciding eligible changes and
committing. Overrides and deployments require their own operator opt-in.
A deployment that explicitly sets `T3X_MCP_CAPABILITIES=read-only` continues
to serve reading tools only.

For hosted setup, see [MCP service deployment](../../docs/deployment.md#mcp-service).

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `T3X_TOOLSETS` | Comma-separated toolsets to enable: `core`, `advanced`, `transition` | `core` |
| `T3X_MCP_CAPABILITIES` | Comma-separated business capabilities. Required in Bearer-only HTTP mode. | Managed repository profile with HTTP OAuth |
| `T3X_TRANSPORT` | `stdio` or `http` (Streamable HTTP) | `stdio` |
| `T3X_MCP_BACKEND` | Backend mode: `storage` or `api` | `storage` |
| `T3X_API_URL` | Base API URL for `api` backend. Required explicitly in HTTP mode. | `http://localhost:8000/api` in stdio mode |
| `T3X_API_KEY` | Optional API key for stdio with the `api` backend | unset |
| `HOST` | HTTP listener bind address | `127.0.0.1` |
| `PORT` | HTTP listener port | `3001` |
| `T3X_MCP_PUBLIC_URL` | External HTTPS endpoint ending in `/mcp`. Sets the accepted request host and origin. | Unset, allowing loopback clients |
| `DATABASE_URL` | Postgres connection string; when omitted, embedded Postgres is used | unset |
| `T3X_POSTGRES_STARTUP_MODE` | External Postgres startup: read-only `runtime` validation or explicit `bootstrap` migration/seed | `runtime` |
| `T3X_DATA_DIR` | Embedded Postgres data directory | `.t3x/pg-data` |
| `T3X_PG_PORT` | Embedded Postgres port | `5445` |
| `ANTHROPIC_API_KEY` | Optional fallback for Anthropic-backed generation/extraction | unset |
| `OPENAI_API_KEY` | Optional fallback for OpenAI-backed generation/extraction | unset |
| `GOOGLE_AI_STUDIO_KEY` | Optional fallback for Gemini-backed generation/extraction | unset |

## Example Workflow

```text
Repository workflow (requires `T3X_MCP_BACKEND=api`)

1. t3x_query({ target: "source_evidence", project_id, id: source_thread_id })
                                                           -> exact immutable turn hashes
2. t3x_extract({ project_id, workspace_id, source_thread_id, turn_hashes })
                                                           -> extraction_candidate_id
3. propose_transition({ project_id, workspace_id, extraction_candidate_id, request_id })
                                                           -> transition_id
4. inspect_transition({ project_id, transition_id })      -> immutable review view
5. verify_transition({ project_id, transition_id, request_id })
6. decide_transition({ project_id, transition_id, request_id, outcome, precondition })
7. commit_transition({ project_id, transition_id, request_id, decision_digest, expected_head })
                                                           -> CommitV2 digest

Merge

1. t3x_diff({ source_hash, target_hash })                -> structured diff
2. t3x_merge({ action: "prepare", source_hash, target_hash })
3. t3x_query / resources/read merge draft for inspection
4. t3x_merge({ action: "resolve", ... })
5. t3x_merge({ action: "execute", ... })                 -> merge commit_hash

Historical YOps remain available only through the project-scoped archived
evidence read model. They are audit material, not a competing mutation path.
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
