# Deployment Guide

This guide describes the supported alpha deployment paths for the public T3X
repository. It does not describe the private SaaS deployment.

## Supported Alpha Paths

| Path | Command | Intended use |
|---|---|---|
| Source development | `pnpm dev:api` and `pnpm dev:webui` | Contributor and implementation work |
| Local alpha package | `npx -p @t3x-dev/local t3x-local` | Packaged local evaluation from public npm |
| Docker Compose | `docker compose up -d --build` | Self-hosted WebUI + API + Postgres evaluation |

## Docker Self-Hosting

Docker Compose starts:

- Postgres on port `5432`
- API on port `8000`
- WebUI on port `3000`

Basic flow:

```bash
cp .env.example .env
docker compose up -d --build
```

Optional services:

```bash
docker compose --profile runner up -d --build
docker compose --profile n8n up -d --build
docker compose --profile agent-demo up -d --build
```

Auth is on by default for Docker and self-hosted runs. The first WebUI visit
uses the built-in username/password login at `/login`.

## MCP Service

Run MCP over Streamable HTTP as a separate service alongside an
authentication-enabled T3X API. Build the image from the Core repository root
at the revision qualified for the test environment.

```bash
docker build -f apps/mcp/Dockerfile -t t3x-mcp:staging .
```

Use [the staging environment template](../apps/mcp/staging.env.example) for
runtime settings. Set the API URL and public MCP URL to the staging domains.
The image selects the HTTP transport and API backend, listens on
`0.0.0.0:3001` by default, and accepts an injected `PORT`. The staging
profile allows Draft changes and Commit read-back. Human Review preparation,
approval, and Commit remain in Web.

For Railway, create a separate service sourced from the reviewed Core revision
or its OCI image. When building from source, use the repository root as the
build context and set `RAILWAY_DOCKERFILE_PATH=/apps/mcp/Dockerfile`. Set
the service health check path to `/health`. Deploy this service separately
from the Cloud API and WebUI sync.
[Railway Dockerfile configuration](https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path)

Terminate TLS at the hosting proxy and forward `/mcp` without rewriting the
public `Host` or the client's `Authorization` header. Keep the service port
private behind the proxy. For local development, use the
[MCP loopback setup](../apps/mcp/README.md#streamable-http).
The public URL must have the exact `/mcp` path without credentials, a query, or
a fragment. If the client sends `Origin`, it must match the configured public
origin. Keep credentials in client secret configuration and avoid logging
authorization headers at the proxy.

Use `/health` for process liveness. The hosted qualification checks should
also use a Streamable HTTP client to initialize, list tools, and call
`t3x_context` with a test Agent token. Revoke the token through the API or WebUI
and verify that the next MCP request returns `401`.

## Source Development

Use source development when changing the repository itself:

```bash
pnpm install
pnpm dev:api
pnpm dev:webui
```

Source development defaults to opening directly into the app on localhost. To
exercise the login flow locally, set `AUTH_DISABLED=false` before starting both
dev processes.

### CommitV2 developer database reset

Developer databases created before the CommitV2 hard cutover are not supported
by the current source runtime. There is no CommitV1 compatibility bridge. Stop
the API with `Ctrl-C`, preserve the old database under a backup name, and then
restart it:

```bash
mv .t3x/pg-data .t3x/pg-data.commitv1-backup
pnpm dev:api
```

The restart creates a fresh CommitV2 database at `.t3x/pg-data`. The renamed
directory remains available for rollback or data recovery with a compatible
pre-cut checkout; delete it yourself only after confirming it is no longer
needed.

## Environment

At least one provider key is required for live extraction or chat:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_AI_STUDIO_KEY`

Common deployment variables:

- `DATABASE_URL` for Postgres-backed API and WebUI storage.
- `T3X_POSTGRES_STARTUP_MODE` selects `runtime` (read-only schema validation) or
  `bootstrap` (schema migration and built-in seed work) for external Postgres.
- `T3X_API_URL` for the WebUI server-side BFF and WebSocket rewrite target.
- `AUTH_DISABLED=false` to keep auth enabled explicitly.
- `WEBUI_PORT` and `POSTGRES_PORT` to override Docker Compose host ports.

Rate-limit counters use the same PostgreSQL database by default, so API
instances that share `DATABASE_URL` also share login, OAuth callback, IP, and
API-key limits. Set `TRUST_PROXY` to the exact number of trusted reverse-proxy
hops before relying on per-IP limits. When it is unset or invalid, requests use
the direct Node socket address when available and otherwise use a conservative
per-path fallback bucket. Cloud assemblers can instead pass a compatible
`RateLimitStore` to `createApp`; the store must provide an atomic consume
operation shared by every instance.

Before saving provider keys or deploy-agent tokens through the API, configure
`T3X_CREDENTIAL_ENCRYPTION_KEY` as a base64-encoded 32-byte key:

```bash
openssl rand -base64 32
```

Keep this key outside the database and its backups. To rotate it, set the new
value as `T3X_CREDENTIAL_ENCRYPTION_KEY` and keep the old value temporarily in
the comma-separated `T3X_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS`. Credentials are
rewrapped with the current key when they are next read. Remove previous keys
only after all stored credentials have been accessed or replaced. Losing every
key that matches an existing envelope makes that credential unrecoverable.

Do not commit provider keys, database passwords, or generated local config.

## PostgreSQL migration and runtime contract

An external PostgreSQL application connection defaults to `runtime` mode. Runtime
startup reads only `public._schema_version`; it never creates, alters, drops, or
truncates schema objects and never refreshes built-in seed rows. A missing, older,
newer, or unreadable version fails startup with an error that identifies the
required version and the migration or runtime upgrade action.

Run storage migration work as a separate job with the database owner (or another
role with equivalent migration privileges) before application replicas start:

```ts
import {
  inspectPostgresSchema,
  migratePostgresStorage,
  POSTGRES_SCHEMA_VERSION,
} from '@t3x-dev/storage';

const connectionString = process.env.T3X_MIGRATION_DATABASE_URL!;
const before = await inspectPostgresSchema({ connectionString });
const after = await migratePostgresStorage({ connectionString });

if (after.currentVersion !== POSTGRES_SCHEMA_VERSION) {
  throw new Error(`Storage migration did not reach ${POSTGRES_SCHEMA_VERSION}`);
}
```

`migratePostgresStorage` preserves the existing transaction and PostgreSQL
advisory-lock serialization around schema changes, then runs the idempotent
built-in-template seed workflow. `inspectPostgresSchema`,
`POSTGRES_SCHEMA_VERSION`, and the returned metadata let a host order its own
additional schema work around this storage-owned job. These are integration
contracts of the internal storage package; they do not add a stable public npm
release surface.

When upgrading an OAuth deployment from storage schema 90, drain all API
replicas that can write consent decisions before running the schema 91
migration. Resume traffic with the upgraded API and Web. The migration closes
requests identifiable from existing approval receipts and preserves the
remaining exchange window for each live code. Pre-upgrade cancellations and
receipts purged before migration cannot be reconstructed. An old link in
either group can open a fresh consent screen. Preserve the database lookup
keys and closed-request markers together in backups and restores.

For existing v83–v85 databases, the standalone job and API bootstrap
upgrade directly to v86. The upgrade installs any missing portable delivery
and deployment schema, creates the address and counter tables, installs the
numbering triggers, and backfills historical numbers. It preserves existing
Workspace Drafts and built-in templates.

Application processes should set `T3X_POSTGRES_STARTUP_MODE=runtime` and use a
separate login that is not the table owner and cannot inherit or set the migration
role. A representative grant shape is:

```sql
CREATE ROLE t3x_runtime LOGIN NOINHERIT PASSWORD '<managed-secret>';
GRANT CONNECT ON DATABASE t3x TO t3x_runtime;
GRANT USAGE ON SCHEMA public TO t3x_runtime;
REVOKE CREATE ON SCHEMA public FROM t3x_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO t3x_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO t3x_runtime;
```

The migration owner must also arrange matching default privileges for tables or
sequences introduced later. Granting DML does not transfer table ownership; do
not grant membership in the migration-owner role to the runtime login.

For an existing runtime role without default grants on the repository numbering tables,
apply these grants after migration and before starting the updated runtime:

```sql
GRANT SELECT, INSERT ON public.repository_object_addresses TO t3x_runtime;
GRANT SELECT, INSERT, UPDATE ON public.repository_object_address_counters TO t3x_runtime;
```

Local embedded PostgreSQL and storage test fixtures continue to use explicit
bootstrap behavior. The legacy `createPostgresStorage` constructor remains a
bootstrap-compatible alias for existing local integrations; new deployment code
should use `createPostgresRuntimeStorage`, `createPostgresBootstrapStorage`, or
the standalone migration function by intent.

Docker Compose keeps its fresh-install behavior by explicitly putting the API in
`bootstrap` mode. The WebUI waits for the API readiness check and starts in
`runtime` mode. Operators moving beyond the bundled self-hosted evaluation path
should replace API bootstrap mode with a one-shot migration job and runtime-only
application credentials.

## Production Caveats

This alpha does not claim managed production readiness. Before exposing T3X to
an untrusted network, review:

- Auth settings for API and WebUI.
- Database credentials, backups, and retention.
- TLS, reverse proxy, and host firewall configuration.
- Provider key storage and rotation.
- Logs and screenshots for possible sensitive content.
- Upgrade and rollback procedure.

The public repository supports self-hosted evaluation. Managed cloud deployment,
OAuth provider wiring, billing, teams, and tenant operations are cloud-specific
and live outside this repository.

## Hosted Deployment Qualification

Hosted candidates must be built from the repository root so both application
images can access every workspace package and build helper. The required image
checks are:

```bash
docker build -f apps/api/Dockerfile -t t3x-api:staging .
docker build \
  -f apps/web/Dockerfile \
  --build-arg T3X_API_URL=http://t3x-api:8000 \
  --build-arg NEXT_PUBLIC_AUTH_DISABLED=false \
  -t t3x-webui:staging .
```

Use `/health` only as process liveness. A deployment platform must use `/ready`
as its traffic gate because readiness verifies the database connection. Complete
the migration job before allowing runtime replicas to pass readiness.

For a persistent hosted API, `DATABASE_URL` must be a direct PostgreSQL
connection or a session-mode pooler connection. Do not use a transaction-mode
pooler on port `6543`; it cannot preserve the session behavior required by
prepared statements and `LISTEN/NOTIFY`.

The root `vercel.json` is a reproducible WebUI build input. Configure the
Vercel project Root Directory to the repository root and keep Preview and
Production environment variables separate. The Web project needs only API and
public browser configuration; database credentials belong with the API.
