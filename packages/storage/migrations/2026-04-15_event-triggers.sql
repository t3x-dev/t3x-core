-- Migration: Add triggers for cross-process realtime sync.
-- Fires commit.created / draft.changed / yops.applied / conversation.renamed events.
-- See: docs/superpowers/plans/2026-04-15-realtime-sync-mcp.md

BEGIN;

-- Shared emit helper: inserts into events + fires pg_notify.
CREATE OR REPLACE FUNCTION t3x_emit_event(
  p_type TEXT,
  p_project_id TEXT,
  p_conversation_id TEXT,
  p_payload JSONB
) RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO events (type, project_id, conversation_id, payload)
  VALUES (p_type, p_project_id, p_conversation_id, p_payload)
  RETURNING id INTO new_id;
  PERFORM pg_notify('t3x_events', new_id::text);
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- commits INSERT → commit.created
CREATE OR REPLACE FUNCTION t3x_trg_commit_created() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
  PERFORM t3x_emit_event(
    'commit.created',
    NEW.project_id,
    NULL,
    jsonb_build_object('hash', NEW.hash, 'branch', NEW.branch)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commits_event ON commits;
CREATE TRIGGER trg_commits_event
  AFTER INSERT ON commits
  FOR EACH ROW EXECUTE FUNCTION t3x_trg_commit_created();

-- drafts UPDATE → draft.changed (only when updated_at moves)
CREATE OR REPLACE FUNCTION t3x_trg_draft_changed() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    PERFORM t3x_emit_event(
      'draft.changed',
      NEW.project_id,
      NULL,
      jsonb_build_object('draft_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drafts_event ON drafts;
CREATE TRIGGER trg_drafts_event
  AFTER UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION t3x_trg_draft_changed();

-- yops_log INSERT → yops.applied (project_id lives on the row; no join needed)
CREATE OR REPLACE FUNCTION t3x_trg_yops_applied() RETURNS TRIGGER AS $$
BEGIN
  PERFORM t3x_emit_event(
    'yops.applied',
    NEW.project_id,
    NEW.conversation_id,
    jsonb_build_object(
      'yops_log_id', NEW.id,
      'op_count', CASE
        WHEN jsonb_typeof(NEW.yops) = 'array' THEN jsonb_array_length(NEW.yops)
        ELSE 1
      END
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_yops_log_event ON yops_log;
CREATE TRIGGER trg_yops_log_event
  AFTER INSERT ON yops_log
  FOR EACH ROW EXECUTE FUNCTION t3x_trg_yops_applied();

-- conversations.alias UPDATE → conversation.renamed
CREATE OR REPLACE FUNCTION t3x_trg_conversation_renamed() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alias IS DISTINCT FROM OLD.alias THEN
    PERFORM t3x_emit_event(
      'conversation.renamed',
      NEW.project_id,
      NEW.conversation_id,
      jsonb_build_object('alias', NEW.alias, 'previous_alias', OLD.alias)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_alias_event ON conversations;
CREATE TRIGGER trg_conversations_alias_event
  AFTER UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION t3x_trg_conversation_renamed();

COMMIT;
