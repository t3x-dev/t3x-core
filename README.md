# T3X - Git for Meaning

T3X is a semantic version control system for AI conversations. It provides evidence-backed, deterministic semantic extraction with versioning, branching, and merging capabilities similar to Git.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development servers
pnpm dev:api    # API server at http://localhost:8000
pnpm dev:webui  # WebUI at http://localhost:3000
```

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](./CLAUDE.md) | Project architecture and development guide |
| [API Reference](./docs/API_REFERENCE.md) | Complete API documentation |
| [Local Testing](./docs/LOCAL_TESTING.md) | End-to-end testing guide |
| [V4 Architecture](./docs/specification/semantic-layer-architecture.md) | V4 semantic layer design |
| [Memory & Pin System](./docs/specification/memory-pin-system-design.md) | Pin and context system design |

## Architecture

T3X is a monorepo with the following structure:

```
t3x/
├── packages/
│   ├── core/           # @t3x-dev/core - Deterministic semantic engine
│   ├── storage/        # @t3x-dev/storage - PostgreSQL persistence
│   └── api-client/     # @t3x-dev/api-client - TypeScript API client
├── apps/
│   ├── web/            # t3x-webui - Next.js frontend
│   ├── api/            # @t3x-dev/api - Hono API server
│   ├── runner/         # @t3x-dev/runner - Agent evaluation engine
│   └── cli/            # @t3x-dev/cli - Command line interface
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Turn** | A single message in a conversation (user/assistant) |
| **Commit** | A semantic snapshot of knowledge extracted from turns |
| **Branch** | A named pointer to a commit (like Git branches) |
| **Leaf** | An application of committed knowledge with constraints (V4) |
| **Pin** | A marker for items selected as commit sources or context (V4) |

### V4 Architecture (Current)

```
CommitV4 = Pure Knowledge (sentences only, NO constraints)
Leaf     = Application Layer (constraints + output + validation)
Pin      = Source Selection (for commit sources + conversation context)
```

## Development

```bash
# Run tests
pnpm test              # All tests
pnpm test:core         # Core package tests
pnpm test:storage      # Storage package tests

# Linting
pnpm lint              # Check for issues
pnpm lint:fix          # Auto-fix issues

# Docker
docker compose up -d   # Start all services
```

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# Required for LLM features (optional for core functionality)
ANTHROPIC_API_KEY=sk-...
GOOGLE_AI_STUDIO_KEY=...

# Database (optional - uses PGLite by default)
DATABASE_URL=postgres://...
```

## License

See [LICENSE](./LICENSE) for details.
