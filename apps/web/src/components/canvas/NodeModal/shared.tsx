'use client';

import { Bot, CheckCircle, Copy, ExternalLink, Info, Leaf, Pin, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { PinDropdownSelector } from '@/components/ui/PinDropdownSelector';
import { useTerminology } from '@/hooks/useTerminology';
import { cn } from '@/lib/utils';
import { usePinsStore } from '@/store/pinsStore';
import type { CommitDisplay, CommitSourceRef, EmbeddedLeaf } from '@/types/nodes';
import { CommitSourceContext } from '../CommitSourceContext';
import { LeafCreationDialog } from '../LeafCreationDialog';

/**
 * Author badge for commits (with type indicator)
 */
export function CommitAuthorBadge({ author }: { author: CommitDisplay['author'] }) {
  const isAgent = author.type === 'agent';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded ${
        isAgent
          ? 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {isAgent ? <Bot size={14} /> : <User size={14} />}
      {author.name || author.id || 'Unknown'}
    </span>
  );
}

/**
 * Pinned Sources section for V4 commits
 */
export function PinnedSourcesSection({
  sourceRefs,
  projectId,
}: {
  sourceRefs: CommitSourceRef[];
  projectId?: string;
}) {
  if (sourceRefs.length === 0) {
    return null;
  }

  return (
    <div className="p-[var(--space-group)] bg-[var(--status-info-muted)] rounded-lg border border-[var(--status-info)]/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pin size={14} className="text-[var(--status-info)]" />
          <h3 className="font-semibold text-sm text-[var(--status-info)]">Pinned Sources</h3>
        </div>
        <span className="text-xs text-[var(--status-info)]">
          {sourceRefs.length} source{sourceRefs.length !== 1 ? 's' : ''}
        </span>
      </div>
      <ul className="space-y-[var(--space-item)]">
        {sourceRefs.map((ref, idx) => (
          <li
            key={ref.id || idx}
            className="flex items-start gap-2 p-2 bg-[var(--color-bg-white)] rounded border border-[var(--status-info)]/15"
          >
            <span
              className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
                ref.type === 'conversation'
                  ? 'bg-[var(--status-info-muted)] text-[var(--status-info)]'
                  : 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
              )}
            >
              {ref.type === 'conversation' ? 'conv' : 'leaf'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[0.875rem] text-foreground break-words">
                {ref.title || ref.id}
              </span>
              {ref.assertion_lessons && ref.assertion_lessons.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Lessons:</span> {ref.assertion_lessons.join(', ')}
                </div>
              )}
            </div>
            {projectId && ref.id && (
              <PinButton
                projectId={projectId}
                type={ref.type === 'conversation' ? 'conversation' : 'leaf'}
                refId={ref.id}
                className="shrink-0"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Memory Context sidebar section.
 * Shows pin counts and allows opening EditContextDialog.
 */
export function MemoryContextSidebar({
  projectId,
  conversationId,
  branch,
}: {
  projectId?: string;
  conversationId?: string;
  branch?: string;
}) {
  const pins = usePinsStore((state) => state.pins);

  const convCount = pins.filter((p) => p.type === 'conversation').length;
  const leafCount = pins.filter((p) => p.type === 'leaf').length;
  const totalCount = convCount + leafCount;

  if (!projectId) return null;

  return (
    <>
      <div className="h-px bg-border my-4" />
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Memory Context
        </h4>

        {branch ? (
          <PinDropdownSelector projectId={projectId} branch={branch} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-[0.85rem] text-muted-foreground mb-[var(--space-item)]">
              <Pin size={14} className="text-muted-foreground/70 shrink-0" />
              <span>
                {totalCount === 0
                  ? 'No pins'
                  : `${convCount} conversation${convCount !== 1 ? 's' : ''}${leafCount > 0 ? `, ${leafCount} leaf${leafCount !== 1 ? 's' : ''}` : ''} pinned`}
              </span>
            </div>
            {conversationId && (
              <div className="flex items-center justify-between p-2 bg-background rounded border border-border mt-2">
                <span className="text-xs text-muted-foreground truncate mr-2">
                  conv#{conversationId.replace(/^conv_/, '').slice(0, 6)}
                </span>
                <PinButton
                  projectId={projectId}
                  type="conversation"
                  refId={conversationId}
                  className="h-7 w-7"
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * Info message explaining V4 constraint architecture
 */
export function V4ConstraintInfoMessage() {
  return (
    <div className="p-[var(--space-group)] bg-[var(--status-warning-muted)] rounded-lg border border-[var(--status-warning)]/25">
      <div className="flex items-start gap-3">
        <Info size={18} className="text-[var(--status-warning)] shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm text-[var(--status-warning)] mb-1">
            V4 Architecture
          </h3>
          <p className="text-sm text-[var(--status-warning)]">
            In V4, constraints are defined at the <strong>Leaf</strong> level, not the Commit level.
            This allows the same knowledge (commit) to be applied with different constraints for
            different outputs. Create a Leaf from this commit to define constraints for your
            specific use case.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Header bar for committed commit - shows hash, schema version, branch, author
 */
export function CommitFullHeader({
  commit,
  branchName,
}: {
  commit: CommitDisplay;
  branchName?: string;
}) {
  const [copiedHash, setCopiedHash] = useState(false);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyHash}
          className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground bg-background hover:bg-muted px-2 py-1 rounded border border-border transition-colors cursor-pointer"
        >
          {commit.hash.slice(0, 7)}
          {copiedHash ? (
            <CheckCircle size={14} className="text-[var(--status-success)]" />
          ) : (
            <Copy size={14} className="text-muted-foreground/70" />
          )}
        </button>
        {branchName && (
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded',
              branchName === 'main'
                ? 'bg-[var(--status-info-muted)] text-[var(--status-info)]'
                : 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
            )}
          >
            {branchName}
          </span>
        )}
      </div>
      <CommitAuthorBadge author={commit.author} />
    </div>
  );
}

/**
 * Renders the source context / frame display for a commit, used inside tabs.
 */
export function CommitSourceContent({ commit }: { commit: CommitDisplay }) {
  // Derive display entries from tree nodes for source context tracing
  const sentences = commit.content?.trees
    ? (() => {
        type TreeNodeLike = import('@t3x-dev/core').TreeNode;
        const entries: Array<{ id: string; text: string; confidence: number; source_ref?: { turn_hash?: string; start_char?: number; end_char?: number } }> = [];
        function walk(nodes: TreeNodeLike[], prefix = '') {
          for (const node of nodes) {
            const path = prefix ? `${prefix}.${node.key}` : node.key;
            const text = `[${node.key}] ${Object.entries(node.slots)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
              .join('; ')}`;
            entries.push({
              id: path,
              text,
              confidence: node.confidence ?? 1.0,
              source_ref: node.source ? { turn_hash: node.source } : undefined,
            });
            if (node.children?.length) walk(node.children, path);
          }
        }
        walk((commit.content as import('@t3x-dev/core').SemanticContent).trees);
        return entries;
      })()
    : [];

  const sourceRefs = commit.sources ?? commit.source_refs ?? undefined;
  const hasLeafSources = sourceRefs?.some((r) => r.type === 'leaf');
  const hasTurnSourceInfo = sentences.some((s) => s.source_ref?.turn_hash);
  const hasSourceInfo = hasTurnSourceInfo || hasLeafSources;

  if (hasSourceInfo) {
    const mappedSentences = sentences.map((s) => ({
      id: s.id,
      text: s.text,
      source: s.source_ref?.turn_hash
        ? {
            turn_hash: s.source_ref.turn_hash,
            start_char: s.source_ref.start_char ?? 0,
            end_char: s.source_ref.end_char ?? 0,
          }
        : undefined,
    }));

    return (
      <CommitSourceContext
        sentences={mappedSentences}
        sourceRefs={
          sourceRefs as Array<{ type: 'conversation' | 'leaf'; id: string; title?: string }>
        }
      />
    );
  }

  return (
    <div className="p-[var(--space-group)] bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-foreground">Frames</h3>
        <span className="text-xs text-muted-foreground/70">{sentences.length} total</span>
      </div>
      <ul className="space-y-[var(--space-item)]">
        {sentences.map((s) => {
          const confidence = 'confidence' in s ? (s.confidence as number | undefined) : undefined;
          const barColor =
            confidence === undefined
              ? 'bg-muted'
              : confidence >= 0.8
                ? 'bg-[var(--status-success)]'
                : confidence >= 0.5
                  ? 'bg-amber-500'
                  : 'bg-[var(--status-error)]';
          return (
            <li
              key={s.id}
              className={cn(
                'flex items-start gap-2 p-2 rounded border',
                confidence !== undefined && confidence < 0.7
                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300/30'
                  : 'bg-background border-border'
              )}
            >
              <div
                className={cn('w-1 self-stretch rounded-full shrink-0', barColor)}
                title={
                  confidence !== undefined ? `Confidence: ${confidence.toFixed(2)}` : undefined
                }
              />
              <span className="text-xs font-mono text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-foreground break-words flex-1">
                {s.text}
              </span>
              {confidence !== undefined && (
                <span
                  className={cn(
                    'text-[10px] font-mono shrink-0 px-1 py-0.5 rounded',
                    confidence >= 0.8
                      ? 'text-[var(--status-success)]'
                      : confidence >= 0.5
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-[var(--status-error)]'
                  )}
                >
                  {Math.round(confidence * 100)}%
                </span>
              )}
            </li>
          );
        })}
        {sentences.length === 0 && (
          <li className="text-center py-4 text-muted-foreground/70 text-sm">No sentences</li>
        )}
      </ul>
    </div>
  );
}

/**
 * Constraints and leaves section for a committed commit.
 */
export function CommitConstraintsAndLeaves({
  commit,
  leaves,
  projectId,
}: {
  commit: CommitDisplay;
  leaves?: EmbeddedLeaf[];
  projectId?: string;
}) {
  const { t } = useTerminology();
  const [showCreateLeaf, setShowCreateLeaf] = useState(false);

  return (
    <>
      <div className="space-y-[var(--space-item)]">
        <V4ConstraintInfoMessage />
        {projectId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateLeaf(true)}
            className="w-full border-[var(--accent-conversation)]/20 text-[var(--accent-conversation)] hover:bg-[var(--accent-conversation)]/10 hover:border-[var(--accent-conversation)]/30"
          >
            <Plus size={16} className="mr-1" />
            Create Leaf from This {t('commit')}
          </Button>
        )}
      </div>

      {leaves && leaves.length > 0 && projectId && (
        <div className="p-[var(--space-group)] bg-[var(--status-success-muted)] rounded-lg border border-[var(--status-success)]/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Leaf size={14} className="text-[var(--status-success)]" />
              <h3 className="font-semibold text-sm text-[var(--status-success)]">
                Associated Leaves
              </h3>
            </div>
            <span className="text-xs text-[var(--status-success)]">
              {leaves.length} leaf{leaves.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-[var(--space-item)]">
            {leaves.map((leaf) => (
              <li key={leaf.id}>
                <Link
                  href={`/project/${projectId}/leaf/${leaf.id}`}
                  className="flex items-center justify-between p-2 bg-[var(--color-bg-white)] rounded border border-[var(--status-success)]/15 hover:border-[var(--status-success)]/30 hover:bg-[var(--status-success-muted)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--status-info-muted)] text-[var(--status-info)]">
                      {leaf.type}
                    </span>
                    <span className="text-sm text-foreground/80 truncate">{leaf.title}</span>
                  </div>
                  <ExternalLink size={14} className="text-[var(--status-success)] shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {projectId && (
        <LeafCreationDialog
          open={showCreateLeaf}
          onOpenChange={setShowCreateLeaf}
          commitHash={commit.hash}
          projectId={projectId}
        />
      )}
    </>
  );
}
