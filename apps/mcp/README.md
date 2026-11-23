# @t3x-dev/mcp

T3X MCP server for AI agents.

This package is the runnable stdio wrapper around `@t3x-dev/mcp-lib`.

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

The default toolset is `core`. Enable `advanced` and `transition` through `T3X_TOOLSETS`.

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
Use `t3x_query` for history and the advanced `t3x_diff` tool for comparisons.

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

Set `T3X_MCP_CAPABILITIES` to opt into an allowlist on the authenticated API
backend. When set, it takes precedence over `T3X_TOOLSETS`. The legacy
toolsets, resource aliases, and prompts remain available through the existing
configuration when the capability variable is unset.

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

Issue an Agent credential in Web Settings → API Tokens for an explicit
project. The form defaults to seven days and lets you select Decision and
Commit scopes independently. For human confirmation, sign in to Web and open
the exact Review snapshot; the Agent keeps its own credential.

Build both MCP packages, then run each phase with a fresh isolated API and
database so the phases have independent rate-limit counters:

```bash
T3X_E2E_MCP_PHASE=api T3X_E2E_ARTIFACT_DIR=test-results/mcp-core-api \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-core-loop.spec.ts
T3X_E2E_MCP_PHASE=web T3X_E2E_ARTIFACT_DIR=test-results/mcp-core-web \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-core-loop.spec.ts
```

The first phase runs the stdio loop with API-issued fixture credentials. The
second issues and revokes the Agent credential through Web and confirms a fixed
Review in the signed-in Web session. Machine Decision runs only on a fixture
ref with an explicit test policy.

Run repository and Schema registry, governed candidate publication, and Schema
authoring qualification on their own fresh stacks:

```bash
T3X_E2E_MCP_PHASE=repositories T3X_E2E_ARTIFACT_DIR=test-results/mcp-repositories \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-repository-creation.spec.ts
T3X_E2E_MCP_PHASE=workspace-candidate T3X_E2E_ARTIFACT_DIR=test-results/mcp-candidates \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-candidate-publication.spec.ts
T3X_E2E_MCP_PHASE=schema-authoring T3X_E2E_ARTIFACT_DIR=test-results/mcp-schema-authoring \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-schema-authoring.spec.ts
T3X_E2E_MCP_PHASE=source-context T3X_E2E_ARTIFACT_DIR=test-results/mcp-source-context \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-source-context.spec.ts
T3X_E2E_MCP_PHASE=source-ingestion T3X_E2E_ARTIFACT_DIR=test-results/mcp-source-ingestion \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-source-ingestion.spec.ts
```

The Proposal Generation test uses a deterministic OpenAI-compatible fixture
that only listens on loopback. The key below is specific to this fixture:

```bash
T3X_E2E_MCP_PHASE=proposal-generation T3X_E2E_F3_MODEL_PORT=8373 T3X_E2E_ALLOW_EXTERNAL=1 \
  OPENAI_BASE_URL=http://127.0.0.1:8373/v1 OPENAI_API_KEY=t3x-local-fixture-only \
  ANTHROPIC_API_KEY='' GOOGLE_AI_STUDIO_KEY='' GOOGLE_API_KEY='' N8N_API_KEY='' \
  T3X_E2E_ARTIFACT_DIR=test-results/mcp-proposal-generation \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-proposal-generation.spec.ts
```

The exact-source qualification checks the imported, edited, and reverted
State against UTF-8 fixture bytes and reads the parsed form of a CSV attachment:

```bash
T3X_E2E_MCP_PHASE=source-artifact T3X_E2E_ARTIFACT_DIR=test-results/mcp-source-artifact \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-source-artifact.spec.ts
```

The Commit validation phase verifies persisted findings, historical Source
references, and separate read and trigger permissions:

```bash
T3X_E2E_MCP_PHASE=commit-validation T3X_E2E_ARTIFACT_DIR=test-results/mcp-commit-validation \
  node tools/full-e2e.mjs --auth-enabled -- e2e/security/mcp-commit-validation.spec.ts
```

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

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `T3X_TOOLSETS` | Comma-separated toolsets to enable: `core`, `advanced`, `transition` | `core` |
| `T3X_MCP_CAPABILITIES` | Explicit comma-separated business capabilities for the authenticated API backend | Unset |
| `T3X_TRANSPORT` | MCP transport | `stdio` |
| `T3X_MCP_BACKEND` | Backend mode: `storage` or `api` | `storage` |
| `T3X_API_URL` | Base API URL for `api` backend | `http://localhost:8000/api` |
| `T3X_API_KEY` | Optional API key for `api` backend | unset |
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
