# `@t3x-dev/local`

Minimal local entry package for T3X.

Current PR2 scope:

- `t3x-local start` launches the locally built API + Web
- `t3x` forwards to `@t3x-dev/cli`
- `t3x-mcp` forwards to `@t3x-dev/mcp`

This phase uses local build artifacts already present in the monorepo.
It does not download runtime assets yet.
