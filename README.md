<p align="center">
  <img src=".github/assets/t3x-logo.svg" alt="T3X" width="80" />
</p>

<h1 align="center">T3X</h1>

<p align="center">
  <strong>Version control for structured state.</strong>
</p>

<p align="center">
  <a href="https://docs.t3x.dev">Docs</a> &middot;
  <a href="https://www.t3x.dev">Website</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
  <img src="https://img.shields.io/badge/alpha-v0.4.1%20public-green" alt="public alpha v0.4.1" />
</p>

<br/>

<p align="center">
  <img src=".github/assets/concept.svg" alt="How T3X works" width="760" />
</p>

<br/>

Structured YAML is easy to change and hard to govern. Decisions, requirements,
infrastructure, and plans drift across chats, docs, specs, and prompt runs.

T3X records schema-backed YAML changes as deterministic YOps patches, then
versions the result with commits, diffs, merges, provenance, and generated
outputs.

<br/>

## Quickstart

### Develop from source

Use this path if you want to inspect and change the repository itself.

```bash
git clone https://github.com/t3x-dev/t3x-core.git && cd t3x-core
pnpm install
pnpm dev:api     # API at localhost:8000
pnpm dev:webui   # WebUI preview at localhost:3000
```

Requires Node.js 20+ and pnpm 10+.

Source development opens straight into the app by default; set
`AUTH_DISABLED=false` before starting both processes if you want to exercise
the login flow.

### Try the local package

Use this path to run the packaged local T3X experience:

```bash
npx -p @t3x-dev/local t3x-local start
```

Use this for the packaged local T3X experience, including the preview WebUI.
Package and runtime release assets are public alpha artifacts; see
[Availability](#availability).

### Use YOps as a library

Use this path when you want the deterministic YAML operation engine inside your
own app:

```bash
npm install @t3x-dev/yops
```

The package is part of the public alpha npm release surface.

### Validate the self-hosted stack <sup>evaluation</sup>

```bash
cp .env.example .env
docker compose up -d --build
```

> **WebUI** &rarr; [localhost:3000](http://localhost:3000) &nbsp;|&nbsp; **API** &rarr; [localhost:8000](http://localhost:8000)

Docker Compose starts WebUI, API, and Postgres for self-hosted evaluation.
Review the [deployment guide](docs/deployment.md) before exposing it beyond
localhost. Docker and self-hosted runs keep auth on by default, so the first
WebUI visit goes through the built-in username/password login at `/login`.

<br/>

## WebUI preview

<p align="center">
  <img src="https://docs.t3x.dev/img/screenshots/chat-light.png" alt="T3X WebUI chat preview" width="760" />
</p>

The `/chat` view shows the `Source -> YOps -> Commit` workflow before the
first extraction run. Screenshot assets live in the docs site so the core
repository does not need to carry generated image files.

When the source-dev WebUI is running, open the
[intro demo preview](http://localhost:3000/chat?introDemo=1) to load the guided
intro demo. The `introDemo` flag is development-only.

<br/>

## How it works

T3X follows a `Source -> YOps -> Commit` loop. Source evidence proposes a
structured change; YOps applies that change to YAML state; commits preserve the
result with parents, operation logs, and provenance.

<table>
<tr>
<td width="33%" align="center"><strong>Source</strong></td>
<td width="34%" align="center"><strong>YOps</strong></td>
<td width="33%" align="center"><strong>Commit</strong></td>
</tr>
<tr>
<td align="center"><sub>Chat, doc, spec, prompt run</sub></td>
<td align="center"><sub>Review and apply deterministic YAML operations</sub></td>
<td align="center"><sub>Version the new state with parents and provenance</sub></td>
</tr>
<tr>
<td align="center"><code>source evidence</code></td>
<td align="center"><code>old YAML + YOps -> new YAML</code></td>
<td align="center"><code>commit / diff / merge</code></td>
</tr>
</table>

> Extraction and generation can use LLMs. YOps Apply, validation, commit
> hashing, diff, and merge are deterministic.

Diff and merge compare committed structured states. Fixes, extraction edits, and
merge resolutions are applied back through YOps before a new commit is written.

### Small example

```yaml
source:
  text: Move launch region from US to EU and add security review before release.

state_before:
  launch:
    region: us
    gates:
      - qa

yops:
  - set:
      path: launch/region
      value: eu
  - append:
      path: launch/gates
      value: security_review

state_after:
  launch:
    region: eu
    gates:
      - qa
      - security_review

commit:
  parents:
    - sha256:...
  provenance:
    source: launch-note
```

<br/>

## The Y-Family

T3X uses three spec-driven tools for structured YAML state. Together they form a
validate-and-fix loop: detect issues, emit fix operations, apply them, confirm.

<table>
<tr>
<th width="33%">YOps</th>
<th width="33%">YSchema <sup>WIP</sup></th>
<th width="33%">YLint</th>
</tr>
<tr>
<td><strong>How to mutate</strong></td>
<td><strong>What is valid</strong></td>
<td><strong>Is it clean</strong></td>
</tr>
<tr>
<td>Atomic YAML operations<br/>Spec-driven, deterministic<br/>Sequential, fail-fast</td>
<td>User-defined domain schemas<br/>Slot types, enums, ranges<br/>Cross-node rules</td>
<td>Built-in structural rules<br/>Runs without a schema<br/>Auto-fix via YOps</td>
</tr>
<tr>
<td><a href="packages/yops/yops.yaml"><code>yops.yaml</code></a></td>
<td><a href="packages/yschema/yschema.yaml"><code>yschema.yaml</code></a></td>
<td>Built into <code>@t3x-dev/core</code></td>
</tr>
</table>

Two functions cover the core loop:

```typescript
applyYOps(doc, ops)              // mutate: apply operations to a YAML tree
validateTree(content, { schema }) // validate: check structure + domain, get fixes
```

`validateTree` runs ylint and yschema internally, collects warnings, and returns
a ready-to-apply fix plan. Auto-fixable issues resolve through `applyYOps()`.
Everything else is surfaced for review.

### YOps &mdash; Declarative YAML Operations

```yaml
yops:
  - define:
      path: user/preferences
  - populate:
      path: user/preferences
      values: { theme: dark, language: en }
  - sort:
      path: user/tags
  - assert:
      path: user/preferences/theme
      equals: dark
```

<table>
<tr><th>Category</th><th>Ops</th><th>Purpose</th></tr>
<tr><td><strong>DDL</strong></td><td><code>define</code> <code>drop</code> <code>rename</code></td><td>Create, remove, rename keys</td></tr>
<tr><td><strong>DML</strong></td><td><code>set</code> <code>unset</code> <code>populate</code> <code>append</code></td><td>Set values, add to sequences</td></tr>
<tr><td><strong>DTL</strong></td><td><code>move</code> <code>clone</code> <code>nest</code> <code>split</code> <code>fold</code> <code>merge</code> <code>sort</code> <code>unique</code> <code>pick</code> <code>omit</code></td><td>Reshape the tree</td></tr>
<tr><td><strong>DCL</strong></td><td><code>assert</code></td><td>Validate conditions (read-only)</td></tr>
</table>

The full spec &mdash; including a decision guide, type contracts, composition recipes, and error reference &mdash; lives in [`yops.yaml`](packages/yops/yops.yaml). Any language can implement a conformant engine from this single file.

### Validation

YSchema defines domain-specific shape: required nodes, slot types, enums, ranges,
and cross-node rules. YLint checks structural hygiene: key naming, value quality,
list hygiene, and tree depth. Both can emit YOps fixes.

Specs: [`yschema.yaml`](packages/yschema/yschema.yaml), YLint in
[`@t3x-dev/core`](packages/core/).

<br/>

## Configuration

```
~/.t3x/config.json          # API keys, default server URL
<project>/.t3x/config.json  # Project-specific settings
```

For one-machine local product use, CLI (`t3x auth/config`) and MCP read the
machine-level `~/.t3x/config.json`, and WebUI (`/settings/access`) manages that
same file through the standalone API. Effective lookup order is:

```text
T3X_API_URL / T3X_API_KEY (environment)
-> ~/.t3x/config.json
-> built-in defaults
```

Environment variables always win over the shared file.

After changing local access settings, use `t3x auth check` or the WebUI
`Test Access` action in `/settings/access` to verify the effective API URL, and
whether the current deployment requires or accepts the configured key.

Copy `.env.example` to `.env` to add provider keys for source development or to make auth settings explicit for Docker and other self-hosted deployments.

The core engine works without any API key. To use extraction or chat, add an Anthropic, OpenAI, or Google AI Studio key.

First-run auth defaults:

- Source development (`pnpm dev:api`, `pnpm dev:webui`) opens directly into the app by default.
- To exercise the login flow in source development, set `AUTH_DISABLED=false` in the shell before starting both dev processes.
- Docker and self-host keep auth on by default and use the built-in username/password login.

## Architecture

<table>
<tr><td align="center"><strong>Product</strong><br/><sub>WebUI (Next.js) &middot; API (Hono) &middot; CLI (preview) &middot; MCP (preview)</sub></td></tr>
<tr><td align="center"><strong>Storage</strong><br/><sub>PostgreSQL (Drizzle ORM) &middot; Embedded PG (dev)</sub></td></tr>
<tr><td align="center"><strong>Core</strong><br/><sub>Hash chains &middot; Diff engine &middot; Merge &middot; YLint &middot; Extract</sub></td></tr>
<tr><td align="center"><strong>Y-Family</strong><br/><sub>YOps (mutate) &middot; YSchema (validate, WIP) &middot; YLint (hygiene)</sub></td></tr>
</table>

**Design principles:**

- **Deterministic core** &mdash; Same inputs, same outputs. No LLM in the critical path.
- **Append-only** &mdash; Hash chains are immutable.
- **Evidence-backed** &mdash; Every finding traces to source text with character offsets.
- **Pluggable** &mdash; LLMs are optional plugins for extraction, never required.

### Project structure

```
packages/yops        # YOps — Declarative YAML operations
packages/yschema     # YSchema — WIP validation candidate with auto-fix
packages/core        # T3X engine — diff, merge, hash chains, extraction, ylint
packages/storage     # PostgreSQL persistence (Drizzle ORM)
packages/api-client  # TypeScript API client
apps/web             # WebUI (Next.js 16 + App Router)
apps/api             # Hono API server with OpenAPI
apps/cli             # Command-line interface (preview)
apps/mcp             # MCP server (preview)
apps/runner          # Grey-box agent evaluation engine
```

### Build

```bash
pnpm build           # Build all packages
pnpm test            # Run all tests
pnpm check           # Lint + format (Biome)
```

&rarr; [Contributing guide](./CONTRIBUTING.md)

<br/>

## Availability

The current npm release surface is intentionally narrow and declared in
[`RELEASE.md`](RELEASE.md) and [`release/surface.yaml`](release/surface.yaml).

| Package | Status | Description |
|:--------|:----|:------------|
| [`@t3x-dev/local`](apps/local/) | public alpha | Local installer and no-key demo entrypoint |
| [`@t3x-dev/yops`](packages/yops/) | public alpha | Declarative YAML operations |

Other packages remain internal or preview until they are promoted into the
release surface.

<br/>

## Documentation

[docs.t3x.dev](https://docs.t3x.dev) &mdash; Quickstart, YOps
reference, WebUI guide, and release notes.

Policies: [Security](SECURITY.md) &middot; [Alpha limitations](docs/limitations.md) &middot;
[Deployment](docs/deployment.md) &middot; [Stability](docs/stability.md)

<br/>

## License

[Apache License 2.0](./LICENSE)
