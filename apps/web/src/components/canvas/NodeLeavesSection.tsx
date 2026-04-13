import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Circle, Clock, Loader2, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { EmbeddedLeaf } from '@/types/nodes';
import { getLeafIcon } from './CanvasNodeUtils';

/**
 * NodeLeavesSection - Renders the expandable leaves list for a commit node.
 * Extracted and memoized to avoid re-rendering the leaf list when unrelated
 * node state (e.g. content expansion, hover lineage) changes.
 */
export const NodeLeavesSection = memo(function NodeLeavesSection({
  leaves,
  totalPassed,
  totalAssertions,
  leavesExpanded,
  setLeavesExpanded,
  isDetail,
  prefersReducedMotion,
  projectId,
  nodeId,
  leafContextMenuHandler,
  removeLeafFromNode,
}: {
  leaves: EmbeddedLeaf[];
  totalPassed: number;
  totalAssertions: number;
  leavesExpanded: boolean;
  setLeavesExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isDetail: boolean;
  prefersReducedMotion: boolean;
  projectId?: string;
  nodeId: string;
  leafContextMenuHandler:
    | ((e: React.MouseEvent, leafId: string, nodeId: string) => void)
    | null
    | undefined;
  removeLeafFromNode: (nodeId: string, leafId: string) => Promise<void> | void;
}) {
  const getLeafHref = (leaf: EmbeddedLeaf): string | undefined => {
    if (!projectId || !leaf.id) return undefined;
    return `/project/${projectId}/leaf/${leaf.id}`;
  };

  return (
    <div className="border-t border-[var(--stroke-divider)]">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setLeavesExpanded((prev) => !prev);
        }}
        type="button"
      >
        <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          Leaves ({leaves.length})
          {totalAssertions > 0 && (
            <span className="ml-1.5 normal-case font-normal">
              <span className="text-[var(--status-success)]">{totalPassed}</span>
              <span className="text-[var(--text-tertiary)]/50">/</span>
              <span className="text-[var(--text-tertiary)]">{totalAssertions}</span>
            </span>
          )}
        </span>
        <ChevronRight
          size={12}
          className={cn(
            'text-[var(--text-tertiary)] transition-transform duration-[var(--duration-normal)]',
            (leavesExpanded || isDetail) && 'rotate-90'
          )}
        />
      </button>
      <AnimatePresence>
        {(leavesExpanded || isDetail) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1 nodrag">
              {leaves.map((leaf) => {
                const LeafIcon = getLeafIcon(leaf.type);
                const leafHref = getLeafHref(leaf);
                const leafContent = (
                  <>
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]">
                      <LeafIcon size={12} />
                    </div>
                    <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
                      {leaf.title}
                    </span>
                    {leaf.status && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
                          leaf.status === 'running' &&
                            'bg-[var(--status-info-muted)] text-[var(--status-info)]',
                          leaf.status === 'passed' &&
                            'bg-[var(--status-success-muted)] text-[var(--status-success)]',
                          leaf.status === 'failed' &&
                            'bg-[var(--status-error-muted)] text-[var(--status-error)]',
                          leaf.status === 'pending' &&
                            'bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
                          leaf.status === 'idle' &&
                            'bg-[var(--hover-bg)] text-[var(--text-tertiary)]'
                        )}
                      >
                        {leaf.status === 'running' && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        {leaf.status === 'passed' && <Check size={10} />}
                        {leaf.status === 'failed' && <X size={10} />}
                        {leaf.status === 'pending' && <Clock size={10} />}
                        {leaf.status === 'idle' && <Circle size={10} />}
                        {leaf.status === 'passed' && leaf.passedCount !== undefined
                          ? `${leaf.passedCount}/${(leaf.passedCount || 0) + (leaf.failedCount || 0)}`
                          : leaf.status}
                      </span>
                    )}
                  </>
                );
                return (
                  <div
                    key={leaf.id}
                    data-node-type="leaf"
                    className="group/leaf flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => leafContextMenuHandler?.(e, leaf.id, nodeId)}
                  >
                    {leafHref ? (
                      <Link
                        href={leafHref}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--hover-bg)] transition-colors cursor-pointer flex-1 min-w-0"
                      >
                        {leafContent}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md flex-1 min-w-0">
                        {leafContent}
                      </div>
                    )}
                    <button
                      type="button"
                      className="opacity-0 group-hover/leaf:opacity-100 p-1 rounded hover:bg-[var(--status-error-muted)] text-[var(--text-tertiary)]/50 hover:text-[var(--status-error)] transition-all shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeLeafFromNode(nodeId, leaf.id);
                      }}
                      aria-label={`Remove leaf ${leaf.title || leaf.id}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
