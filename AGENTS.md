# Repository Guide

**Last Updated:** 2025-12-30

## Project Structure and Module Organization
This is a pnpm + Turborepo monorepo with core code in `apps/` and `packages/`.
- `apps/web` (Next.js UI), `apps/api` (Hono API), `apps/runner`, `apps/cli`, `apps/agent-demo`
- `packages/core`, `packages/storage`, `packages/api-client`, `packages/runner`, `packages/types`
- Shared support directories: `docs/`, `scripts/`, `docker-compose.yml`, `turbo.json`

## Build, Test, and Development Commands
Execute from repository root by default.
- `pnpm install` installs workspace dependencies.
- `pnpm dev:webui`, `pnpm dev:api`, `pnpm dev:agent` start local services (ports 3000/8000/9000).
- `pnpm build` builds all packages; `pnpm build:core` builds a single package.
- `pnpm test` runs all tests; `pnpm test:webui` runs tests for a specific package.
- `pnpm --filter @t3x/core test -- src/__tests__/diff/engine.test.ts` runs a single test file.
- `pnpm lint`, `pnpm format`, `pnpm check` use Biome for lint/format.
- `pnpm docker:up` starts WebUI + API; `pnpm docker:up:all` adds runner + n8n.

## Coding Style and Naming Conventions
Formatting is unified by Biome (`biome.json`): 2-space indent, single quotes, semicolons, max line width 100, ES5 trailing commas. Code uses `camelCase`, React components use `PascalCase` (see `apps/web/src/components`). API JSON uses `snake_case` fields, internal code uses `camelCase`.

## Testing Guide
JavaScript/TypeScript tests use Vitest, typically located in `src/__tests__/`. Storage tests use PGLite for isolated databases. During development, prefer running targeted tests (e.g., `pnpm --filter @t3x/storage test -- src/__tests__/projects.test.ts`), run full test suite before major changes.

## Commit and Pull Request Guidelines
Recent commits use prefixes like `feat(scope):`, `fix(scope):`, `docs:`, `feature:`, `bugfix:`; recommend including scope (e.g., `feat(webui): ...`) with a short verb phrase description. If corresponding to a PR/Issue, add the number in parentheses (e.g., `(#41)`).
PRs should include clear change descriptions and test information; attach screenshots for UI changes and link related Issues when applicable.

## Configuration Notes
Common environment variables:
- `DATABASE_URL`: PostgreSQL connection string (Docker/production), uses PGLite if not set
- `T3X_DATA_DIR`: PGLite data directory (default `.t3x/data`)
- `T3X_IN_MEMORY`: Set to `true` for PGLite in-memory mode
- `ANTHROPIC_API_KEY`: Claude API access
- `HTTPS_PROXY` / `HTTP_PROXY`: HTTP proxy (chat.ts uses undici)
- `NEXT_PUBLIC_API_URL`: API address for WebUI calls
- `LOG_LEVEL`: Log level
