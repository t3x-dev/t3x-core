import { FileOutput, GitCommit, MessageSquareText, PenSquare } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/utils/cn';

export type NodeSemanticKind = 'source' | 'pending' | 'committed' | 'leaf';

const KIND_META: Record<
  NodeSemanticKind,
  {
    label: string;
    shape: string;
    icon: ComponentType<{ className?: string; size?: number }>;
    iconClassName: string;
    iconFrame: string;
  }
> = {
  source: {
    label: 'Source',
    shape: 'dotted-square',
    icon: MessageSquareText,
    iconClassName: 'text-[var(--accent-conversation)]',
    iconFrame:
      'rounded-[5px] border border-dotted border-[var(--accent-conversation)]/55 bg-[var(--accent-conversation-soft)]',
  },
  pending: {
    label: 'Pending',
    shape: 'dashed-square',
    icon: PenSquare,
    iconClassName: 'text-[var(--accent-pending)]',
    iconFrame:
      'rounded-[5px] border border-dashed border-[var(--accent-pending)]/70 bg-[var(--accent-pending-soft)]',
  },
  committed: {
    label: 'Commit',
    shape: 'solid-circle',
    icon: GitCommit,
    iconClassName: 'text-[var(--accent-commit)]',
    iconFrame:
      'rounded-full border border-solid border-[var(--accent-commit)]/55 bg-[var(--accent-commit-soft)]',
  },
  leaf: {
    label: 'Leaf',
    shape: 'diamond',
    icon: FileOutput,
    iconClassName: 'text-[var(--accent-leaf)]',
    iconFrame:
      'rotate-45 rounded-[5px] border border-solid border-[var(--accent-leaf)]/50 bg-[var(--accent-leaf-soft)]',
  },
};

export function NodeKindIcon({
  compact = false,
  kind,
  label,
}: {
  compact?: boolean;
  kind: NodeSemanticKind;
  label?: string;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const displayLabel = label ?? meta.label;
  return (
    <span
      data-kind-shape={meta.shape}
      data-testid={`node-kind-${kind}`}
      title={`${displayLabel} marker`}
      className="inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md border border-[var(--stroke-strong)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--text-primary)]"
    >
      <span
        aria-hidden="true"
        className={cn('inline-flex h-4 w-4 items-center justify-center', meta.iconFrame)}
      >
        <Icon className={cn('h-2.5 w-2.5', meta.iconClassName, kind === 'leaf' && '-rotate-45')} />
      </span>
      {!compact && <span className="truncate">{displayLabel}</span>}
    </span>
  );
}
