# WebUI Architecture

## Scope and status

This document owns frontend module responsibilities and links to the system
contracts WebUI consumes. Its scope includes browser UI and WebUI's Next.js
transport bridge. It does not redefine application authority or the protocol.

The inherited system boundaries and the frontend contracts A-01 through A-05
are normative. Source and transport maps are descriptive references. These
contracts define the target behavior for changes and reviews; they do not
certify that existing code already conforms or authorize a broad rewrite.

Current behavior must be checked against these contracts and the
[business contracts](business.md). Record implementation gaps separately;
existing code is evidence, not an exception to the rule.

## Owning references

| Source | What it owns |
| --- | --- |
| [Repository guide](../../../AGENTS.md#transition-spine) | Protocol, application and product-projection boundaries |
| [Application convergence](../../../docs/architecture/transition-application-convergence.md#one-authority-boundary) | One authoritative mutation path and historical compatibility limits |
| [Reliable Workspace](../../../docs/architecture/reliable-workspace-gate-1.md#frozen-behavior) | Workspace identity, guarded writes, concurrency and reconciliation |
| [Biome configuration](../../../biome.json) | Existing static import restrictions |
| [Import-boundary tests](../src/__tests__/boundaries/import-boundaries.test.ts) | Dependency checks, literal fetch checks and app-layer exceptions |

System-owned requirements remain in their owning documents. Changing a frozen
architecture decision follows the repository's owning Issue process. A WebUI
document cannot authorize an alternative writer, permission evaluator or
protocol lifecycle.

## Established boundaries

The existing WebUI convention has four layers. The layer names describe
responsibilities; they do not require every call to traverse all four layers.

| Layer | Location | Responsibility and retained dependency rules |
| --- | --- | --- |
| L1: infrastructure | `src/infrastructure/` | Adapt external APIs and transport. Do not import queries, commands, stores, hooks or components. |
| L2: domain | `src/domain/` | Pure calculations and projections. No React or I/O; do not depend on infrastructure or the composition/view layers. |
| L3: composition | `src/queries/`, `src/commands/` | Organize reads and writes respectively. Neither imports hooks, stores or components; return results to callers. |
| L3: composition | `src/hooks/` | Coordinate reads, commands, domain calculations and state updates. Do not import components, including component-owned shared types. |
| L3: composition | `src/store/` | Passive shared state and setters. Do not import queries, commands or infrastructure; asynchronous I/O belongs in composition hooks. |
| L4: view | `src/components/` | Render and handle interaction through hooks and pure helpers. Do not import queries, commands or infrastructure directly. |

These responsibilities come from the previous WebUI README and the existing
Biome restrictions. Hooks can use infrastructure adapters directly; introducing
a query or command wrapper for every request is not an established requirement.
The placement and reuse rules for commands and mixed helpers are defined in
[A-04](#a-04-module-responsibilities-and-exceptions).

Product UI consumes application projections. The application owns authorization,
idempotency and authoritative writes; browser state, client-side validation and
button availability do not replace those checks. Domain helpers may calculate a
preview without gaining authority to mutate persisted history.

### Next.js boundary

`src/app/` composes routes and pages. `src/app/api/` and `src/server/` contain
the WebUI server-side transport bridge. The boundary test explicitly allows
server transport fetches and maintains an allowlist for other existing page-level
data access. Those exceptions do not make arbitrary direct access a general
view-layer convention.

Keep browser modules separate from server credentials and server-only adapters.
The current bridge forwards session credentials upstream; it does not own
Workspace authorization or redefine the application's command rules.

## Source map

This map describes the current directory structure, not a relocation plan.
The dependency restrictions above apply independently of whether all existing
implementations fulfill their intended responsibility.

| Location under `apps/web/` | Purpose |
| --- | --- |
| `src/app/` | Next.js routes, page composition and API route handlers |
| `src/components/` | Product surfaces, shared interaction and UI primitives |
| `src/hooks/` | React-bound workflow and data coordination |
| `src/store/` | Zustand state containers |
| `src/queries/`, `src/commands/` | Read and write use cases |
| `src/domain/` | Pure calculations, comparisons and display projections |
| `src/infrastructure/` | API adapters and browser transport helpers |
| `src/server/` | WebUI server-side transport implementation |
| `src/types/`, `src/data/` | Shared types and static data |
| `src/utils/`, `src/styles/` | Supporting helpers and styling |
| `src/__tests__/` | Unit, component, hook and boundary tests |
| `e2e/` | Browser and workflow test suites |
| `public/`, `scripts/` | Static runtime assets and development tooling |

Wire contracts are owned by [the API client](../../../packages/api-client/src/)
and the API's route schemas. `src/types/api.ts` is a re-export surface, not a
second wire-contract owner. Adapter exports, shared store shapes and domain
function signatures have callers: inspect them before changing an interface.

Types, data and utility directories do not create an additional authority layer;
[A-04](#a-04-module-responsibilities-and-exceptions) governs their responsibilities.

## Transport and local access

The current browser HTTP path is:

```text
Browser adapter -> same-origin /api -> Next.js proxy -> standalone API
```

[The shared client](../src/infrastructure/sharedApiClient.ts) uses the Web
transport's timeout, retry and abort handling. The
[proxy route](../src/app/api/[...path]/route.ts) delegates to
[the server bridge](../src/server/browserApiProxy.ts), which resolves its upstream
from `T3X_API_URL`, defaulting to `http://localhost:8000`. Browser requests are
not direct requests to that upstream address. WebSocket rewriting is configured
separately in [next.config.ts](../next.config.ts).

The `/settings/access` capability manages the standalone API host's local shared
configuration and provides Test Access. For that host configuration, environment
values take precedence over the configuration file and built-in defaults; saving
the file does not override an active environment value. The owning implementation
is [local configuration](../../../packages/api/src/lib/local-config.ts).
This host capability does not select a principal's private Draft or change the
browser session boundary. Use the [deployment guide](../../../docs/deployment.md)
for deployment and authentication setup.

## Verification and maintenance

Use the [README check index](../README.md#checks) and the
[repository verification policy](../../../AGENTS.md#verification).
Biome, the shell boundary check and import-boundary tests overlap but inspect
different sets of imports and exceptions. They do not prove object identity,
refresh correctness, durable-save behavior or business acceptance.

Some source comments and the shell checker still refer to removed architecture
documents. This document replaces those missing prose references; repairing
source comments is separate from changing dependency rules. Do not infer an
unwritten exception from a stale comment or silently broaden a check's allowlist.

Update the owning rule when an authorized decision changes. Keep its identity,
reason and verification expectations together; update affected callers and
checks during implementation. Record defects and execution history in the
team's work records. Preserve frozen system contracts and use their owning
Issue process for changes outside frontend authority.

## Frontend contracts

### A-01: State ownership and sharing

The server owns persisted facts. Within one WebUI session, each selected
Workspace has one logical coordinator for its read projection and working copy.
This is a responsibility boundary, not a requirement for a global store,
singleton component or new cache dependency.

| State | Frontend owner | Sharing boundary |
| --- | --- | --- |
| Unapplied input | The active editor | Keep it local until Apply or an explicit discard. |
| Unsaved working copy | The Workspace editing session | Editors and local previews derive from the same saved baseline plus the same local changes. |
| Saved Draft projection | The Workspace data coordinator | Consumers of the selected revision share its content, effective Schema and basis; they do not reconstruct their own authoritative Draft. |
| Fixed Review projection | The exact review identity | Review views share that record's base/result and evidence, independently of the live Draft. |
| Committed State projection | The exact Commit/State identity | State readers derive from that version, independently of current Workspace edits. |
| Selection and layout | The view or relevant inspection context | Selection may change presentation, never the underlying authoritative document. |

Scope private projections and edit buffers by the authenticated session/principal,
project and explicit Workspace. Versioned reads also carry the relevant
revision and basis; Review and Commit reads use their own exact identities.
These are cache-isolation facts, not client-side authorization. Clear private
state on sign-out or principal change; never carry it into another identity.

Use component state for local input, a shared hook/context for a common lifetime,
and a scoped cache/store when consumers need independent lifetimes. Choose the
smallest existing mechanism that satisfies the required sharing. Derived values
have one calculation owner and are not independently editable copies. Distinct
browser tabs still reconcile through the server; local sharing does not create
a cross-principal or continuously shared Draft.

**Acceptance:** two views of one selected revision agree; local changes appear
in every working-copy view; identity/project/Workspace switches never expose
or apply another scope's data. Buffer lifetime follows [B-01](business.md#b-01-local-edits-and-save-meaning).

### A-02: Read, refresh and invalidation

1. Associate each request and result with its object, version and active scope.
   Cancel obsolete work where possible and ignore late results that no longer
   match; old data must not briefly appear as the newly selected object.
2. Keep checking for a newer version separate from adopting it. External changes
   produce an explicit newer-version or behind notice. They do not silently
   replace inspected content, editor input or the working-copy baseline.
3. An acknowledged local write refreshes the affected Draft projection and
   invalidates dependent current-version calculations and readiness. Reconcile
   the read with the acknowledged revision; a failed or older read cannot erase
   the acknowledgement. Preserve remaining local edits and detect overlap
   before applying them to a changed baseline.
4. Loading, confirmed empty, unavailable, refreshing and stale are distinct.
   Only a successful response for the intended object can establish emptiness.
   Retained data remains labelled with its original identity during refresh or
   failure; it does not establish the requested newer version's readiness.
5. Fixed Review/Commit content stays pinned. A Review may acquire a later
   Decision/Commit result only for the same Transition and reviewed subject;
   historical content cannot be filled from the live Draft. A different
   historical object requires explicit navigation and its own load.

[B-03](business.md#b-03-the-version-being-reviewed) defines which version a user
reviews. Notification transports and refresh intervals are implementation
choices; correctness must not depend on a particular poll interval or a
notification arriving before the next guarded command.

**Acceptance:** late responses, external revisions, empty results and failed
refreshes preserve the correct object and state. A revision change never reuses
old readiness as authorization for the new revision.

### A-03: Write acknowledgement and recovery

Model command outcome separately from subsequent projection reads.

| Outcome | Required handling |
| --- | --- |
| Not sent / local validation rejected | Retain input; do not imply a server write. |
| In flight | Serialize conflicting submissions; retain the exact command identity, payload and expected versions. |
| Authoritatively refused | Display the structured reason and retain usable input. A concurrency refusal does not authorize overwriting the newer Draft. |
| Outcome unknown | Retain the original command and uncertainty. Use an existing receipt/status capability to resolve it; any allowed retry uses the same command identity, payload and preconditions. |
| Write acknowledged | Record the returned outcome and revision, including reused/no-change outcomes. Remove only local edits confirmed by that acknowledgement. |
| Acknowledged, read unavailable | Continue to say the write was confirmed and the display could not refresh. Retry the read, not a newly invented save. |

A timeout, abort or disconnected browser does not prove that a write was undone.
Missing recovery capabilities remain explicit limitations; do not invent a new
backend API or report success without authoritative evidence. Changed input or
preconditions form a new command only after resolving the original outcome and
rechecking the current context.

Keep any edits made after submission separate from the submitted batch. Neither
a late acknowledgement nor a failed refresh may clear them. Results from a
previous scope cannot update the newly selected scope. A new authoritative
revision invalidates unprepared assumptions; an existing fixed Review remains
readable with its own status.

**Acceptance:** cover write-success/read-failure, lost response and exact retry,
concurrent refusal, edits made during submission and late completion after a
scope change. User-facing outcomes follow [B-05](business.md#b-05-failure-and-recovery-feedback).

### A-04: Module responsibilities and exceptions

Retain the four-layer boundaries above and apply these placement rules:

- Hooks own React lifetimes and interaction coordination. A simple request used
  by one workflow may call an infrastructure adapter directly; an empty wrapper
  is not required for every endpoint.
- Share a write use case in `commands/` when multiple entries need it or it
  coordinates a reusable business operation. Share reads in `queries/` and pure
  comparisons/projections in `domain/`. All entries use the same policy and
  identity rules rather than reimplementing them.
- `queries/` exposes reads and `commands/` exposes writes. Existing mixed helpers
  are implementation gaps to separate when the affected operation is changed;
  they are not a new exception or a mandate to move the entire codebase now.
- Stores remain passive. Shared types belong in `types/` or the owning contract,
  static values in `data/`, and technical helpers in `utils/`. These directories
  must not hide business policy, I/O or reverse dependencies to evade a layer
  boundary. Domain helpers must remain deterministic and free of I/O.
- Page-level direct data access is limited to the existing reviewed allowlist
  in the boundary test. Extending an exception requires an explicit reason,
  scope and matching check update; directory placement alone grants no exception.
  Next.js server transport remains separate from application mutation authority.

**Acceptance:** check dependency boundaries and the affected shared operation's
callers. A layout or label change must not introduce an additional evaluator for
version identity, permission, readiness or recovery.

### A-05: Supported and compatibility paths

| Path class | Target boundary |
| --- | --- |
| Workspace Content editing and verified proposal publication | Use the authoritative authoring Draft and guarded application capabilities, with the ownership and outcome rules above. |
| Dedicated or inline Schema editing | Address the same explicit Workspace/candidate and exact definition; share the business rules in B-04. |
| Exact-source configuration | May use its own supported source-transition capability; it must retain its exact-source semantics and the same application authority. |
| Legacy `workspaceTool=edit` / `reviewPane=edit` editing addresses | Adapt or redirect to the canonical editing session. They must not maintain a separate current Draft reconstructed from legacy fields. |
| Historical Review, Commit and operation evidence | Keep exact-version reads available; historical data does not become current mutation authority. |

A compatibility adapter is supported only when it can identify the exact current
object and use an authorized capability with its required preconditions. If it
cannot, expose read-only history or a clear unsupported action with a valid
canonical destination; do not substitute defaults or weaken guards.

Before retiring a path, identify its callers, address mapping, command authority
and exit condition. Do not add new callers to a superseded write path. Migrate
the final caller before deleting compatibility code, and preserve historical
evidence. This contract specifies the target; it does not claim these paths
have already migrated or authorize deleting them in a documentation change.

**Acceptance:** old addresses resolve to the intended Workspace or exact
historical object; supported writes obey the same guards; unsupported writes
are explicit; retirement keeps history readable.
