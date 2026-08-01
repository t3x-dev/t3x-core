<p align="center">
  <img src=".github/assets/t3x-logo.svg" alt="T3X" width="72" />
</p>

<h1 align="center">T3X</h1>

<p align="center">
  <strong>Version control for structured state.</strong><br />
  <sub>Review, validate, and commit changes made by people or agents.</sub>
</p>

<p align="center">
  <a href="https://docs.t3x.dev">Docs</a> &middot;
  <a href="https://www.t3x.dev">Website</a> &middot;
  <a href="#quickstart">Quickstart</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license" /></a>
  <img src="https://img.shields.io/badge/alpha-v0.6.0%20public-green" alt="public alpha v0.6.0" />
  <img src="https://img.shields.io/badge/Node.js-20%2B-10b981" alt="Node.js 20 or newer" />
</p>

T3X is a workspace for changing YAML and other structured state. It keeps the
change, its source, its checks, and its decision together—so you can inspect
what happened before committing it and understand it later.

<p align="center">
  <img src=".github/assets/t3x-state-transition.png" alt="A transition connecting one version of structured state to the next" width="960" />
</p>

## Features

- **Review before commit.** See the exact state diff before history moves.
- **Deterministic changes.** Apply ordered, fail-fast YAML operations with
  [YOps](packages/yops/).
- **Validation that stays visible.** Run [YSchema](packages/yschema/) and
  external checks without hiding failures or overrides.
- **Traceable decisions.** Keep source, explanation, actor, and evidence with
  the change they belong to.
- **Useful history.** Compare, branch, merge, and revert structured state
  without erasing how it changed.
- **One path for humans and agents.** Agent proposals stay reviewable like
  human changes.

<p align="center">
  <img src=".github/assets/t3x-release-agent-review.png" alt="Reviewing a structured Release Agent state transition in T3X" width="960" />
</p>

## Quickstart

Run the local public alpha:

```bash
npx -p @t3x-dev/local t3x-local
```

The launcher guides setup, starts the API and WebUI, and asks before opening a
browser. Use `--yes --no-open` for non-interactive evaluation.

### Develop from source

```bash
git clone https://github.com/t3x-dev/t3x-core.git
cd t3x-core
pnpm install
pnpm dev:api     # http://localhost:8000
pnpm dev:webui   # http://localhost:3000
```

Requires Node.js 20+ and pnpm 10+.

### Use the engines directly

```bash
npm install @t3x-dev/yops @t3x-dev/yschema
```

- **YOps** applies declarative YAML changes.
- **YSchema** validates structured state and can produce YOps-compatible fixes.

Both packages can be used without the T3X application.

### Self-hosted evaluation

```bash
cp .env.example .env
docker compose up -d --build
```

WebUI: [localhost:3000](http://localhost:3000) · API:
[localhost:8000](http://localhost:8000)

Review the [deployment guide](docs/deployment.md) before exposing the stack
beyond localhost.

## Availability

T3X is a public alpha. The current npm release surface is intentionally narrow:

| Package | Status | Use |
|:--|:--|:--|
| [`@t3x-dev/local`](apps/local/) | public alpha | Run T3X locally |
| [`@t3x-dev/yops`](packages/yops/) | public alpha | Apply YAML operations |
| [`@t3x-dev/yschema`](packages/yschema/) | public alpha | Validate structured state |

The Transition protocol, WebUI, API, CLI, and MCP integrations remain internal
or preview surfaces and may change.

## Learn more

[Documentation](https://docs.t3x.dev) ·
[Alpha limitations](docs/limitations.md) ·
[Stability](docs/stability.md) ·
[Security](SECURITY.md) ·
[Contributing](CONTRIBUTING.md)

## License

[Apache License 2.0](./LICENSE)
