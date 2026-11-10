// Public numbers are address metadata. They never participate in object identity.
export const REPOSITORY_OBJECT_ADDRESSES_SQL = `
  CREATE TABLE IF NOT EXISTS repository_object_address_counters (
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('commit', 'review', 'validation', 'schema')),
    last_number BIGINT NOT NULL CHECK (last_number > 0),
    PRIMARY KEY (project_id, kind)
  );

  CREATE TABLE IF NOT EXISTS repository_object_addresses (
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('commit', 'review', 'validation', 'schema')),
    object_id TEXT NOT NULL,
    number BIGINT NOT NULL CHECK (number > 0),
    PRIMARY KEY (project_id, kind, object_id),
    UNIQUE (project_id, kind, number)
  );

  CREATE OR REPLACE FUNCTION assign_repository_object_address()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE
    object_kind TEXT := TG_ARGV[0];
    object_key TEXT;
    next_number BIGINT;
  BEGIN
    IF object_kind = 'commit' THEN
      object_key := NEW.digest;
    ELSIF object_kind = 'review' THEN
      object_key := NEW.snapshot_id;
    ELSE
      object_key := NEW.id;
    END IF;

    INSERT INTO repository_object_address_counters (project_id, kind, last_number)
    VALUES (NEW.project_id, object_kind, 1)
    ON CONFLICT (project_id, kind) DO UPDATE
      SET last_number = repository_object_address_counters.last_number + 1
    RETURNING last_number INTO next_number;

    INSERT INTO repository_object_addresses (project_id, kind, object_id, number)
    VALUES (NEW.project_id, object_kind, object_key, next_number)
    ON CONFLICT (project_id, kind, object_id) DO NOTHING;
    RETURN NEW;
  END $$;

  CREATE OR REPLACE TRIGGER assign_commit_address AFTER INSERT ON transition_commits
  FOR EACH ROW EXECUTE FUNCTION assign_repository_object_address('commit');
  CREATE OR REPLACE TRIGGER assign_review_address AFTER INSERT ON transition_review_snapshots
  FOR EACH ROW EXECUTE FUNCTION assign_repository_object_address('review');
  CREATE OR REPLACE TRIGGER assign_validation_address AFTER INSERT ON validation_runs
  FOR EACH ROW EXECUTE FUNCTION assign_repository_object_address('validation');
  CREATE OR REPLACE TRIGGER assign_schema_validation_address AFTER INSERT ON yschema_validation_runs
  FOR EACH ROW EXECUTE FUNCTION assign_repository_object_address('schema');

  WITH historical AS (
    SELECT project_id, 'commit' AS kind, digest AS object_id, created_at FROM transition_commits
    UNION ALL
    SELECT project_id, 'review', snapshot_id, created_at FROM transition_review_snapshots
    UNION ALL
    SELECT project_id, 'validation', id, created_at FROM validation_runs WHERE project_id IS NOT NULL
    UNION ALL
    SELECT project_id, 'schema', id, created_at FROM yschema_validation_runs
  )
  INSERT INTO repository_object_addresses (project_id, kind, object_id, number)
  SELECT historical.project_id, historical.kind, historical.object_id,
    COALESCE(counter.last_number, 0) + ROW_NUMBER() OVER (
      PARTITION BY historical.project_id, historical.kind ORDER BY created_at, historical.object_id
    )
  FROM historical
  LEFT JOIN repository_object_address_counters counter USING (project_id, kind)
  WHERE NOT EXISTS (
    SELECT 1 FROM repository_object_addresses address
    WHERE address.project_id = historical.project_id AND address.kind = historical.kind
      AND address.object_id = historical.object_id
  );

  INSERT INTO repository_object_address_counters (project_id, kind, last_number)
  SELECT project_id, kind, MAX(number) FROM repository_object_addresses GROUP BY project_id, kind
  ON CONFLICT (project_id, kind) DO UPDATE SET last_number =
    GREATEST(repository_object_address_counters.last_number, EXCLUDED.last_number);
`;
