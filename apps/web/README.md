# T3X WebUI

Web frontend for T3X structured-state workflows. This is a preview surface;
see the repository's [stability summary](../../docs/stability.md).

## Documentation

| Document | Responsibility |
| --- | --- |
| [Agent guide](AGENTS.md) | Task scope, required reading and verification |
| [Architecture](docs/architecture.md) | Module boundaries, state ownership, transport and frontend contracts |
| [Business contracts](docs/business.md) | Core objects, workflow rules and frontend business contracts |
| [Repository guide](../../AGENTS.md) | Project-wide architecture and development constraints |

The architecture and business documents distinguish normative contracts from
descriptive implementation maps. They define the target for changes; adoption
does not certify that existing code already conforms.

### Repository contracts relevant to WebUI

Use the references below when a task touches the corresponding system behavior.
Routine WebUI work needs only the relevant frontend contracts and repository
guidance. The rest of the root `docs/` directory is optional background for
WebUI work unless a task explicitly touches its subject.

| When changing | Read for |
| --- | --- |
| Review, decisions, or commits | [Transition Application Convergence](../../docs/architecture/transition-application-convergence.md) for immutable review evidence and the authoritative mutation path |
| Workspace ownership, saving, or conflict recovery | [Reliable Workspace Gate 1](../../docs/architecture/reliable-workspace-gate-1.md#frozen-behavior) for private drafts, guarded writes, and reconciliation |
| Roles, collaboration, or request identity | [Namespace Authority](../../docs/architecture/namespace-authority-v1.md) for roles and project grants, and [Request Principal](../../docs/architecture/request-principal-migration-baseline.md) when changing how WebUI forwards authenticated requests |
| Committed State export | [Exact Committed State Export](../../docs/architecture/state-export.md) for version identity and complete export |
| Repository names, addresses, or redirects | [Repository Addresses](../../docs/repository-addresses.md) for canonical names, stable identity, and historical addresses |

## Development

Run these in separate terminals from the repository root:

```bash
pnpm dev:api
```

```bash
pnpm dev:webui
```

Default development ports are `8000` for the API and `3000` for WebUI. Browser
HTTP requests use WebUI's same-origin `/api` proxy. For environment variables,
authentication and self-hosted evaluation, use the [deployment guide](../../docs/deployment.md).

The app uses Next.js 16, React 19 and TypeScript, with Tailwind CSS, CSS Modules,
shared UI components and Zustand. See [package.json](package.json) for current
dependencies and scripts, and the [source map](docs/architecture.md#source-map)
for directory responsibilities.

## Checks

Run from the repository root; select checks according to the
[repository verification policy](../../AGENTS.md#verification).

```bash
pnpm check
pnpm --filter t3x-webui typecheck
pnpm --filter t3x-webui check:boundaries
pnpm test:webui
```

For a focused test, use `pnpm --filter t3x-webui exec vitest run <test-file>`.
Use `pnpm build:webui` when a build is relevant to the change. Browser business
acceptance is a separate activity with agreed scenarios; automated checks and
screenshots do not establish it.
