import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import {
  deleteOldNotifications,
  getUnreadCount,
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../queries/notifications';
import { insertProject } from '../queries/projects';
import { createTestDB, testData } from './setup';

describe('Notifications Storage', () => {
  let db: AnyDB;
  let _client: PGlite;
  let cleanup: () => Promise<void>;
  let testProjectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    _client = setup.client;
    cleanup = setup.cleanup;

    const project = await insertProject(db, testData.project({ name: 'Notification Test' }));
    testProjectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // =========================================================================
  // insertNotification
  // =========================================================================
  describe('insertNotification', () => {
    it('creates a notification with all fields', async () => {
      const n = await insertNotification(db, {
        type: 'commit.created',
        title: 'New Commit',
        message: 'A new commit was created',
        project_id: testProjectId,
        ref_id: 'sha256:abc',
      });

      expect(n).toBeDefined();
      expect(n.id).toMatch(/^notif_/);
      expect(n.type).toBe('commit.created');
      expect(n.title).toBe('New Commit');
      expect(n.message).toBe('A new commit was created');
      expect(n.projectId).toBe(testProjectId);
      expect(n.refId).toBe('sha256:abc');
      expect(n.read).toBe(false);
      expect(n.createdAt).toBeDefined();
    });

    it('creates a notification without optional fields', async () => {
      const n = await insertNotification(db, {
        type: 'info',
        title: 'Info',
        message: 'General info',
      });

      expect(n.id).toMatch(/^notif_/);
      expect(n.projectId).toBeNull();
      expect(n.refId).toBeNull();
      expect(n.read).toBe(false);
    });
  });

  // =========================================================================
  // listNotifications
  // =========================================================================
  describe('listNotifications', () => {
    it('lists all notifications ordered by created_at desc', async () => {
      const list = await listNotifications(db);
      expect(list.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      for (let i = 1; i < list.length; i++) {
        expect(new Date(list[i - 1].createdAt!).getTime()).toBeGreaterThanOrEqual(
          new Date(list[i].createdAt!).getTime()
        );
      }
    });

    it('filters by project_id', async () => {
      const list = await listNotifications(db, { project_id: testProjectId });
      expect(list.length).toBeGreaterThanOrEqual(1);
      for (const n of list) {
        expect(n.projectId).toBe(testProjectId);
      }
    });

    it('filters by unread_only', async () => {
      const list = await listNotifications(db, { unread_only: true });
      for (const n of list) {
        expect(n.read).toBe(false);
      }
    });

    it('respects limit', async () => {
      const list = await listNotifications(db, { limit: 1 });
      expect(list.length).toBe(1);
    });
  });

  // =========================================================================
  // markNotificationRead
  // =========================================================================
  describe('markNotificationRead', () => {
    it('marks a notification as read', async () => {
      const n = await insertNotification(db, {
        type: 'leaf.generated',
        title: 'Leaf Generated',
        message: 'Output ready',
        project_id: testProjectId,
      });

      const updated = await markNotificationRead(db, n.id);
      expect(updated).toBeDefined();
      expect(updated!.read).toBe(true);
    });

    it('returns null for non-existent notification', async () => {
      const result = await markNotificationRead(db, 'notif_nonexistent');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // markAllNotificationsRead
  // =========================================================================
  describe('markAllNotificationsRead', () => {
    it('marks all unread notifications as read', async () => {
      // Insert some unread notifications
      await insertNotification(db, { type: 'info', title: 'T1', message: 'M1' });
      await insertNotification(db, { type: 'info', title: 'T2', message: 'M2' });

      const count = await markAllNotificationsRead(db);
      expect(count).toBeGreaterThanOrEqual(2);

      const unread = await listNotifications(db, { unread_only: true });
      expect(unread.length).toBe(0);
    });

    it('marks only project-scoped notifications as read', async () => {
      // Insert unread for specific project
      await insertNotification(db, {
        type: 'commit.created',
        title: 'P1',
        message: 'M1',
        project_id: testProjectId,
      });
      // Insert unread for no project
      const globalN = await insertNotification(db, {
        type: 'info',
        title: 'Global',
        message: 'No project',
      });

      const count = await markAllNotificationsRead(db, testProjectId);
      expect(count).toBeGreaterThanOrEqual(1);

      // Global notification should still be unread
      const unread = await listNotifications(db, { unread_only: true });
      const globalStillUnread = unread.find((n) => n.id === globalN.id);
      expect(globalStillUnread).toBeDefined();
    });
  });

  // =========================================================================
  // getUnreadCount
  // =========================================================================
  describe('getUnreadCount', () => {
    it('returns correct unread count', async () => {
      // Mark all as read first
      await markAllNotificationsRead(db);
      expect(await getUnreadCount(db)).toBe(0);

      // Insert 3 unread
      await insertNotification(db, { type: 'info', title: 'A', message: 'A' });
      await insertNotification(db, { type: 'info', title: 'B', message: 'B' });
      await insertNotification(db, { type: 'info', title: 'C', message: 'C' });

      expect(await getUnreadCount(db)).toBe(3);
    });
  });

  // =========================================================================
  // deleteOldNotifications
  // =========================================================================
  describe('deleteOldNotifications', () => {
    it('deletes notifications older than given date', async () => {
      // All existing notifications were created "now"
      const future = new Date(Date.now() + 60000);
      const countBefore = (await listNotifications(db)).length;
      expect(countBefore).toBeGreaterThan(0);

      const deleted = await deleteOldNotifications(db, future);
      expect(deleted).toBe(countBefore);

      const countAfter = (await listNotifications(db)).length;
      expect(countAfter).toBe(0);
    });
  });
});
