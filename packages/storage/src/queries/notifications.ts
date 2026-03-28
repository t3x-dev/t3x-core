/**
 * Notifications Queries
 *
 * CRUD operations for persistent notifications (Item 16).
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type NotificationInsert, type NotificationRecord, notifications } from '../schema-trees';

// ============================================================
// Types
// ============================================================

export type NotificationType =
  | 'commit.created'
  | 'merge.completed'
  | 'leaf.generated'
  | 'leaf.stale'
  | 'conflict.detected'
  | 'info';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  project_id?: string;
  ref_id?: string;
}

export interface ListNotificationsOptions {
  project_id?: string;
  unread_only?: boolean;
  limit?: number;
}

// ============================================================
// Queries
// ============================================================

/**
 * Insert a new notification.
 */
export async function insertNotification(
  db: AnyDB,
  input: CreateNotificationInput
): Promise<NotificationRecord> {
  const id = `notif_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const row: NotificationInsert = {
    id,
    type: input.type,
    title: input.title,
    message: input.message,
    projectId: input.project_id ?? null,
    refId: input.ref_id ?? null,
    read: false,
  };

  const [result] = await db.insert(notifications).values(row).returning();
  return result;
}

/**
 * List notifications with optional filters.
 */
export async function listNotifications(
  db: AnyDB,
  options?: ListNotificationsOptions
): Promise<NotificationRecord[]> {
  const conditions = [];

  if (options?.project_id) {
    conditions.push(
      or(eq(notifications.projectId, options.project_id), isNull(notifications.projectId))
    );
  }
  if (options?.unread_only) {
    conditions.push(eq(notifications.read, false));
  }

  const limit = options?.limit ?? 100;

  return db
    .select()
    .from(notifications)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  db: AnyDB,
  id: string
): Promise<NotificationRecord | null> {
  const [result] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning();
  return result ?? null;
}

/**
 * Mark all notifications as read, optionally filtered by project.
 */
export async function markAllNotificationsRead(db: AnyDB, projectId?: string): Promise<number> {
  const conditions = [eq(notifications.read, false)];
  if (projectId) {
    conditions.push(eq(notifications.projectId, projectId));
  }

  const result = await db
    .update(notifications)
    .set({ read: true })
    .where(and(...conditions))
    .returning();

  return result.length;
}

/**
 * Delete notifications older than the given date.
 * Used for cleanup/retention.
 */
export async function deleteOldNotifications(db: AnyDB, olderThan: Date): Promise<number> {
  const result = await db
    .delete(notifications)
    .where(lte(notifications.createdAt, olderThan))
    .returning();

  return result.length;
}

/**
 * Get unread notification count for a project.
 */
export async function getUnreadCount(db: AnyDB, projectId?: string): Promise<number> {
  const conditions = [eq(notifications.read, false)];
  if (projectId) {
    conditions.push(eq(notifications.projectId, projectId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(...conditions));

  return result?.count ?? 0;
}
