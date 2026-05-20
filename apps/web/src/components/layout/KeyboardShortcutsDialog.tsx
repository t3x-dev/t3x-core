'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OPEN_KEYBOARD_SHORTCUTS_EVENT } from '@/hooks/shared/useCommandRegistry';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { cn } from '@/utils/cn';
import { reducedMotion, scaleIn } from '@/utils/motion';
import { glass } from '@/utils/theme';

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const mod = isMac ? '\u2318' : 'Ctrl';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: `${mod}+K`, description: 'Open command palette' },
      { keys: `${mod}+/`, description: 'Show keyboard shortcuts' },
      { keys: `${mod}+\\`, description: 'Toggle sidebar' },
      { keys: 'Escape', description: 'Close dialog / Cancel' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: 'Tab', description: 'Navigate between nodes' },
      { keys: 'Enter', description: 'Open selected node' },
      { keys: 'Arrow keys', description: 'Spatial navigation' },
      { keys: `${mod}+S`, description: 'Save current work' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: `${mod}+H`, description: 'Go to Home' },
      { keys: `${mod}+P`, description: 'Go to Project Canvas' },
      { keys: `${mod}+N`, description: 'New Conversation' },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const dialogVariants = prefersReducedMotion ? reducedMotion.scaleIn : scaleIn;

  useEffect(() => {
    const openFromRegistry = () => setOpen(true);
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, openFromRegistry);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener(OPEN_KEYBOARD_SHORTCUTS_EVENT, openFromRegistry);
      document.removeEventListener('keydown', handler);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-[var(--overlay-scrim)] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <motion.div
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed left-1/2 top-[15%] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <div
              className={cn(
                'overflow-hidden rounded-xl shadow-[var(--fx-shadow-lg)]',
                glass.elevatedBase,
                glass.highlight
              )}
            >
              <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-5 py-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Keyboard Shortcuts
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-sm p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-2">
                      {group.title}
                    </h3>
                    <div className="space-y-1">
                      {group.shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.keys}
                          className="flex items-center justify-between py-1.5"
                        >
                          <span className="text-sm text-[var(--text-secondary)]">
                            {shortcut.description}
                          </span>
                          <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">
                            {shortcut.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[var(--stroke-divider)] px-5 py-2.5">
                <p className="text-xs text-[var(--text-tertiary)]">
                  Press{' '}
                  <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-1 py-0.5 font-mono text-[10px]">
                    {mod}+/
                  </kbd>{' '}
                  to toggle this dialog
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
