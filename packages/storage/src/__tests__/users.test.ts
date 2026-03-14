/**
 * Users & Accounts Storage Tests
 *
 * Tests updateUser query.
 *
 * @see packages/storage/src/queries/users.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { createUser, findUserById, updateUser } from '../queries/users';
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
});
