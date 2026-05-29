'use client';

import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  FileText,
  Home,
  Keyboard,
  LayoutGrid,
  MessageSquarePlus,
  Search,
  Settings,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  type CommandIconName,
  type CommandRegistryCommand,
  useCommandRegistry,
} from '@/hooks/shared/useCommandRegistry';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { cn } from '@/utils/cn';
import { reducedMotion, scaleIn } from '@/utils/motion';
import { glass } from '@/utils/theme';

interface CommandPaletteProps {
  /** Current project ID for context-aware actions */
  projectId?: string;
  /** Callback when a conversation is created */
  onCreateConversation?: () => void;
}

export function CommandPalette({ projectId, onCreateConversation }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const dialogVariants = prefersReducedMotion ? reducedMotion.scaleIn : scaleIn;
  const commandGroups = useCommandRegistry({ projectId, onCreateConversation });

  // Toggle command palette with Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      // Also allow Escape to close
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-[var(--overlay-scrim)] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Command Dialog */}
          <motion.div
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <Command
              className={cn(
                'overflow-hidden rounded-xl shadow-[var(--fx-shadow-lg)]',
                glass.elevatedBase,
                glass.highlight
              )}
              loop
            >
              <div className="flex items-center gap-2 border-b border-[var(--stroke-divider)] px-4 py-3">
                <Search size={18} className="text-[var(--text-tertiary)]" />
                <Command.Input
                  placeholder="Type a command or search..."
                  className={cn(
                    'flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none',
                    'placeholder:text-[var(--text-tertiary)]'
                  )}
                  autoFocus
                />
                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1.5 font-mono text-[10px] font-medium text-[var(--text-tertiary)] sm:flex">
                  <span className="text-xs">ESC</span>
                </kbd>
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center">
                  <p className="text-sm text-[var(--text-tertiary)]">No results found.</p>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">T3X — Git for Meaning</p>
                </Command.Empty>

                {commandGroups.map((group) => (
                  <Command.Group
                    key={group.id}
                    heading={group.title}
                    className="text-[var(--text-tertiary)]"
                  >
                    {group.commands.map((command) => (
                      <CommandItem
                        key={command.id}
                        command={command}
                        onSelect={() => handleSelect(command.run)}
                      />
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              <div className="flex items-center justify-between border-t border-[var(--stroke-divider)] px-4 py-2">
                <span className="text-xs text-[var(--text-tertiary)]">T3X Command Palette</span>
                <div className="flex gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[10px]">
                    ↑↓
                  </kbd>
                  <span>navigate</span>
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[10px]">
                    ↵
                  </kbd>
                  <span>select</span>
                </div>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const COMMAND_ICONS: Record<CommandIconName, React.ComponentType<{ size?: number }>> = {
  'bar-chart': BarChart3,
  'file-text': FileText,
  home: Home,
  keyboard: Keyboard,
  'layout-grid': LayoutGrid,
  'message-plus': MessageSquarePlus,
  settings: Settings,
};

function CommandItem({
  command,
  onSelect,
}: {
  command: CommandRegistryCommand;
  onSelect?: () => void;
}) {
  const Icon = COMMAND_ICONS[command.icon];
  return (
    <Command.Item
      value={command.title}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5',
        'text-sm text-[var(--text-primary)]',
        'aria-selected:bg-[var(--hover-bg)] aria-selected:text-[var(--text-primary)]',
        'transition-colors'
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-card)] text-[var(--text-secondary)]">
        <Icon size={16} />
      </span>
      <span className="flex-1">{command.title}</span>
      {command.shortcut && (
        <kbd className="ml-auto rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
          {command.shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
