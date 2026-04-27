# `@t3x-dev/local`

Minimal local entry package for T3X.

Current PR2 scope:

- `t3x-local start` launches the locally built API + Web
- `t3x` forwards to `@t3x-dev/cli`
- `t3x-mcp` forwards to `@t3x-dev/mcp`

On package install, `postinstall` downloads the platform runtime asset from
`runtime-manifest.json`.

For private GitHub releases, set `T3X_LOCAL_GITHUB_TOKEN`, `GH_TOKEN`, or
`GITHUB_TOKEN` to a token with access to the runtime release.
