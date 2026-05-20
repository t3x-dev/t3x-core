import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export const OPEN_KEYBOARD_SHORTCUTS_EVENT = 't3x:open-keyboard-shortcuts';

export type CommandIconName =
  | 'bar-chart'
  | 'file-text'
  | 'home'
  | 'keyboard'
  | 'layout-grid'
  | 'message-plus'
  | 'settings';

export interface CommandRegistryCommand {
  id: string;
  title: string;
  icon: CommandIconName;
  shortcut?: string;
  run: () => void;
}

export interface CommandRegistryGroup {
  id: 'navigation' | 'actions';
  title: string;
  commands: CommandRegistryCommand[];
}

interface UseCommandRegistryParams {
  projectId?: string;
  onCreateConversation?: () => void;
}

export function useCommandRegistry({
  projectId,
  onCreateConversation,
}: UseCommandRegistryParams): CommandRegistryGroup[] {
  const router = useRouter();

  const routeTo = useCallback((href: string) => () => router.push(href), [router]);

  const newConversation = useCallback(() => {
    if (onCreateConversation) {
      onCreateConversation();
      return;
    }
    router.push('/chat');
  }, [onCreateConversation, router]);

  const openKeyboardShortcuts = useCallback(() => {
    document.dispatchEvent(new CustomEvent(OPEN_KEYBOARD_SHORTCUTS_EVENT));
  }, []);

  return useMemo(
    () => [
      {
        id: 'navigation' as const,
        title: 'Navigation',
        commands: [
          {
            id: 'go-home',
            title: 'Go to Home',
            icon: 'home' as const,
            shortcut: '⌘H',
            run: routeTo('/'),
          },
          ...(projectId
            ? [
                {
                  id: 'go-project-canvas',
                  title: 'Go to Project Canvas',
                  icon: 'file-text' as const,
                  shortcut: '⌘P',
                  run: routeTo(`/project/${projectId}`),
                },
              ]
            : []),
          {
            id: 'browse-templates',
            title: 'Browse Templates',
            icon: 'layout-grid' as const,
            run: routeTo('/templates'),
          },
          {
            id: 'view-insights',
            title: 'View Insights',
            icon: 'bar-chart' as const,
            run: routeTo('/insights'),
          },
          {
            id: 'open-settings',
            title: 'Open Settings',
            icon: 'settings' as const,
            run: routeTo('/settings'),
          },
        ],
      },
      {
        id: 'actions' as const,
        title: 'Actions',
        commands: [
          {
            id: 'new-conversation',
            title: 'New Conversation',
            icon: 'message-plus' as const,
            shortcut: '⌘N',
            run: newConversation,
          },
          {
            id: 'keyboard-shortcuts',
            title: 'Keyboard Shortcuts',
            icon: 'keyboard' as const,
            shortcut: '⌘/',
            run: openKeyboardShortcuts,
          },
        ],
      },
    ],
    [newConversation, openKeyboardShortcuts, projectId, routeTo]
  );
}
