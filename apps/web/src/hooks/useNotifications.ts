/**
 * useNotifications — imperative notification list + read-state helpers.
 */

import { useCallback } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/infrastructure/misc';

export function useNotifications() {
  const loadNotifications = useCallback(
    async (projectId?: string) => listNotifications(projectId),
    []
  );
  const markRead = useCallback(async (id: string) => markNotificationRead(id), []);
  const markAllRead = useCallback(
    async (projectId?: string) => markAllNotificationsRead(projectId),
    []
  );
  return { loadNotifications, markRead, markAllRead };
}
