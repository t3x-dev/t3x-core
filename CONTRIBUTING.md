# Contributing to T3X

Thank you for your interest in contributing to T3X! We welcome contributions from everyone and are grateful for every pull request, bug report, and feature suggestion.

## Licensing

T3X is licensed under the [Apache License 2.0](./LICENSE). This is a permissive open-source license that lets you freely use, modify, distribute, and build on T3X — including in commercial projects.

By submitting a pull request, you agree that your contributions will be licensed under the Apache License 2.0.

### What does this mean for you?

- **Use freely**: Use T3X in personal, commercial, or enterprise projects with no restrictions.
- **Fork and build**: Create your own version, modify anything, distribute it however you like.
- **Contribute back**: Your PRs help everyone — and you keep full rights to your own work.
- **Only requirement**: Keep the copyright notice and license text when redistributing.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL (or let the embedded PG handle it in dev)

### Setup

```bash
git clone https://github.com/t3x-dev/t3x-core.git
cd t3x-core
pnpm install
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
2. Create a feature branch from `dev` (`git checkout -b feat/your-feature`)
3. Make your changes
4. Ensure tests pass (`pnpm test`)
5. Ensure linting passes (`pnpm check`)
6. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format
7. Push and open a pull request to `dev`

During alpha, ordinary development PRs target `dev`; release candidate PRs move
`dev` into `main`. See [PR and release guards](./docs/contributing/pr-and-release-guards.md)
and [Release flow](./docs/release/release-flow.md) for the current
branching, changeset, and release rules.

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

Open a [Discussion](https://github.com/t3x-dev/t3x-core/discussions) or file an issue. We're happy to help you get started.
