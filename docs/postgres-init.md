# Postgres init scripts (optional)

This folder is mounted (optionally) to `/docker-entrypoint-initdb.d` in the `postgres` container.

Use it for **dev-only** initialization such as:
- creating extra databases (e.g. for `n8n`)
- adding extensions
- bootstrapping minimal tables for experiments

Note: for schema/migrations, prefer running a migration step from the Core container (or a dedicated migrate sidecar) so the same logic can work for both SQLite and Postgres.
