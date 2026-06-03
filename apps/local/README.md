# `@t3x-dev/local`

Minimal local entry package for T3X.

## Release status

`@t3x-dev/local@0.3.1` is part of the restricted T3X alpha release surface.
Package visibility may be limited to accounts with alpha access.

Alpha entrypoint:

```bash
npx -p @t3x-dev/local t3x-local start
```

## Scope

- `t3x-local start` launches the locally built API + Web
- `t3x` forwards to `@t3x-dev/cli`
- `t3x-mcp` forwards to `@t3x-dev/mcp`

On package install, `postinstall` downloads the platform runtime asset from
`runtime-manifest.json`.

For private GitHub releases, set `T3X_LOCAL_GITHUB_TOKEN`, `GH_TOKEN`, or
`GITHUB_TOKEN` to a token with access to the runtime release.
