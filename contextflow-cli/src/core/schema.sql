PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta(key,value) VALUES ('generation','0');

CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  kind    TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  project  TEXT NOT NULL,
  ts       TEXT NOT NULL,
  role     TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  text     TEXT NOT NULL,
  canon    TEXT NOT NULL,
  hash     TEXT NOT NULL UNIQUE,
  tags     TEXT
);
CREATE INDEX IF NOT EXISTS idx_turns_project_ts ON turns(project, ts);
CREATE INDEX IF NOT EXISTS idx_turns_hash ON turns(hash);

CREATE TABLE IF NOT EXISTS drafts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  ts      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  content TEXT NOT NULL,
  state   TEXT NOT NULL CHECK(state IN ('open','ready','committed')) DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS commits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project          TEXT NOT NULL,
  ts               TEXT NOT NULL,
  message          TEXT NOT NULL,
  evidence         TEXT NOT NULL,
  parent_commit_id INTEGER,
  hash             TEXT NOT NULL UNIQUE,
  signature        TEXT,
  FOREIGN KEY(parent_commit_id) REFERENCES commits(id)
);

CREATE TABLE IF NOT EXISTS embeddings (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  target TEXT NOT NULL,
  model  TEXT NOT NULL,
  dim    INTEGER NOT NULL,
  vec    BLOB NOT NULL,
  UNIQUE(project, target, model)
);
