# Security Policy

T3X is in restricted alpha. Security reports are welcome, but the project does
not yet offer a formal public bug bounty, severity SLA, or production support
contract.

## Reporting a Vulnerability

Do not open a public issue for a vulnerability or suspected credential leak.

Preferred reporting path:

1. Use GitHub's private security reporting or Security Advisory flow for this
   repository, if it is available to you.
2. If no private reporting flow is available, open a normal issue that asks for
   a private security contact channel. Do not include exploit steps, secrets,
   payloads, or sensitive logs in that public issue.
3. Share technical details only after a maintainer confirms a private channel.

Please include:

- Affected package, app, or deployment mode.
- Steps to reproduce, if available.
- Whether the issue affects source development, Docker self-hosting, the local
  alpha package, or a preview/internal surface.
- Any logs or commit hashes needed to identify the build.

## Supported Security Surface

The restricted alpha release surface is declared in
[`RELEASE.md`](RELEASE.md) and [`release/surface.yaml`](release/surface.yaml).
For this alpha, the release-facing packages are:

- `@t3x-dev/local`
- `@t3x-dev/yops`

The WebUI, API, CLI, MCP, runner, and storage packages are available in the
repository for source development and self-hosted evaluation, but their external
contracts remain preview or internal until promoted.

## Deployment Security Notes

- Docker and self-hosted runs keep auth on by default.
- Source development opens directly into the app by default unless
  `AUTH_DISABLED=false` is set before starting both dev processes.
- Do not run `AUTH_DISABLED=true` on a network-exposed deployment.
- API keys and provider credentials should be passed through environment
  variables or local configuration files that are not committed.
- Rotate provider keys if logs, screenshots, or issue reports may have exposed
  them.

## Disclosure

The maintainers will assess reports against the current alpha surface. Fixes may
ship as regular releases or as direct patches, depending on impact and release
state. Public disclosure timing should be coordinated with the maintainers.
