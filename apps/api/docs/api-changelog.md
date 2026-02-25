# T3X API Changelog

Version strategy: The API uses semantic versioning. Breaking changes bump the major version. All endpoints are under `/api/v1/`.

## v1.8.0 — Platform Infrastructure (#8)

### Added
- `GET /ready` — Readiness probe with database health check
- `POST /v1/webhooks` — Create webhook subscription
- `GET /v1/webhooks` — List webhooks
- `GET /v1/webhooks/:id` — Get webhook details
- `PATCH /v1/webhooks/:id` — Update webhook
- `DELETE /v1/webhooks/:id` — Delete webhook
- `POST /v1/webhooks/:id/test` — Send test event
- `POST /v1/import/cfpack` — Import cfpack archive as new project
- Structured logging (Pino) with request ID tracing
- Webhook event dispatch on commit, merge, leaf, and run events

### Changed
- `runs.ts` → `runs.openapi.ts` — Full OpenAPI schema with Zod validation
- `export.ts` → `export.openapi.ts` — Full OpenAPI schema with Zod validation

## v1.7.0 — Export & UX Polish (#6, #7)

### Added
- `GET /v1/export/cfpack` — Export project as .cfpack JSON archive
- `GET /v1/export/ledger` — Export project as JSONL ledger
- Template gallery CRUD endpoints

## v1.6.0 — Auth Middleware (#3)

### Added
- API key authentication (`X-API-Key` header)
- Share token system for read-only access
- Rate limiting (L1: global, L2: per-key)

## v1.5.0 — Runner & Evaluation (#5)

### Added
- Run management endpoints (create, list, get, delete, update)
- A/B test comparison with statistical analysis
- Configuration stats aggregation
