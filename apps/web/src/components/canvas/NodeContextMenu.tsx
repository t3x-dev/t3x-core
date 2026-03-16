'use client';

/**
 * NodeContextMenu — Right-click context menu for canvas nodes and background.
 *
 * Positioned absolutely at click coordinates. Closes on click outside,
 * Escape key, or scroll. Works within ReactFlow's coordinate system.
 */

import {
  Copy,
  ExternalLink,
  Eye,
  FileOutput,
  GitBranch,
  LayoutGrid,
  Leaf,
  MessageSquarePlus,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Developer mode only */
  devOnly?: boolean;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

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

export function buildUnitNodeMenu(opts: {
  onOpenDetail: () => void;
  onCreateBranch: () => void;
  onConnectLeaf: () => void;
  onAutoExtract?: () => void;
  onViewCommitPage?: () => void;
  onCopyHash?: () => void;
  onDelete?: () => void;
  isDraft: boolean;
  isDeveloperMode: boolean;
  hasConversation?: boolean;
}): ContextMenuGroup[] {
  const primaryItems: ContextMenuItem[] = [
    { label: 'Open Detail', icon: <Eye size={14} />, action: opts.onOpenDetail },
  ];

  if (opts.onViewCommitPage) {
    primaryItems.push({
      label: 'View Commit Page',
      icon: <ExternalLink size={14} />,
      action: opts.onViewCommitPage,
    });
  }

  primaryItems.push(
    { label: 'Create Branch', icon: <GitBranch size={14} />, action: opts.onCreateBranch },
    { label: 'Connect Leaf', icon: <Leaf size={14} />, action: opts.onConnectLeaf },
  );

  const groups: ContextMenuGroup[] = [{ items: primaryItems }];

  if (opts.hasConversation && opts.onAutoExtract) {
    groups.push({
      items: [
        {
          label: 'Auto-Extract to Draft',
          icon: <Sparkles size={14} />,
          action: opts.onAutoExtract,
        },
      ],
    });
  }

  if (opts.onCopyHash) {
    groups.push({
      items: [{ label: 'Copy Hash', icon: <Copy size={14} />, action: opts.onCopyHash }],
    });
  }

  if (opts.isDraft && opts.onDelete) {
    groups.push({
      items: [{ label: 'Delete', icon: <Trash2 size={14} />, action: opts.onDelete, danger: true }],
    });
  }

  return groups;
}

export function buildLeafNodeMenu(opts: {
  onOpenDetail: () => void;
  onGenerate: () => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
}): ContextMenuGroup[] {
  return [
    {
      items: [
        { label: 'Open Detail', icon: <Eye size={14} />, action: opts.onOpenDetail },
        { label: 'Generate', icon: <FileOutput size={14} />, action: opts.onGenerate },
        { label: 'Share', icon: <Share2 size={14} />, action: opts.onShare },
      ],
    },
    {
      items: [{ label: 'Delete', icon: <Trash2 size={14} />, action: opts.onDelete, danger: true }],
    },
  ];
}

export function buildBackgroundMenu(opts: {
  onAddConversation: () => void;
  onAddLeaf: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
}): ContextMenuGroup[] {
  return [
    {
      items: [
        {
          label: 'Add Conversation',
          icon: <MessageSquarePlus size={14} />,
          action: opts.onAddConversation,
        },
        { label: 'Add Leaf', icon: <Plus size={14} />, action: opts.onAddLeaf },
      ],
    },
    {
      items: [
        { label: 'Fit View', icon: <ZoomIn size={14} />, action: opts.onFitView },
        { label: 'Auto Layout', icon: <LayoutGrid size={14} />, action: opts.onAutoLayout },
      ],
    },
  ];
}
