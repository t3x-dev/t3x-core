# `@t3x-dev/local`

Minimal local entry package for T3X.

## What

`@t3x-dev/local` is the alpha entry package for running T3X locally from npm.
It exposes `t3x-local`, plus convenience forwards for `t3x` and `t3x-mcp`.

## Why

The package gives alpha users one install path for the self-hostable product
without making every workspace package part of the public release surface.

## Release status

`@t3x-dev/local@0.5.0` is part of the public T3X alpha release surface.
Package visibility is public on npm.

## Install

This command uses the public npm package.

```bash
npx -p @t3x-dev/local t3x-local
```

## Scope

- `t3x-local` runs the guided local setup, starts API + Web, and asks before opening WebUI
- `t3x-local start` launches API + Web directly for scripts and advanced use
- `t3x` forwards to `@t3x-dev/cli`
- `t3x-mcp` forwards to `@t3x-dev/mcp`

On package install, `postinstall` attempts to download the platform runtime
asset from `runtime-manifest.json`. If that did not complete or npm hid the
install output, `t3x-local` reruns the runtime setup in the foreground before
starting the WebUI.

For private mirrors or local testing, set `T3X_LOCAL_GITHUB_TOKEN`, `GH_TOKEN`,
or `GITHUB_TOKEN` to a token with access to the runtime release.

## Sample

Public npm install:

```bash
npx -p @t3x-dev/local t3x-local
```

For non-interactive automation, opt in explicitly:

```bash
npx -p @t3x-dev/local t3x-local --yes --no-open
```
