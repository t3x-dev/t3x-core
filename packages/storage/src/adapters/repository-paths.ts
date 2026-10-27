import { inspectRepositoryName, RESERVED_REPOSITORY_NAMES } from '@t3x-dev/application';
import type postgres from 'postgres';

/** Schema v76/v77. No project names/ownership are rewritten. Ambiguous legacy
 * candidates are reserved without an owner until an operator resolves them.
 * Keep the hard SQL guards aligned with application/repository-names tests.
 */
export const REPOSITORY_PATHS_SQL = `
  CREATE TABLE IF NOT EXISTS repository_paths (
    namespace_id TEXT NOT NULL REFERENCES namespaces(namespace_id) ON DELETE RESTRICT,
    name_key TEXT NOT NULL CHECK (name_key = lower(name_key COLLATE "C")),
    project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
    resolvable BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (namespace_id, name_key)
  );
  -- Early local v76 bootstraps predate the explicit resolvability flag.
  ALTER TABLE repository_paths ADD COLUMN IF NOT EXISTS resolvable BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE INDEX IF NOT EXISTS repository_paths_project ON repository_paths(project_id);

  -- v77: release every address of a permanently deleted project atomically.
  -- Null-owner legacy records are deliberately untouched: their origin is unknown.
  DO $$
  DECLARE old_constraint TEXT;
  BEGIN
    FOR old_constraint IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'repository_paths'::regclass AND contype = 'f'
        AND confrelid = 'projects'::regclass
        AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = 'repository_paths'::regclass AND attname = 'project_id')]
    LOOP
      EXECUTE format('ALTER TABLE repository_paths DROP CONSTRAINT %I', old_constraint);
    END LOOP;
    ALTER TABLE repository_paths ADD CONSTRAINT repository_paths_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
  END $$;

  CREATE OR REPLACE FUNCTION enforce_repository_path() RETURNS trigger AS $$
  DECLARE claimed_id TEXT;
  BEGIN
    -- ID-only legacy/import flows remain possible; public creation always
    -- supplies an authorized namespace. Existing anomalies remain readable.
    IF NEW.namespace_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.name = OLD.name AND NEW.namespace_id IS NOT DISTINCT FROM OLD.namespace_id
        AND NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
        THEN RETURN NEW;
      END IF;
    END IF;
    IF NEW.name COLLATE "C" !~ '^[A-Za-z0-9._-]{1,100}$'
      OR NEW.name COLLATE "C" !~ '[A-Za-z0-9]' THEN
      RAISE EXCEPTION 'Repository name must be a confirmed ASCII name of 1-100 characters'
        USING ERRCODE = '23514', CONSTRAINT = 'repository_name_valid';
    END IF;
    IF lower(NEW.name COLLATE "C") IN (${RESERVED_REPOSITORY_NAMES.map((name) => `'${name.replaceAll("'", "''")}'`).join(', ')}) THEN
      RAISE EXCEPTION 'Repository name is reserved'
        USING ERRCODE = '23514', CONSTRAINT = 'repository_name_reserved';
    END IF;
    -- Unique index arbitrates concurrent creates, renames, transfers/restores.
    -- ON CONFLICT locks the winning row; a conflict rolls the entire statement
    -- (and its transaction) back, including all project and alias changes.
    INSERT INTO repository_paths(namespace_id, name_key, project_id, resolvable)
      VALUES (NEW.namespace_id, lower(NEW.name COLLATE "C"), NEW.project_id, TRUE)
      ON CONFLICT (namespace_id, name_key) DO UPDATE
        SET project_id = repository_paths.project_id,
          resolvable = CASE WHEN repository_paths.project_id = NEW.project_id THEN TRUE ELSE repository_paths.resolvable END
      RETURNING project_id INTO claimed_id;
    IF claimed_id IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Repository name is already occupied in this namespace'
        USING ERRCODE = '23505', CONSTRAINT = 'repository_path_occupied';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS projects_repository_path ON projects;
  CREATE TRIGGER projects_repository_path AFTER INSERT OR UPDATE OF name, namespace_id, deleted_at
    ON projects FOR EACH ROW EXECUTE FUNCTION enforce_repository_path();
`;

/** Run under the schema migration transaction. Lock writers before the inventory
 * so a concurrent v75 insert cannot slip between backfill and trigger creation. */
export async function ensureRepositoryPaths(sql: postgres.TransactionSql) {
  await sql.unsafe('LOCK TABLE projects IN SHARE ROW EXCLUSIVE MODE');
  await sql.unsafe(REPOSITORY_PATHS_SQL);
  const rows = await sql.unsafe<{ project_id: string; namespace_id: string; name: string }[]>(
    'SELECT project_id, namespace_id, name FROM projects WHERE namespace_id IS NOT NULL'
  );
  const candidates = new Map<
    string,
    { namespaceId: string; nameKey: string; projectId: string | null; resolvable: boolean }
  >();
  for (const row of rows) {
    const naming = inspectRepositoryName(row.name);
    // Unusable candidates cannot collide with a valid new path. In particular,
    // never put arbitrarily long legacy text into the btree key.
    if (!naming.valid) continue;
    const nameKey = naming.name.toLowerCase();
    const key = JSON.stringify([row.namespace_id, nameKey]);
    const prior = candidates.get(key);
    candidates.set(key, {
      namespaceId: row.namespace_id,
      nameKey,
      projectId: !prior ? row.project_id : null,
      resolvable: !prior && naming.valid && !naming.changed,
    });
  }
  for (const claim of candidates.values()) {
    await sql.unsafe(
      `INSERT INTO repository_paths(namespace_id, name_key, project_id, resolvable)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (namespace_id, name_key) DO UPDATE
          SET resolvable = repository_paths.resolvable OR EXCLUDED.resolvable
          WHERE repository_paths.project_id = EXCLUDED.project_id`,
      [claim.namespaceId, claim.nameKey, claim.projectId, claim.resolvable]
    );
  }
}
