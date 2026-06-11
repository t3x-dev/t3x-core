# Deployment Guide

This guide describes the supported alpha deployment paths for the public T3X
repository. It does not describe the private SaaS deployment.

## Supported Alpha Paths

| Path | Command | Intended use |
|---|---|---|
| Source development | `pnpm dev:api` and `pnpm dev:webui` | Contributor and implementation work |
| Local alpha package | `npx -p @t3x-dev/local t3x-local start` | Packaged local evaluation from public npm |
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

## Environment

At least one provider key is required for live extraction or chat:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_AI_STUDIO_KEY`

Common deployment variables:

- `DATABASE_URL` for Postgres-backed API and WebUI storage.
- `NEXT_PUBLIC_API_URL` for the browser-facing API URL.
- `AUTH_DISABLED=false` to keep auth enabled explicitly.
- `WEBUI_PORT` and `POSTGRES_PORT` to override Docker Compose host ports.

Do not commit provider keys, database passwords, or generated local config.

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
