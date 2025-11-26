import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonText } from './canon';
import { sha256 } from './hash';
import { logger } from '../runtime/logger';

export type TurnRole = 'user' | 'assistant' | 'tool';
export type DraftKind = 'summary' | 'plan' | 'note';
export type DraftState = 'open' | 'ready' | 'committed';

export interface TurnRecord {
  id: number;
  project: string;
  ts: string;
  role: TurnRole;
  text: string;
  canon: string;
  hash: string;
  tags: string | null;
}

export interface DraftRecord {
  id: number;
  project: string;
  ts: string;
  kind: DraftKind;
  content: string;
  state: DraftState;
}

export interface CommitRecord {
  id: number;
  project: string;
  ts: string;
  message: string;
  evidence: string;
  parent_commit_id: number | null;
  hash: string;
  signature: string | null;
}

export interface ContextflowStatus {
  generation: number;
  counts: {
    turns: number;
    drafts: number;
    commits: number;
    events: number;
  };
}

export interface CreateTurnInput {
  project: string;
  role: TurnRole;
  text: string;
  tags?: string[];
  at?: string;
}

export interface ListTurnsOptions {
  project?: string;
  limit?: number;
  role?: TurnRole;
}

export interface DraftPatch {
  content?: string;
  state?: DraftState;
}

let db: Database.Database | null = null;
let activeDbPath: string | null = null;

export function openDB(projectRoot: string): string {
  const cfDir = path.join(projectRoot, '.contextflow');
  const dbPath = path.join(cfDir, 'project.db');

  if (db && activeDbPath === dbPath) {
    return dbPath;
  }

  if (!existsSync(cfDir)) {
    mkdirSync(cfDir, { recursive: true });
  }

  if (db) {
    db.close();
    db = null;
    activeDbPath = null;
  }

  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('synchronous = NORMAL');

  const schema = readSchemaText();
  if (schema.trim()) {
    instance.exec(schema);
  }

  db = instance;
  activeDbPath = dbPath;
  logger.trace('sql', `SQLite ready at ${dbPath}`);
  return dbPath;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. 请先调用 openDB()。');
  }
  return db;
}

export function createTurn(input: CreateTurnInput, actor = defaultActor()): TurnRecord {
  return runInTransaction((instance) => {
    const ts = input.at ?? new Date().toISOString();
    const canon = canonText(input.text);
    const hash = sha256({ project: input.project, role: input.role, canon, ts });
    const tags = input.tags?.join(',') ?? null;

    instance
      .prepare(
        `INSERT INTO turns(project,ts,role,text,canon,hash,tags)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(input.project, ts, input.role, input.text, canon, hash, tags);

    const turn = instance.prepare(`SELECT * FROM turns WHERE hash=?`).get(hash) as TurnRecord;
    emitEvent(instance, actor, 'turn:add', {
      project: input.project,
      role: input.role,
      turnId: turn.id,
    });
    return turn;
  });
}

export function listTurns(options: ListTurnsOptions = {}): TurnRecord[] {
  const instance = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.project) {
    clauses.push('project = ?');
    params.push(options.project);
  }
  if (options.role) {
    clauses.push('role = ?');
    params.push(options.role);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = options.limit ?? 50;

  const rows = instance
    .prepare(`SELECT * FROM turns ${whereClause} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit) as TurnRecord[];

  return rows;
}

export function openDraft(
  project: string,
  kind: DraftKind = 'summary',
  from?: string,
  actor = defaultActor(),
): DraftRecord {
  return runInTransaction((instance) => {
    const ts = new Date().toISOString();
    const content = `# ${kind}\n\n`;

    instance
      .prepare(`INSERT INTO drafts(project,ts,kind,content,state) VALUES (?,?,?,?, 'open')`)
      .run(project, ts, kind, content);

    const draft = instance.prepare(`SELECT * FROM drafts ORDER BY id DESC LIMIT 1`).get() as DraftRecord;
    emitEvent(instance, actor, 'draft:open', { project, kind, draftId: draft.id, from });
    return draft;
  });
}

export function updateDraft(draftId: number, patch: DraftPatch, actor = defaultActor()): DraftRecord {
  if (!patch.content && !patch.state) {
    throw new Error('updateDraft 需要 content 或 state 字段。');
  }

  return runInTransaction((instance) => {
    const existing = instance.prepare(`SELECT * FROM drafts WHERE id=?`).get(draftId) as DraftRecord | undefined;
    if (!existing) {
      throw new Error(`draft ${draftId} not found`);
    }

    const content = patch.content ?? existing.content;
    const state = patch.state ?? existing.state;

    instance.prepare(`UPDATE drafts SET content=?, state=? WHERE id=?`).run(content, state, draftId);
    const updated = instance.prepare(`SELECT * FROM drafts WHERE id=?`).get(draftId) as DraftRecord;
    emitEvent(instance, actor, 'draft:update', {
      project: updated.project,
      draftId,
      state: updated.state,
    });
    return updated;
  });
}

export function commitDraft(
  draftId: number,
  message?: string,
  actor = defaultActor(),
): CommitRecord {
  return runInTransaction((instance) => {
    const draft = instance.prepare(`SELECT * FROM drafts WHERE id=?`).get(draftId) as DraftRecord | undefined;
    if (!draft) {
      throw new Error(`draft ${draftId} not found`);
    }

    const ts = new Date().toISOString();
    const payload = message ?? draft.content;
    const evidence: unknown[] = [];
    const hash = sha256({ project: draft.project, ts, payload, evidence });

    instance
      .prepare(
        `INSERT INTO commits(project,ts,message,evidence,parent_commit_id,hash)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(draft.project, ts, payload, JSON.stringify(evidence), null, hash);

    instance.prepare(`UPDATE drafts SET state='committed' WHERE id=?`).run(draftId);
    const commit = instance.prepare(`SELECT * FROM commits WHERE hash=?`).get(hash) as CommitRecord;
    emitEvent(instance, actor, 'commit:create', {
      project: draft.project,
      draftId,
      commitId: commit.id,
    });
    return commit;
  });
}

export function status(): ContextflowStatus {
  const instance = getDb();
  const generationRow = instance
    .prepare(`SELECT value FROM meta WHERE key='generation'`)
    .get() as { value?: string } | undefined;

  const value = generationRow?.value ? Number(generationRow.value) : 0;

  const counts = {
    turns: Number((instance.prepare(`SELECT count(*) as c FROM turns`).get() as { c: number }).c ?? 0),
    drafts: Number((instance.prepare(`SELECT count(*) as c FROM drafts`).get() as { c: number }).c ?? 0),
    commits: Number((instance.prepare(`SELECT count(*) as c FROM commits`).get() as { c: number }).c ?? 0),
    events: Number((instance.prepare(`SELECT count(*) as c FROM events`).get() as { c: number }).c ?? 0),
  };

  return {
    generation: value,
    counts,
  };
}

export async function migrateFromJsonl(_dir: string): Promise<{ imported: number }> {
  return { imported: 0 };
}

function runInTransaction<T>(action: (instance: Database.Database) => T): T {
  const instance = getDb();
  const tx = instance.transaction(() => action(instance));
  return tx();
}

function emitEvent(
  instance: Database.Database,
  actor: string,
  kind: string,
  payload: unknown,
): number {
  const generationRow = instance
    .prepare(`SELECT value FROM meta WHERE key='generation'`)
    .get() as { value?: string } | undefined;
  const nextGeneration = (generationRow?.value ? Number(generationRow.value) : 0) + 1;

  instance
    .prepare(
      `INSERT INTO meta(key,value) VALUES ('generation', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    )
    .run(nextGeneration.toString());

  instance
    .prepare(`INSERT INTO events(ts,actor,kind,payload) VALUES (?,?,?,?)`)
    .run(new Date().toISOString(), actor, kind, JSON.stringify(payload ?? {}));

  logger.trace('events', `[${kind}] g=${nextGeneration}`, payload ?? {});
  return nextGeneration;
}

function defaultActor(): string {
  return `cli:${process.pid}`;
}

function readSchemaText(): string {
  const localPath = path.join(__dirname, 'schema.sql');
  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  const fallback = path.join(process.cwd(), 'src/core/schema.sql');
  if (existsSync(fallback)) {
    return readFileSync(fallback, 'utf-8');
  }

  throw new Error('schema.sql 未找到，无法初始化 SQLite。');
}

// For inspection/debugging
export function dumpDatabaseSnapshot(): void {
  if (!db || !activeDbPath) {
    return;
  }
  const rows = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table'")
    .all() as { sql: string }[];
  writeFileSync(`${activeDbPath}.schema`, rows.map((row) => row.sql).join('\n\n'), 'utf-8');
}
