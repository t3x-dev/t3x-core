import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { TreeGraphView } from '@/components/tree-graph';
import { toneAccent } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { CommitDisplay } from '@/types/nodes';

// Preview limits for UnitNode display
export const PREVIEW_MAX_NODES = 3;
const PREVIEW_MAX_FRAMES = 3;

/**
 * Author badge for commits (with type indicator)
 */
export const AuthorBadge = memo(function AuthorBadge({
  author,
}: {
  author: CommitDisplay['author'];
}) {
  const isAgent = author.type === 'agent';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
        isAgent
          ? 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
          : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
      }`}
    >
      {author.name || author.id || 'Unknown'}
      {isAgent && <span className="text-[0.5rem]">AI</span>}
    </span>
  );
});

/**
 * Commit content section - shows trees preview (constraints are in Leaves)
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 */
export const CommitContentSection = memo(function CommitContentSection({
  commit,
  onViewFull,
  projectId: _projectId, // Reserved for future TruncatedCommitView integration
  maxContentNodes: _maxNodes = PREVIEW_MAX_NODES,
}: {
  commit: CommitDisplay;
  onViewFull?: () => void;
  projectId?: string;
  maxContentNodes?: number;
}) {
  const nodes = commit.content?.trees ?? [];
  const displayNodes = nodes.slice(0, PREVIEW_MAX_FRAMES) as Array<{
    id: string;
    type: string;
    slots: Record<string, unknown>;
    confidence?: number;
  }>;
  const remainingNodes = nodes.length - PREVIEW_MAX_FRAMES;

  return (
    <div className="commit-v4-content mt-2 pt-2 border-t border-[var(--stroke-divider)]">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-[var(--space-item)]">
        <span className="text-xs text-[var(--text-tertiary)]">by</span>
        <AuthorBadge author={commit.author} />
        {/* V4 badge */}
        <span
          className={cn(
            'text-[0.55rem] font-semibold px-1 py-0.5 rounded-full border bg-transparent',
            toneAccent.conversation.border,
            toneAccent.conversation.text
          )}
        >
          V4
        </span>
      </div>

      {/* Tree Graph or Frames list (preview) */}
      {commit.semantic && commit.semantic.trees.length > 0 ? (
        <div>
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Tree Graph ({commit.semantic.trees.length} nodes)
          </div>
          <div className="h-[200px] rounded border border-[var(--stroke-divider)]">
            <TreeGraphView content={commit.semantic} className="h-full w-full" />
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Frames ({nodes.length})
          </div>
          {nodes.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-tertiary)] italic">No trees</p>
          ) : (
            <>
              <ul className="mt-1 space-y-0.5">
                {displayNodes.map((f) => {
                  const slotSummary = Object.entries(f.slots ?? {})
                    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                    .join('; ');
                  return (
                    <li
                      key={f.id}
                      className="flex items-start gap-1 text-xs text-[var(--text-secondary)]"
                    >
                      {f.confidence !== undefined && (
                        <span
                          className={cn(
                            'inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                            f.confidence >= 0.8
                              ? 'bg-[var(--status-success)]'
                              : f.confidence >= 0.5
                                ? 'bg-amber-500'
                                : 'bg-[var(--status-error)]'
                          )}
                          title={`${Math.round(f.confidence * 100)}%`}
                        />
                      )}
                      <span className="text-[var(--text-tertiary)] font-mono text-[11px] shrink-0">
                        {f.type}
                      </span>
                      <span className="line-clamp-2">{slotSummary}</span>
                    </li>
                  );
                })}
              </ul>
              {/* Footer with +N more and View full */}
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--stroke-divider)]">
                {remainingNodes > 0 ? (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    +{remainingNodes} tree{remainingNodes !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span />
                )}
                {onViewFull && (
                  <button
                    type="button"
                    onClick={onViewFull}
                    className={cn(
                      'inline-flex items-center gap-0.5 text-xs transition-colors hover:brightness-110',
                      toneAccent.commit.text
                    )}
                  >
                    View full
                    <ChevronRight size={10} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Constraints notice */}
      <div className="mt-2 px-2 py-1.5 bg-[var(--hover-bg)] rounded border border-[var(--stroke-divider)]">
        <p className="text-xs text-[var(--text-tertiary)]">Constraints are defined in Leaves</p>
      </div>
    </div>
  );
});
