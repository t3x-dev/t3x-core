/**
 * Database Connection Manager
 *
 * Provides SQLite database initialization and access.
 * Used by storage CRUD modules.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

let db: Database.Database | null = null;
let activeDbPath: string | null = null;

/**
 * Open or reuse SQLite database connection
 *
 * @param projectRoot - Repository root directory (will create .contextflow/ here)
 * @returns Path to the database file
 */
export function openDB(projectRoot: string): string {
  const cfDir = path.join(projectRoot, '.contextflow');
  const dbPath = path.join(cfDir, 'project.db');

  // Reuse existing connection if same path
  if (db && activeDbPath === dbPath) {
    return dbPath;
  }

  // Ensure .contextflow directory exists
  if (!existsSync(cfDir)) {
    mkdirSync(cfDir, { recursive: true });
  }

  // Close existing connection if different path
  if (db) {
    db.close();
    db = null;
    activeDbPath = null;
  }

  // Open new connection
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('synchronous = NORMAL');

  // Apply schema
  const schema = readSchemaText();
  if (schema.trim()) {
    instance.exec(schema);
  }

  db = instance;
  activeDbPath = dbPath;
  return dbPath;
}

/**
 * Get the active database instance
 *
 * @throws Error if database not initialized
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Please call openDB() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
    activeDbPath = null;
  }
}

/**
 * Get the current database path (if open)
 */
export function getDbPath(): string | null {
  return activeDbPath;
}

/**
 * Read schema.sql from package
 */
function readSchemaText(): string {
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
