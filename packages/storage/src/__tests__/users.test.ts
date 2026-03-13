/**
 * Users & Accounts Storage Tests
 *
 * Tests updateUser query using PGLite.
 *
 * @see packages/storage/src/queries/users.ts
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createUser, findUserById, updateUser } from '../queries/users';
import * as schema from '../schema';

/**
 * SQL to create users & accounts tables (V4 schema).
 */
const CREATE_USERS_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT,
  avatar_url TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);
`;

describe('Users Storage', () => {
  let db: AnyDB;
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema }) as unknown as AnyDB;
    await client.exec(CREATE_USERS_TABLES_SQL);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('updateUser', () => {
    it('updates name only', async () => {
      const user = await createUser(db, { name: 'Original', email: 'name@test.com' });

      const updated = await updateUser(db, user.id, { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.avatar_url).toBeNull();
    });

    it('updates avatar_url only', async () => {
      const user = await createUser(db, { name: 'Avatar Test', email: 'avatar@test.com' });

      const updated = await updateUser(db, user.id, { avatar_url: 'https://example.com/avatar.png' });

      expect(updated).not.toBeNull();
      expect(updated!.avatar_url).toBe('https://example.com/avatar.png');
      expect(updated!.name).toBe('Avatar Test');
    });

    it('updates both name and avatar_url', async () => {
      const user = await createUser(db, { name: 'Both Test', email: 'both@test.com' });

      const updated = await updateUser(db, user.id, {
        name: 'New Name',
        avatar_url: 'https://example.com/new.png',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.avatar_url).toBe('https://example.com/new.png');
    });

    it('returns current user when no fields provided', async () => {
      const user = await createUser(db, { name: 'No Change', email: 'nochange@test.com' });

      const result = await updateUser(db, user.id, {});

      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
      expect(result!.name).toBe('No Change');
    });

    it('returns null for non-existent user', async () => {
      const result = await updateUser(db, 'user_nonexistent', { name: 'Ghost' });

      expect(result).toBeNull();
    });

    it('does not modify email', async () => {
      const user = await createUser(db, { name: 'Email Test', email: 'keep@test.com' });

      const updated = await updateUser(db, user.id, { name: 'Changed' });

      expect(updated!.email).toBe('keep@test.com');
    });

    it('persists changes to database', async () => {
      const user = await createUser(db, { name: 'Persist Test', email: 'persist@test.com' });

      await updateUser(db, user.id, { name: 'Persisted' });

      const fetched = await findUserById(db, user.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Persisted');
    });
  });
});
