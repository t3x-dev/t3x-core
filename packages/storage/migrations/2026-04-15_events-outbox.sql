-- Migration: Create events outbox table for cross-process realtime sync.
-- See: docs/superpowers/plans/2026-04-15-realtime-sync-mcp.md

BEGIN;

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT NOT NULL,
  conversation_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_project_id_idx ON events (project_id, id);
CREATE INDEX IF NOT EXISTS events_conversation_id_idx ON events (conversation_id, id)
  WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at);

COMMIT;
