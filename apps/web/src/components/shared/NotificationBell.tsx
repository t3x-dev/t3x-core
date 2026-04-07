'use client';

/**
 * NotificationBell - Displays unread notification count and dropdown.
 * Polls /v1/notifications periodically for new alerts.
 */

import { Bell, Check, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  projectId?: string;
  pollIntervalMs?: number;
}

export function NotificationBell({ projectId, pollIntervalMs = 30_000 }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await listNotifications(projectId);
      setNotifications(data);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [projectId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchNotifications, pollIntervalMs]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await markNotificationRead(id);
    } catch {
      // Revert on failure
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
    }
  };

  const markAllRead = async () => {
    const previousState = notifications;
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead(projectId);
    } catch {
      // Revert on failure
      setNotifications(previousState);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="relative"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[var(--status-error)] text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--color-bg-primary)] shadow-lg z-50"
        >
          <div className="flex items-center justify-between p-3 border-b border-[var(--stroke-divider)]">
            <span className="text-sm font-medium text-[var(--text-primary)]">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllRead}
                  className="text-xs h-6 px-2"
                >
                  <Check size={12} className="mr-1" /> Read all
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--text-tertiary)]">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-[var(--stroke-divider)]">
              {notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  tabIndex={0}
                  className={cn(
                    'w-full text-left p-3 text-xs hover:bg-[var(--color-bg-subtle)] transition-colors focus-visible:outline-none focus-visible:bg-[var(--color-bg-subtle)]',
                    !n.read && 'bg-[var(--status-info-muted)]'
                  )}
                  onClick={() => !n.read && markRead(n.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !n.read) {
                      e.preventDefault();
                      markRead(n.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-[var(--text-primary)]">{n.title}</div>
                      <div className="text-[var(--text-secondary)] mt-0.5">{n.message}</div>
                    </div>
                    {!n.read && (
                      <span className="h-2 w-2 rounded-full bg-[var(--status-info)] mt-1 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-[var(--text-tertiary)] mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
