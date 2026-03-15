import { ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { toneAccent } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { CommitV3Display, CommitV4Display, ConstraintDisplay } from '@/types/nodes';
import { FrameGraphView } from '@/components/frame-graph';
import { TruncatedCommitView } from './TruncatedCommitView';

// Preview limits for UnitNode display
export const PREVIEW_MAX_SENTENCES = 3;
export const PREVIEW_MAX_CONSTRAINTS = 3;

/**
 * Author badge for V3 commits (with verification status)
 */
export const AuthorBadgeV3 = memo(function AuthorBadgeV3({
  author,
}: { author: CommitV3Display['author'] }) {
  const isVerified = author.verification === 'verified';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${
        isVerified
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
          : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]'
      }`}
    >
      {author.name}
      {isVerified && ' \u2713'}
    </span>
  );
});

/**
 * Author badge for V4 commits (with type indicator)
 */
export const AuthorBadgeV4 = memo(function AuthorBadgeV4({
  author,
}: { author: CommitV4Display['author'] }) {
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

export const ConstraintBadge = memo(function ConstraintBadge({
  constraint,
}: { constraint: ConstraintDisplay }) {
  const isRequire = constraint.type === 'require';
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${
        isRequire
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)] border border-[var(--status-success)]/20'
          : 'bg-[var(--status-error-muted)] text-[var(--status-error)] border border-[var(--status-error)]/20 line-through'
      }`}
    >
      {isRequire ? '\u2713' : '\u2717'} {constraint.value}
    </span>
  );
});

/**
 * CommitV3 content section - shows sentences and constraints
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 */
export const CommitV3Content = memo(function CommitV3Content({
  commit,
  onViewFull,
  projectId,
  maxSentences = PREVIEW_MAX_SENTENCES,
}: {
  commit: CommitV3Display;
  onViewFull?: () => void;
  projectId?: string;
  maxSentences?: number;
}) {
  // Check if we have source context for truncated view
  const sentencesWithSource = commit.sentences.filter((s) => s.source?.turn_hash);
  const hasSourceContext = sentencesWithSource.length > 0;

  // Preview mode: limit sentences and constraints
  const displaySentences = commit.sentences.slice(0, maxSentences);
  const remainingSentences = commit.sentences.length - maxSentences;
  const displayConstraints = commit.constraints.slice(0, PREVIEW_MAX_CONSTRAINTS);
  const remainingConstraints = commit.constraints.length - PREVIEW_MAX_CONSTRAINTS;

  return (
    <div className="commit-v3-content mt-2 pt-2 border-t border-[var(--stroke-divider)]">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-[var(--space-item)]">
        <span className="text-xs text-[var(--text-tertiary)]">by</span>
        <AuthorBadgeV3 author={commit.author} />
      </div>

      {/* Sentences - use TruncatedCommitView if source context available */}
      <div>
        <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
          Sentences ({commit.sentences.length})
        </div>
        {commit.sentences.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic">No sentences</p>
        ) : hasSourceContext ? (
          <TruncatedCommitView
            sentences={sentencesWithSource.map((s) => ({
              id: s.id,
              text: s.text,
              source: {
                turn_hash: s.source!.turn_hash,
                start_char: s.source!.start_char,
                end_char: s.source!.end_char,
              },
            }))}
            maxHighlights={2}
            contextChars={50}
            onViewFull={onViewFull}
            projectId={projectId}
          />
        ) : (
          <ul className="space-y-0.5">
            {displaySentences.map((s) => (
              <li key={s.id} className="text-xs text-[var(--text-secondary)] line-clamp-1">
                • {s.text}
              </li>
            ))}
            {remainingSentences > 0 && (
              <li className="text-xs text-[var(--text-tertiary)]">+{remainingSentences} more</li>
            )}
          </ul>
        )}
      </div>

      {/* Constraints (preview) */}
      {commit.constraints.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Constraints ({commit.constraints.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {displayConstraints.map((c) => (
              <ConstraintBadge key={c.id} constraint={c} />
            ))}
            {remainingConstraints > 0 && (
              <span className="text-xs text-[var(--text-tertiary)] px-1 py-0.5">
                +{remainingConstraints}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * CommitV4 content section - shows sentences only (constraints are in Leaves)
 * Header (title, branch, hash, status) is rendered by parent UnitNode
 *
 * Note: V4 sentences use source_ref (conversation_id + turn_hash) without
 * character positions, so we show a compact list with View full link.
 */
export const CommitV4Content = memo(function CommitV4Content({
  commit,
  onViewFull,
  projectId: _projectId, // Reserved for future TruncatedCommitView integration
  maxSentences = PREVIEW_MAX_SENTENCES,
}: {
  commit: CommitV4Display;
  onViewFull?: () => void;
  projectId?: string;
  maxSentences?: number;
}) {
  const sentences = commit.content.sentences;
  const displaySentences = sentences.slice(0, maxSentences);
  const remainingSentences = sentences.length - maxSentences;

  return (
    <div className="commit-v4-content mt-2 pt-2 border-t border-[var(--stroke-divider)]">
      {/* Author badge */}
      <div className="flex items-center gap-1.5 mb-[var(--space-item)]">
        <span className="text-xs text-[var(--text-tertiary)]">by</span>
        <AuthorBadgeV4 author={commit.author} />
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

      {/* Frame Graph or Sentences (preview) */}
      {commit.semantic ? (
        <div>
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
            Frame Graph ({commit.semantic.frames.length} frames)
          </div>
          <div className="h-[200px] rounded border border-[var(--stroke-divider)]">
            <FrameGraphView content={commit.semantic} className="h-full w-full" />
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Sentences ({sentences.length})
          </div>
          {sentences.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-tertiary)] italic">No sentences</p>
          ) : (
            <>
              <ul className="mt-1 space-y-0.5">
                {displaySentences.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-1 text-xs text-[var(--text-secondary)]"
                  >
                    {s.confidence !== undefined && (
                      <span
                        className={cn(
                          'inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                          s.confidence >= 0.8
                            ? 'bg-[var(--status-success)]'
                            : s.confidence >= 0.5
                              ? 'bg-amber-500'
                              : 'bg-[var(--status-error)]'
                        )}
                        title={`${Math.round(s.confidence * 100)}%`}
                      />
                    )}
                    <span className="text-[var(--text-tertiary)] font-mono text-[11px] shrink-0">
                      {s.id}
                    </span>
                    <span className="line-clamp-2">{s.text}</span>
                  </li>
                ))}
              </ul>
              {/* Footer with +N more and View full */}
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--stroke-divider)]">
                {remainingSentences > 0 ? (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    +{remainingSentences} sentence{remainingSentences !== 1 ? 's' : ''}
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

      {/* V4: Constraints notice */}
      <div className="mt-2 px-2 py-1.5 bg-[var(--hover-bg)] rounded border border-[var(--stroke-divider)]">
        <p className="text-xs text-[var(--text-tertiary)]">Constraints are defined in Leaves</p>
      </div>
    </div>
  );
});
