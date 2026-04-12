-- Migration: yops_log source field is now required with per-op source provenance.
-- Strategy: FRESH START — delete all existing yops_log entries (pre-production).
-- This migration is part of the 4-layer CQRS refactor (spec: docs/superpowers/specs/2026-04-12-extraction-persistence-gold-layer-design.md).

BEGIN;

-- Wipe existing yops logs (fresh start per spec)
DELETE FROM yops_log;

-- Drop tree JSON caches from drafts + conversations if present (guarded for both scenarios)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'drafts' AND column_name = 'content'
  ) THEN
    ALTER TABLE drafts DROP COLUMN content;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'cached_tree'
  ) THEN
    ALTER TABLE conversations DROP COLUMN cached_tree;
  END IF;
END $$;

-- Enforce source on every op: yops_log.yops must be a JSON array where every
-- element has source.type in ('llm','human').
ALTER TABLE yops_log
  ADD CONSTRAINT yops_log_source_required CHECK (
    jsonb_typeof(yops) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(yops) op
      WHERE NOT (
        op ? 'source'
        AND op->'source'->>'type' IN ('llm','human')
      )
    )
  );

COMMIT;
