<p align="center">
  <img src=".github/assets/t3x-logo.svg" alt="T3X" width="80" />
</p>

<h1 align="center">T3X</h1>

<p align="center">
  <strong>Version control for YAML-structured context.</strong>
</p>

<p align="center">
  <a href="https://t3x.dev/docs">Docs</a> &middot;
  <a href="https://t3x.dev">Website</a> &middot;
  <a href="https://discord.gg/t3x">Community</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
  <a href="https://www.npmjs.com/package/@t3x-dev/core"><img src="https://img.shields.io/npm/v/@t3x-dev/core" alt="npm" /></a>
  <a href="https://github.com/t3x-dev/t3x-core/actions"><img src="https://img.shields.io/github/actions/workflow/status/t3x-dev/t3x-core/ci.yml?branch=main" alt="CI" /></a>
</p>

<br/>

<p align="center">
  <img src=".github/assets/concept.svg" alt="How T3X works" width="760" />
</p>

<br/>

T3X is a standalone, deterministic engine for YAML-structured context. Write or generate YAML, transform it with [YOps](https://t3x.dev/docs/yops) (13 YAML-native operations), and version it with commit, diff, and three-way merge.

T3X also includes an LLM-powered extraction module that builds YAML incrementally from conversations, documents, and transcripts &mdash; so you don't have to write it by hand.

<br/>

## Getting started

```bash
npx @t3x-dev/cli init
```

Or run the full stack with Docker:

```bash
docker compose up -d
```

> **WebUI** &rarr; [localhost:3000](http://localhost:3000) &nbsp;&nbsp;|&nbsp;&nbsp; **API** &rarr; [localhost:8000](http://localhost:8000)

### Configuration

T3X uses two config levels:

```
~/.t3x/config.json          # API keys, default server URL
<project>/.t3x/config.json  # Project-specific settings
```

The core engine works without any API key. To use the extraction module, add an LLM key &mdash; T3X supports Anthropic and Google AI.

&rarr; [Full setup guide](https://t3x.dev/docs/quickstart)

<br/>

## Use T3X

### For AI agents &mdash; MCP Server

Connect any MCP-compatible agent to T3X with 47 built-in tools:

```json
{
  "mcpServers": {
    "t3x": {
      "command": "npx",
      "args": ["@t3x-dev/mcp"]
    }
  }
}
```

Works with Claude Code, Cursor, Windsurf, and others. &rarr; [MCP docs](https://t3x.dev/docs/mcp)

### For your terminal &mdash; CLI

```bash
t3x extract     # Build YAML from text (LLM-powered)
t3x commit      # Commit a snapshot
t3x diff        # Compare two commits
t3x merge       # Three-way merge
```

&rarr; [CLI reference](https://t3x.dev/docs/cli)

### For your app &mdash; API

RESTful API with OpenAPI spec for programmatic access.

&rarr; [API reference](https://t3x.dev/docs/api)

### For evaluation &mdash; Runner

Trace-based CI/CD for AI agent behavior. Capture I/O traces, run assertions, gate deployments.

&rarr; [Runner docs](https://t3x.dev/docs/runner)

<br/>

## Develop

```bash
git clone https://github.com/t3x-dev/t3x-core.git && cd t3x-core
pnpm install && pnpm build
pnpm dev:api     # API at localhost:8000
pnpm dev:webui   # WebUI at localhost:3000
```

Requires Node.js 20+ and pnpm 10+.

### Project structure

```
packages/core        # Deterministic engine — diff, merge, hash chains, YOps
packages/storage     # PostgreSQL persistence layer
packages/api         # API library (Hono + OpenAPI)
packages/api-client  # TypeScript client
apps/web             # WebUI (Next.js)
apps/api             # API server
apps/cli             # CLI
apps/mcp             # MCP server
apps/runner          # Evaluation engine
```

### Commands

```bash
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm check           # Lint + format (Biome)
pnpm check:fix       # Auto-fix
```

&rarr; [Contributing guide](./CONTRIBUTING.md)

<br/>

## Packages

| Package | |
|:--------|:--|
| [`@t3x-dev/core`](https://www.npmjs.com/package/@t3x-dev/core) | Deterministic engine |
| [`@t3x-dev/storage`](https://www.npmjs.com/package/@t3x-dev/storage) | Persistence layer |
| [`@t3x-dev/api`](https://www.npmjs.com/package/@t3x-dev/api) | API server |
| [`@t3x-dev/api-client`](https://www.npmjs.com/package/@t3x-dev/api-client) | TypeScript client |
| [`@t3x-dev/mcp`](https://www.npmjs.com/package/@t3x-dev/mcp) | MCP server |

<br/>

## Documentation

[t3x.dev/docs](https://t3x.dev/docs) &mdash; Quickstart, YOps reference, API reference, architecture, self-hosting.

<br/>

## License

[Apache License 2.0](./LICENSE)
