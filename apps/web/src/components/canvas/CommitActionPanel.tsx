'use client';

import { Eye, Leaf, MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface CommitAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface CommitActionPanelProps {
  x: number;
  y: number;
  actions: CommitAction[];
  onClose: () => void;
}

export function CommitActionPanel({ x, y, actions, onClose }: CommitActionPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Delay attaching click listener to avoid immediate close from triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position if overflowing viewport
  useEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      panelRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      panelRef.current.style.top = `${y - rect.height - 10}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 flex items-center gap-1 rounded-xl border border-border/60 px-1.5 py-1',
        'bg-popover/95 backdrop-blur-md shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.label}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
            'text-popover-foreground hover:bg-accent/80 transition-colors'
          )}
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          <span className="shrink-0 opacity-70">{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Build standard actions for a committed node */
export function buildCommitActions(opts: {
  onContinueConversation: () => void;
  onViewDetails: () => void;
  onCreateLeaf: () => void;
}): CommitAction[] {
  return [
    {
      label: 'Continue',
      icon: <MessageSquarePlus size={14} />,
      onClick: opts.onContinueConversation,
    },
    {
      label: 'Details',
      icon: <Eye size={14} />,
      onClick: opts.onViewDetails,
    },
    {
      label: 'Leaf',
      icon: <Leaf size={14} />,
      onClick: opts.onCreateLeaf,
    },
  ];
}
