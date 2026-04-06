# Contributing to T3X

Thank you for your interest in contributing to T3X! We welcome contributions from everyone and are grateful for every pull request, bug report, and feature suggestion.

## Licensing

T3X uses a dual-license model:

| Package | License | SPDX |
|---------|---------|------|
| `packages/core` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `packages/storage` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `packages/api` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `apps/api` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `apps/web` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `apps/cli` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `apps/runner` | GNU Affero General Public License v3.0 | `AGPL-3.0-only` |
| `packages/api-client` | Apache License 2.0 | `Apache-2.0` |
| `apps/mcp` | Apache License 2.0 | `Apache-2.0` |
| `apps/agent-demo` | Apache License 2.0 | `Apache-2.0` |

By submitting a pull request, you agree that your contributions will be licensed under the same license as the package you are contributing to.

### What does this mean for you?

- **As a contributor**: You can fork, modify, and submit PRs exactly like any open-source project. No difference from MIT in practice.
- **As a self-hoster**: You can run T3X internally for your team with no restrictions.
- **As an integrator**: The API client and MCP server are Apache-2.0 — build whatever you want on top.
- **AGPL only applies** if you distribute a modified version of T3X or offer it as a network service to others. In that case, you must share your modifications under AGPL.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL (or let the embedded PG handle it in dev)

### Setup

```bash
git clone https://github.com/t3x-dev/t3x.git
cd t3x
pnpm install
pnpm build
```

### Development

```bash
pnpm dev:api     # API server on port 8000
pnpm dev:webui   # WebUI on port 3000
```

### Running Tests

```bash
pnpm test              # All tests
pnpm test:core         # Core package only
pnpm test:storage      # Storage package only
pnpm test:api          # API tests only
```

## How to Contribute

### Reporting Bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, etc.)

### Suggesting Features

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting Code

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes
4. Ensure tests pass (`pnpm test`)
5. Ensure linting passes (`pnpm check`)
6. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format
7. Push and open a pull request

### Commit Messages

We use Conventional Commits:

```
feat(core): add new extractor ring for temporal anchors
fix(web): resolve canvas node positioning after merge
test(storage): add leaf query edge case coverage
docs: update API reference for v4 endpoints
```

### Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `pnpm check:fix` before submitting
- No `console.log` in production code
- No `any` type escapes

## Architecture Overview

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation, including:
- Package dependency graph
- Three-layer design (Core / Storage / Product)
- Data formats and ID conventions
- Testing patterns

## Questions?

Open a [Discussion](https://github.com/t3x-dev/t3x/discussions) or file an issue. We're happy to help you get started.
