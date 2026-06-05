# Alpha Limitations

T3X is a restricted alpha. The current repository is suitable for source
development, local evaluation, and self-hosted testing, but it should not be
read as a production-readiness claim.

## Release Surface

The current release-facing npm package surface is limited to:

- `@t3x-dev/local`
- `@t3x-dev/yops`

Package access may be restricted to alpha users. Other packages in this
repository are preview or internal until promoted through the release process in
[`RELEASE.md`](RELEASE.md) and [`release/surface.yaml`](release/surface.yaml).

## Product Limitations

- The public repository contains the self-hostable core product, not the private
  SaaS layer.
- Cloud-only features such as OAuth provider setup, billing, teams, and managed
  tenant operations live outside this repository.
- Docker Compose is the supported self-host evaluation path. High availability,
  backup automation, hosted upgrades, managed monitoring, and multi-region
  deployment are not claimed by this alpha.
- Local alpha package behavior may depend on restricted runtime assets.
- CLI, MCP, API, runner, and storage package contracts may change before they
  are promoted to the release surface.

## Auth and Data Limitations

- Docker and self-hosted runs keep username/password auth on by default.
- Source development defaults to no auth for local convenience unless
  `AUTH_DISABLED=false` is set before starting both dev processes.
- Do not expose a source-dev or `AUTH_DISABLED=true` deployment to an untrusted
  network.
- Users are responsible for provider API keys, database credentials, backups,
  and local machine access controls.

## Documentation Limitations

- `RELEASE.md` and `release/surface.yaml` are authoritative for package release
  status.
- `docs/release/stability-policy.md` is authoritative for stability and
  contract-change expectations.
- Preview docs may describe internal or candidate surfaces before those surfaces
  are promoted.
- Screenshot assets used by public docs live outside the core repository unless
  a committed asset is explicitly reviewed.

## YOps Limitations

YOps is the deterministic mutation language for T3X and is part of the
restricted alpha surface. Its runtime source of truth is
`packages/yops/yops.yaml`.

Spec changes are allowed during restricted alpha, but contract-bearing changes
must follow the stability policy. Future YOps tightening work should proceed in
small PRs, one spec contraction at a time, with executable conformance coverage.
