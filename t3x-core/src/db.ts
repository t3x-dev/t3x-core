/**
 * Database Connection Manager
 *
 * Provides SQLite (default) and Postgres (via DATABASE_URL) initialization and access.
 * Used by storage CRUD modules and API routes.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

export type DbDialect = 'sqlite' | 'postgres';

export interface RunResult {
  changes: number;
}

export interface PreparedStatement {
  run(...params: unknown[]): Promise<RunResult>;
  get<T = unknown>(...params: unknown[]): Promise<T | undefined>;
  all<T = unknown>(...params: unknown[]): Promise<T[]>;
}

export interface Db {
  dialect: DbDialect;
  prepare(sql: string): PreparedStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

let db: Db | null = null;
let activeDbId: string | null = null;

/**
 * Open or reuse database connection.
 *
 * Default: SQLite at `<projectRoot>/.t3x/project.db`
 * If `DATABASE_URL` starts with `postgresql://` or `postgres://`, use Postgres instead.
 *
 * @param projectRoot - Repository root directory (will create .t3x/ here)
 * @returns A display string for logs (SQLite path or redacted Postgres URL)
 */
export async function openDB(projectRoot: string): Promise<string> {
  const cfDir = path.join(projectRoot, '.t3x');
  const sqlitePath = path.join(cfDir, 'project.db');

  // Ensure .t3x directory exists (even when using Postgres)
  if (!existsSync(cfDir)) {
    mkdirSync(cfDir, { recursive: true });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const wantsPostgres = Boolean(databaseUrl && isPostgresUrl(databaseUrl));

  if (wantsPostgres) {
    const dbId = databaseUrl!;
    if (db && activeDbId === dbId) {
      return redactDatabaseUrl(dbId);
    }

    if (db) {
      await db.close();
      db = null;
      activeDbId = null;
    }

    const pgDb = await createPostgresDb(dbId);
    await applySqlScript(pgDb, readPostgresSchemaText());

    db = pgDb;
    activeDbId = dbId;
    return redactDatabaseUrl(dbId);
  }

  // Reuse existing connection if same path
  if (db && activeDbId === sqlitePath) {
    return sqlitePath;
  }

  // Close existing connection if different path/dialect
  if (db) {
    await db.close();
    db = null;
    activeDbId = null;
  }

  // Open new connection
  const instance = new Database(sqlitePath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('synchronous = NORMAL');

  // Apply schema
  const schema = readSqliteSchemaText();
  if (schema.trim()) {
    instance.exec(schema);
  }

  db = createSqliteDb(instance);
  activeDbId = sqlitePath;
  return sqlitePath;
}

/**
 * Get the active database instance
 *
 * @throws Error if database not initialized
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Please call openDB() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export async function closeDB(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    activeDbId = null;
  }
}

/**
 * Get the current database identifier (if open)
 *
 * SQLite: absolute file path
 * Postgres: redacted DATABASE_URL
 */
export function getDbPath(): string | null {
  if (!activeDbId) return null;
  if (db?.dialect === 'postgres') return redactDatabaseUrl(activeDbId);
  return activeDbId;
}

/**
 * Read schema.sql (SQLite) from package
 */
function readSqliteSchemaText(): string {
  // Try same directory as this module (dist/)
  const localPath = path.join(__dirname, 'schema.sql');
  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  // Try src/ directory (development)
  const srcPath = path.join(__dirname, '..', 'src', 'schema.sql');
  if (existsSync(srcPath)) {
    return readFileSync(srcPath, 'utf-8');
  }

  throw new Error('schema.sql not found in Core package');
}

/**
 * Read schema.pg.sql (Postgres) from package
 */
function readPostgresSchemaText(): string {
  const localPath = path.join(__dirname, 'schema.pg.sql');
  if (existsSync(localPath)) {
    return readFileSync(localPath, 'utf-8');
  }

  const srcPath = path.join(__dirname, '..', 'src', 'schema.pg.sql');
  if (existsSync(srcPath)) {
    return readFileSync(srcPath, 'utf-8');
  }

  throw new Error('schema.pg.sql not found in Core package');
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

function redactDatabaseUrl(url: string): string {
  // postgresql://user:pass@host:port/db?sslmode=...
  //           ^^^^^^^^^
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/u, '://$1:***@');
}

function createSqliteDb(instance: Database.Database): Db {
  return {
    dialect: 'sqlite',
    prepare(sql: string): PreparedStatement {
      const stmt = instance.prepare(sql);
      return {
        async run(...params: unknown[]): Promise<RunResult> {
          const result = stmt.run(...params);
          return { changes: result.changes };
        },
        async get<T = unknown>(...params: unknown[]): Promise<T | undefined> {
          return stmt.get(...params) as T | undefined;
        },
        async all<T = unknown>(...params: unknown[]): Promise<T[]> {
          return stmt.all(...params) as T[];
        },
      };
    },
    async exec(sql: string): Promise<void> {
      instance.exec(sql);
    },
    async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      instance.exec('BEGIN');
      try {
        const result = await fn(this);
        instance.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          instance.exec('ROLLBACK');
        } catch {
          // ignore rollback errors
        }
        throw err;
      }
    },
    async close(): Promise<void> {
      instance.close();
    },
  };
}

async function createPostgresDb(databaseUrl: string): Promise<Db> {
  const pool = new Pool({ connectionString: databaseUrl });

  // Fail fast if we can't reach the DB
  await pool.query('SELECT 1');

  const makeDbFromClient = (client: Pool | PoolClient): Db => ({
    dialect: 'postgres',
    prepare(sql: string): PreparedStatement {
      const translated = sqliteSqlToPostgres(sql);
      return {
        async run(...params: unknown[]): Promise<RunResult> {
          const res = await client.query(translated, params);
          return { changes: res.rowCount ?? 0 };
        },
        async get<T = unknown>(...params: unknown[]): Promise<T | undefined> {
          const res = await client.query(translated, params);
          return res.rows[0] as T | undefined;
        },
        async all<T = unknown>(...params: unknown[]): Promise<T[]> {
          const res = await client.query(translated, params);
          return res.rows as T[];
        },
      };
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
    async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      if ('connect' in client) {
        const txClient = await (client as Pool).connect();
        try {
          await txClient.query('BEGIN');
          const txDb = makeDbFromClient(txClient);
          const result = await fn(txDb);
          await txClient.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await txClient.query('ROLLBACK');
          } catch {
            // ignore rollback errors
          }
          throw err;
        } finally {
          txClient.release();
        }
      }

      // Already in a transaction client
      return fn(this);
    },
    async close(): Promise<void> {
      // Only the root DB owns the pool and is allowed to close it.
      if ('end' in client) {
        await (client as Pool).end();
      }
    },
  });

  return makeDbFromClient(pool);
}

function sqliteSqlToPostgres(sql: string): string {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let out = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }

    if (ch === '?' && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
      continue;
    }

    out += ch;
  }

  return out;
}

async function applySqlScript(targetDb: Db, sql: string): Promise<void> {
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    await targetDb.exec(stmt);
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}
