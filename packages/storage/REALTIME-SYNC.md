# Realtime Sync Architecture

Cross-process realtime synchronization for T3X: any process writing through
`@t3x-dev/storage` propagates changes to WebSocket clients in real time —
without that process knowing the WebSocket layer exists.

## Why

Before this design, only API-server writes broadcast to WebUI. MCP, CLI, or
any future worker writing directly through the storage layer was invisible
to live clients — users had to refresh.

## How

```
                ┌────────────────────┐
  any writer    │   PostgreSQL       │   trigger fires:
  (API, MCP, ──▶│ ┌────────────────┐ │   AFTER INSERT/UPDATE on
   CLI, …)      │ │ commits        │ │   commits/drafts/yops_log/
                │ │ drafts         │ │   conversations
                │ │ yops_log       │ │            │
                │ │ conversations  │ │            ▼
                │ └────────────────┘ │   t3x_emit_event(...)
                │                    │   ─→ INSERT INTO events
                │ ┌────────────────┐ │   ─→ pg_notify('t3x_events', id)
                │ │ events         │ │            │
                │ │ (outbox table) │ │            │
                │ └────────────────┘ │            │
                └─────────┬──────────┘            │
                          │                       │
                          ▼                       │
                ┌─────────────────────┐           │
                │ apps/api process    │ ◀─────────┘
                │ ┌─────────────────┐ │  LISTEN t3x_events
                │ │ realtime-       │ │  → SELECT event row
                │ │   listener.ts   │ │  → eventBus.broadcast()
                │ └────────┬────────┘ │
                │          ▼          │
                │ ┌─────────────────┐ │
                │ │ eventBus +      │ │
                │ │ room-manager.ts │ │
                │ └────────┬────────┘ │
                │          ▼          │
                │ ┌─────────────────┐ │
                │ │ ws.ts           │ │  WebSocket fanout
                │ └────────┬────────┘ │
                └──────────┼──────────┘
                           │
                           ▼
                       WebUI clients
```

## Two emit paths (one outbox)

All events end up in the `events` table; the difference is who writes them:

| Path | Used for | Mechanism |
|------|----------|-----------|
| **Database trigger** | Simple CRUD events (commit.created, draft.changed, yops.applied, conversation.renamed) | `AFTER INSERT/UPDATE` triggers call `t3x_emit_event(...)`. Zero application code per writer. |
| **`recordEvent()` helper** | Complex business events (extraction.started, extraction.done) carrying semantic payload that triggers can't infer | API extraction-pipeline + MCP extract tool call `recordEvent(db, { type, projectId, conversationId, payload })`. |

Both paths INSERT into the same `events` table and trigger `pg_notify('t3x_events', <id>)`.

## Event type whitelist

The full set of allowed event types is defined in `packages/storage/src/events.ts`
as the `ALLOWED_EVENT_TYPES` `as const` tuple. As of this writing:

- `commit.created`
- `draft.changed`
- `yops.applied`
- `conversation.renamed`
- `extraction.started`
- `extraction.done`

Adding a new event type requires:
1. Updating `ALLOWED_EVENT_TYPES`
2. Either: updating a database trigger (for simple events) OR adding a `recordEvent()` call site (for complex events)
3. PR review

Note: `presence.join` / `presence.leave` are NOT in this whitelist. Presence
is in-process WebSocket state; replaying it on reconnect would be incorrect.

## Event naming rules

Format: `<resource>.<verb-past-tense-or-progressive>`

- `commit.created`, `extraction.started`, `extraction.done`, `draft.changed` — OK
- `commit.event` — verb missing
- `extraction.state_changed` — action hidden in payload
- `thing.updated_or_created` — one event = one action

One event = one indivisible action. Started, done, failed are three separate
events — do not collapse.

## What does NOT belong in the events table

- High-frequency progress (e.g., extraction "10%, 20%, 30%") — use streaming
  responses instead
- Heartbeats / pings — handled by the WebSocket layer
- Single-atom operations — yops are emitted at batch level
- Pure internal state (cache, metrics, logs) — use `metrics_events` table
- Read operations — SELECT does not produce events

## Client reconnect: replay

WebSocket clients can pass `?last_event_id=N` on connect. The server queries
the events table for rows with `id > N` matching the client's `project_id`
(and optional `conversation_id`) and streams them BEFORE the live subscription
starts. This makes realtime delivery resilient to disconnects up to the retention
window.

## Retention

The events table retains 7 days of history. A cleanup job runs hourly
(`cleanupOldEvents` in `packages/storage/src/jobs/cleanup-events.ts`)
gated on `DATABASE_URL`. Clients that disconnect for longer than 7 days
get an empty replay — they should treat that as "force a full refresh."

## Where the code lives

| Concern | File |
|---------|------|
| Events table schema | `packages/storage/src/schema-events.ts` |
| Event triggers (DDL) | `packages/storage/src/adapters/postgres.ts` (inline) + `packages/storage/migrations/2026-04-15_event-triggers.sql` |
| `recordEvent()` helper + whitelist | `packages/storage/src/events.ts` |
| Cleanup job | `packages/storage/src/jobs/cleanup-events.ts` |
| LISTEN relay | `packages/api/src/lib/realtime-listener.ts` |
| WebSocket replay | `packages/api/src/lib/event-replay.ts` |
| WebSocket entry point | `packages/api/src/routes/ws.ts` |
| MCP extraction event emit | `packages/mcp/src/tools/core/extract.ts` |
| Apps/api wiring | `apps/api/src/index.ts` |

## Operational notes

- **Multi-instance:** Each apps/api process LISTENs independently. Each broadcasts to its own connected WebSocket clients. Horizontal scaling works without coordination.
- **Best-effort cleanup:** If the cleanup job fails (DB down, etc.), the events table grows. Eventually queries get slower, never break. Monitor the `pinoLogger.warn({ err }, 'events cleanup failed')` log line.
- **Best-effort MCP emit:** MCP wraps `recordEvent` in try/catch — extraction succeeds even if the events table is wedged. API does NOT (extraction depends on DB anyway). This asymmetry is intentional.
- **Self-hosted without DATABASE_URL:** If running embedded Postgres without `DATABASE_URL`, both the LISTEN relay and cleanup job are skipped. The events table still receives writes via triggers, but no one is listening or pruning. Acceptable for local dev (ephemeral); set `DATABASE_URL` for self-hosted production.
