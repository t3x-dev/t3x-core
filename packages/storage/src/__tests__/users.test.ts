/**
 * Users & Accounts Storage Tests
 *
 * Tests updateUser query.
 *
 * @see packages/storage/src/queries/users.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  createAccount,
  createLocalUser,
  createUser,
  findAccountsByUser,
  findOrCreateUser,
  findUserById,
  findUserByUsername,
  unlinkAccount,
  updateUser,
} from '../queries/users';
import { createTestDB } from './setup';

describe('Users Storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });

  afterAll(async () => {
    await cleanup();
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

      const updated = await updateUser(db, user.id, {
        avatar_url: 'https://example.com/avatar.png',
      });

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

  describe('identity integrity', () => {
    it('stores and looks up canonical usernames and emails', async () => {
      const local = await createLocalUser(db, {
        username: '  Test-A21  ',
        passwordHash: 'hash',
      });
      const oauth = await createUser(db, {
        email: '  Person.A21@Example.COM  ',
        email_verified: true,
      });

      expect(local.username).toBe('test-a21');
      expect((await findUserByUsername(db, 'TEST-A21'))?.id).toBe(local.id);
      expect(oauth.email).toBe('person.a21@example.com');
    });

    it('maps concurrent verified OAuth identities to one stable user', async () => {
      const [github, google] = await Promise.all([
        findOrCreateUser(db, {
          provider: 'github',
          provider_id: 'task21-concurrent-github',
          email: 'Concurrent.A21@Example.com',
          email_verified: true,
        }),
        findOrCreateUser(db, {
          provider: 'google',
          provider_id: 'task21-concurrent-google',
          email: 'concurrent.a21@example.COM',
          email_verified: true,
        }),
      ]);

      expect(github.id).toBe(google.id);
      expect(await findAccountsByUser(db, github.id)).toHaveLength(2);
    });

    it('does not let an unverified provider replace a verified email', async () => {
      const original = await findOrCreateUser(db, {
        provider: 'github',
        provider_id: 'task21-protected-email',
        email: 'protected.a21@example.com',
        email_verified: true,
      });

      const signedIn = await findOrCreateUser(db, {
        provider: 'github',
        provider_id: 'task21-protected-email',
        email: 'attacker@example.com',
        email_verified: false,
      });

      expect(signedIn.id).toBe(original.id);
      expect(signedIn.email).toBe('protected.a21@example.com');
      expect(signedIn.email_verified).toBe(true);
    });

    it('allows unlinking an OAuth account only when another sign-in method remains', async () => {
      const user = await createUser(db, {
        email: 'unlink.a21@example.com',
        email_verified: true,
      });
      const github = await createAccount(db, {
        user_id: user.id,
        provider: 'github',
        provider_account_id: 'task21-unlink-github',
      });
      const google = await createAccount(db, {
        user_id: user.id,
        provider: 'google',
        provider_account_id: 'task21-unlink-google',
      });

      await expect(unlinkAccount(db, user.id, github.id)).resolves.toBe('unlinked');
      await expect(unlinkAccount(db, user.id, google.id)).resolves.toBe('last_sign_in_method');
    });
  });
});
