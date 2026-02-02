'use client';

import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  GitBranch,
  Home,
  MessageSquarePlus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { scaleIn } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CommandPaletteProps {
  /** Current project ID for context-aware actions */
  projectId?: string;
  /** Callback when a conversation is created */
  onCreateConversation?: () => void;
}

export function CommandPalette({ projectId, onCreateConversation }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

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
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Command Dialog */}
          <motion.div
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <Command
              className={cn(
                'rounded-xl border border-border bg-popover shadow-2xl',
                'overflow-hidden'
              )}
              loop
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Search size={18} className="text-muted-foreground" />
                <Command.Input
                  placeholder="Type a command or search..."
                  className={cn(
                    'flex-1 bg-transparent text-base outline-none',
                    'placeholder:text-muted-foreground'
                  )}
                  autoFocus
                />
                <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                  <span className="text-xs">ESC</span>
                </kbd>
              </div>

              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>

                {/* Navigation Group */}
                <Command.Group heading="Navigation" className="text-muted-foreground">
                  <CommandItem
                    icon={<Home size={16} />}
                    shortcut="⌘H"
                    onSelect={() => handleSelect(() => router.push('/'))}
                  >
                    Go to Home
                  </CommandItem>
                  {projectId && (
                    <CommandItem
                      icon={<FileText size={16} />}
                      shortcut="⌘P"
                      onSelect={() => handleSelect(() => router.push(`/project/${projectId}`))}
                    >
                      Go to Project Canvas
                    </CommandItem>
                  )}
                  <CommandItem
                    icon={<Settings size={16} />}
                    onSelect={() => handleSelect(() => router.push('/insights'))}
                  >
                    View Insights
                  </CommandItem>
                </Command.Group>

                {/* Actions Group */}
                <Command.Group heading="Actions" className="text-muted-foreground">
                  <CommandItem
                    icon={<MessageSquarePlus size={16} />}
                    shortcut="⌘N"
                    onSelect={() => handleSelect(() => onCreateConversation?.())}
                  >
                    New Conversation
                  </CommandItem>
                  <CommandItem
                    icon={<GitBranch size={16} />}
                    onSelect={() => handleSelect(() => {})}
                  >
                    Create Branch
                  </CommandItem>
                  <CommandItem
                    icon={<Sparkles size={16} />}
                    onSelect={() => handleSelect(() => {})}
                  >
                    Generate Summary
                  </CommandItem>
                </Command.Group>
              </Command.List>

              <div className="flex items-center justify-between border-t border-border px-4 py-2">
                <span className="text-xs text-muted-foreground">
                  T3X Command Palette
                </span>
                <div className="flex gap-1.5 text-xs text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    ↑↓
                  </kbd>
                  <span>navigate</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
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

interface CommandItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  shortcut?: string;
  onSelect?: () => void;
}

function CommandItem({ children, icon, shortcut, onSelect }: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5',
        'text-sm text-foreground',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'transition-colors'
      )}
    >
      {icon && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}

// Hook for using command palette in components
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, toggle, open, close };
}
