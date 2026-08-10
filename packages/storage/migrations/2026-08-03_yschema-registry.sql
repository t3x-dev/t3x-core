CREATE TABLE IF NOT EXISTS yschema_artifacts (
  artifact_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL,
  kind TEXT NOT NULL,
  owner_project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  visibility TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_yschema_artifacts_family_kind_visibility
  ON yschema_artifacts(family, kind, visibility);
CREATE INDEX IF NOT EXISTS idx_yschema_artifacts_owner
  ON yschema_artifacts(owner_project_id);

CREATE TABLE IF NOT EXISTS yschema_artifact_versions (
  artifact_version_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES yschema_artifacts(artifact_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  manifest_json JSONB NOT NULL,
  artifact_hash TEXT NOT NULL,
  path_count INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(artifact_id, version),
  UNIQUE(artifact_id, artifact_hash)
);
CREATE INDEX IF NOT EXISTS idx_yschema_artifact_versions_status
  ON yschema_artifact_versions(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_yschema_artifact_active_version
  ON yschema_artifact_versions(artifact_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS yschema_artifact_capabilities (
  artifact_version_id TEXT NOT NULL
    REFERENCES yschema_artifact_versions(artifact_version_id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  capability TEXT NOT NULL,
  UNIQUE(artifact_version_id, direction, capability)
);
CREATE INDEX IF NOT EXISTS idx_yschema_artifact_capabilities_lookup
  ON yschema_artifact_capabilities(direction, capability);

CREATE TABLE IF NOT EXISTS yschema_composition_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  composition_id TEXT NOT NULL,
  composition_revision INTEGER NOT NULL,
  composition_hash TEXT NOT NULL,
  compiled_schema_hash TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  manifest_json JSONB NOT NULL,
  schema_json JSONB NOT NULL,
  render_plan_json JSONB NOT NULL,
  origins_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, composition_id, composition_revision),
  UNIQUE(project_id, composition_hash)
);
CREATE INDEX IF NOT EXISTS idx_yschema_composition_schema_hash
  ON yschema_composition_snapshots(project_id, compiled_schema_hash);
