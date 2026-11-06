# Request principal migration baseline

- Status: frozen architecture and migration baseline
- Scope: task 15 only
- Baseline commit: `473a814e5f3bd8bc2de92267c5b00c16864da94f`
- Baseline PostgreSQL schema: `POSTGRES_SCHEMA_VERSION = 80`

This decision fixes the identity boundary that later migration slices must use.
It does not add a runtime `RequestPrincipal` type, change an authentication
route, alter storage, or modify the deterministic protocol kernel.

## Decision

T3X will use one server-derived request identity contract, named
`RequestPrincipal`, at every authenticated ingress. It is an internal
application contract, not a request payload, public protocol noun, database
record, JWT claim set, or client-authored DTO.

Authentication adapters may differ by deployment. Authorization semantics may
not. Web, HTTP API, WebSocket, CLI, MCP, runner, and Cloud must converge on the
same contract before application authorization runs.

`State`, `Effect`, `Statement`, and `CommitV2` remain the complete public
protocol nouns. User, Account, Session, Credential, and RequestPrincipal stay
outside `@t3x-dev/transition` and the deterministic replay kernel.

## Identity nouns

| Noun | Meaning | Authority |
| --- | --- | --- |
| User | Stable internal human subject. | May receive namespace membership and project grants. |
| Account | External login identity linked to one User, such as a GitHub or Google provider account. | Authenticates a User but grants no project or namespace access. |
| Session | Revocable, time-bounded human login context. | Identifies a User through a server-validated session; carries no independent RBAC role. |
| Credential | Server-validated authenticator such as an API key, service token, or session token. Secret bytes are never part of RequestPrincipal. | Restricts the authenticated subject by stored binding and scopes; never expands Membership or Grant authority. |
| RequestPrincipal | Immutable trusted identity derived by an ingress adapter for one request or connection. | Supplies actor, delegation, credential restrictions, and ingress facts to application authorization. |

The existing `accounts` table remains a provider-login link. It is not a
namespace, billing account, membership, seat, or project owner. The existing
browser flow currently represents a login session with an API key; separating
Session from Credential storage is migration work after this baseline.

## Fixed field semantics

### Actor

`actor` is the principal that performed the operation and must be preserved in
audit records.

- Direct browser or human API-key use records the human User.
- Agent and service credentials record their own stable machine identity.
- A request body, author field, client header, namespace slug, or project owner
  may not replace the authenticated actor.

### Delegator

`delegator` records the human User that authorized a machine actor. It is
present only when a server-stored credential binding proves that delegation.
It is absent for direct human actions and for autonomous service credentials
without a human binding. A request may not nominate its delegator.

### Workspace owner

`workspace_owner` controls private Draft visibility; it is distinct from the
audited actor.

- A credential bound to a User resolves to that human User as Workspace owner.
- Therefore the same User's Web, CLI, MCP, and Codex credentials share that
  User's private Workspace while retaining their distinct audited actors.
- An unbound agent or service credential resolves to its machine actor.
- Once a Workspace is created, its stored owner is compared on every private
  read and write and is never silently replaced.
- Explicit `AUTH_DISABLED` source development keeps its current unowned local
  compatibility behavior. It does not create a User or grant deployed access.

### Scopes and RBAC

`scopes` are closed capabilities attached to the validated Credential. They are
an additional restriction, not a role and not an authority expansion.

Namespace Membership and Project Grant remain the canonical stored RBAC facts.
An operation is allowed only when both the credential restriction and current
Membership or Grant permit it. Plan, billing, provider-secret, archive
provenance, and client role claims never grant Core authority.

## Unique server sources

Every RequestPrincipal field has one authoritative server source. Later code
may rename fields, but it may not introduce a second source.

| Field | Unique server source | Rejected alternatives |
| --- | --- | --- |
| `actor.kind` | Verified Credential kind, or `human` for a validated Session. | Request JSON, author headers, JWT role hints. |
| `actor.id` | Internal User ID for direct human use; stored Credential identity for agent/service use. | Display name, email, provider ID, API-key prefix. |
| `delegator` | Stored human binding on an agent/service Credential. | Request author, Workspace owner, project creator. |
| `user_id` | Validated Session or stored Credential-to-User binding. | Email matching during the request, namespace owner claims. |
| `account_id` | Validated provider login resolved through the stored Account link. | Provider profile data submitted by a client. |
| `session_id` | Server session verifier/store. | Browser-generated identifiers or local storage metadata. |
| `credential_id` | Server Credential lookup or verified deployment adapter. | Raw secret, token prefix, client label. |
| `credential_kind` | Credential verifier selected by the ingress. | Request parameter or claimed transport. |
| `project_binding` | Stored Credential project binding. | URL project alone or request body. |
| `scopes` | Stored Credential policy or server-issued Session policy. | Request scopes, Membership role, Cloud plan. |
| `workspace_owner` | Server derivation from `user_id`, otherwise the machine `actor`. | Request owner, Workspace payload, project owner. |
| `ingress` | Server route/transport adapter constant. | Client header. |

Membership, Grant, invitation, visibility, and policy-binding facts are loaded
separately from storage. They do not become fields that a caller can inject
into RequestPrincipal.

## Ingress matrix

| Ingress | Current trusted input at baseline | Target adapter responsibility | Must not do |
| --- | --- | --- | --- |
| Web HTTP | Browser-held local-auth API key through API auth middleware. | Resolve a validated Session/Credential to the common principal. | Construct roles, scopes, actor, or Workspace owner in React. |
| HTTP API | Bearer API key resolved from storage. | Normalize the stored credential, User binding, project binding, and scopes. | Trust request-shaped author or principal fields. |
| WebSocket | Query token verified by `verifyBearerToken`. | Derive once during upgrade and retain the immutable principal for the connection. | Re-derive identity from later socket messages. |
| CLI | Bearer credential sent to the HTTP API. | Remain an API client; the server derives identity. | Treat local Git user, config name, or flags as authority. |
| MCP/Codex | Bearer credential sent through the shared API client. | Remain an API client and preserve user-bound Workspace ownership. | Submit a principal, delegator, scopes, or owner as trusted data. |
| Runner | Dedicated runner service authentication and exact project context. | Convert the verified service identity and binding to the common principal. | Reuse anonymous/local mode or inherit a human's namespace role. |
| Application use case | Current server-derived actor and separately loaded authorization facts. | Consume RequestPrincipal plus stored authority facts after ingress normalization. | Authenticate credentials or read transport-specific claims. |
| Core/Transition kernel | Explicit actor references and already-authorized protocol operations. | Remain unaware of RequestPrincipal, Session, Credential, and transports. | Authenticate, evaluate RBAC, or accept RequestPrincipal. |
| Cloud | Deployment-owned verified identity. | Act only as an adapter into the common contract, then use shared application Membership/Grant authority. | Maintain a second Core user/member/role authority or add plan claims to Core permissions. |

## Baseline inventory

The following files are the frozen evidence for the pre-migration state:

- `packages/storage/src/schema-trees.ts` owns current User, Account, API key,
  Membership, and Grant records.
- `packages/api/src/middleware/auth.ts` validates HTTP Bearer API keys.
- `packages/api/src/routes/ws.ts` and `packages/api/src/middleware/auth.ts`
  contain the WebSocket token path.
- `packages/api/src/lib/runner-service-auth.ts` owns runner service
  authentication.
- `packages/api/src/lib/transition-authority.ts` derives the current Transition
  actor, delegator, project binding, and scopes.
- `packages/api/src/middleware/workspace-access.ts` derives the current private
  Workspace owner.
- `packages/application/src/identity/namespace-authorization.ts` evaluates
  stored Membership and Grant authority.
- `packages/transition/src` contains no User, Account, Session, Credential, or
  RequestPrincipal contract and must remain free of them.

Known baseline gaps are intentional inputs to migration:

1. There is no shared RequestPrincipal contract.
2. Browser Session and API Credential are not yet separate runtime concepts.
3. HTTP, WebSocket, Workspace, Transition, and runner paths derive overlapping
   identity projections independently.
4. Cloud adapter conformance is not represented in this repository.

## Migration order

Tasks after 15 must use these slices in order. A slice does not begin until the
previous slice has tests and rollback evidence.

1. Add the internal RequestPrincipal contract and pure derivation tests in the
   application identity boundary; do not touch the protocol kernel.
2. Separate Session and Credential semantics at storage and authentication
   ports while preserving current API-key compatibility.
3. Make HTTP and Web authentication produce the common principal from server
   state.
4. Make WebSocket use the same derivation and retain one immutable principal
   per connection.
5. Move Workspace ownership and Transition actor/delegator/scope consumers to
   the common principal without changing their frozen semantics.
6. Prove CLI and MCP are credential-only clients and cannot inject identity.
7. Adapt runner and Cloud identities through the same contract with exact
   project restrictions.
8. Remove superseded compatibility derivations only after mixed-version tests
   and entrypoint E2E pass.

Database changes, if any, follow the explicit PostgreSQL migration runner.
Schema changes never rewrite protocol objects, Commit hashes, or deterministic
Replay results.

## Reproducible baseline

Run from the repository root:

```bash
git cat-file -e 473a814e5f3bd8bc2de92267c5b00c16864da94f^{commit}
git show --no-patch --format='%H %s' 473a814e5f3bd8bc2de92267c5b00c16864da94f
git diff --exit-code 473a814e5f3bd8bc2de92267c5b00c16864da94f -- packages/transition/src packages/transition/conformance
rg -n 'POSTGRES_SCHEMA_VERSION = 80' packages/storage/src/adapters/postgres.ts
pnpm check
```

The first two commands identify the exact pre-task-15 runtime tree. The third
proves that the task-15 documentation commit did not modify the protocol
kernel. The fourth fixes the storage starting point. The last command verifies
the repository's normal static gate.

Each later migration PR must record:

- its parent migration slice;
- changed identity sources and consumers;
- tests for direct human, user-delegated machine, and unbound service use;
- the last compatible application and schema version;
- whether rollback is code-only or requires storage restoration.

## Task 16 implementation evidence

Task 16 implements the shared ingress contract in this repository without a
storage or protocol migration:

- `packages/application/src/identity/request-principal.ts` owns the closed,
  transport-neutral `RequestPrincipal` contract.
- `packages/api/src/lib/request-principal.ts` owns the API-key, runner, local
  development, and trusted-deployment adapter seam.
- HTTP middleware derives the principal from server-validated credentials;
  WebSocket derives the same identity once during upgrade; runner routes use a
  fixed service principal.
- Shared project, namespace, Workspace, Transition, operator, inference,
  lifecycle, usage, and commit-author consumers read `RequestPrincipal`
  instead of transport-specific identity fields.
- Web, CLI, and MCP remain credential-only clients. The contract inventory test
  rejects reserved identity headers and prevents new direct API-key identity
  consumers outside the explicit credential-management allowlist.
- Adapter, middleware, WebSocket, authorization, route, and full API regression
  tests cover direct human, delegated machine, unbound machine, forged identity
  fields, project binding, scopes, and local-development compatibility.

`POSTGRES_SCHEMA_VERSION` remains `80`, and `packages/transition/src` plus the
Transition conformance bundle remain unchanged from the task-15 baseline.
Rollback is therefore code-only for task 16.

Cloud runtime authentication is not qualified by this repository. The API
exports the trusted adapter contract and context setter; a Cloud deployment
must verify its own Session/Credential and map it to that contract before
shared authorization runs. During mixed-version rollout, the API retains one
trusted `apiKey`-context compatibility mapping; remove it only after every
deployment adapter writes `requestPrincipal` directly.

## Rollback law

Task 15 itself is documentation-only and is reverted with an ordinary
`git revert` of its commit.

For later migration slices:

1. Stop new writes through the affected ingress before changing identity
   interpretation.
2. Deploy the last application revision compatible with the current database.
3. Revert code commits in reverse migration order; never use `git reset --hard`
   as an operational rollback.
4. Treat PostgreSQL migrations as forward-only. Restore the pre-migration
   backup into a new database when stored identity facts must be rolled back,
   verify its schema version and row counts, then switch the application.
5. Re-run direct-human, delegated-machine, unbound-service, cross-project, and
   private-Workspace isolation checks before resuming writes.

A rollback is incomplete if actor audit, Workspace ownership, credential
revocation, or Membership/Grant evaluation changes meaning across the restored
boundary.

## Non-goals for task 15

Task 15 does not:

- add a TypeScript RequestPrincipal type;
- create Session or Credential tables;
- change login, registration, API-key, WebSocket, CLI, MCP, runner, or Cloud
  behavior;
- migrate existing rows;
- change Workspace owner, Transition actor, delegator, or scopes at runtime;
- add identity concepts to Core protocol contracts;
- define billing, plan, seats, credits, or provider-secret ownership.

Those are implementation slices that begin only after this baseline is
reviewed.
