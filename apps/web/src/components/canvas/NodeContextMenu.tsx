'use client';

/**
 * NodeContextMenu — Right-click context menu for canvas nodes and background.
 *
 * Positioned absolutely at click coordinates. Closes on click outside,
 * Escape key, or scroll. Works within ReactFlow's coordinate system.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import type { ContextMenuGroup, ContextMenuItem } from '@/utils/canvasMenuBuilders';

// ============================================================================
// Types
// ============================================================================

export interface NodeContextMenuProps {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function NodeContextMenu({ x, y, groups, onClose }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
        if (items) {
          const currentIndex = Array.from(items).indexOf(document.activeElement as Element);
          const next = items[currentIndex + 1] || items[0];
          (next as HTMLElement).focus();
        }
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
        if (items) {
          const currentIndex = Array.from(items).indexOf(document.activeElement as Element);
          const prev = items[currentIndex - 1] || items[items.length - 1];
          (prev as HTMLElement).focus();
        }
      }
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className={cn(
        'fixed z-50 min-w-[180px] rounded-xl border border-border/60 py-1',
        'bg-popover/95 backdrop-blur-md shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: x, top: y }}
      role="menu"
    >
      {groups.map((group, gi) => (
        <div key={group.items[0]?.label ?? gi}>
          {gi > 0 && <hr className="my-1 h-px border-none bg-border/50" />}
          {group.items
            .filter((item) => !item.disabled)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
                  'hover:bg-accent/80 focus-visible:bg-accent/80 outline-none',
                  item.danger
                    ? 'text-destructive hover:text-destructive'
                    : 'text-popover-foreground'
                )}
                onClick={() => {
                  item.action();
                  onClose();
                }}
              >
                <span className="shrink-0 opacity-60">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Menu Builders
// ============================================================================

// ============================================================================
// Menu Builders
// Moved to @/utils/canvasMenuBuilders (P5 γ-11 whitelist cleanup).
// Re-exported here so existing `import ... from '@/components/canvas/NodeContextMenu'`
// continues to resolve during the transition.
// ============================================================================

export {
  buildBackgroundMenu,
  buildLeafNodeMenu,
  buildUnitNodeMenu,
  type ContextMenuGroup,
  type ContextMenuItem,
} from '@/utils/canvasMenuBuilders';
