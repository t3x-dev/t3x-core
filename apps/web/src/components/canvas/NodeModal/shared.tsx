'use client';

import { Bot, CheckCircle, Copy, ExternalLink, Info, Leaf, Pin, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { PinDropdownSelector } from '@/components/ui/PinDropdownSelector';
import { cn } from '@/lib/utils';
import { usePinsStore } from '@/store/pinsStore';
import type {
  CommitDisplay,
  CommitSourceRef,
  CommitV3Display,
  CommitV4Display,
  ConstraintDisplay,
  EmbeddedLeaf,
} from '@/types/nodes';
import { CommitSourceContext } from '../CommitSourceContext';
import { LeafCreationDialog } from '../LeafCreationDialog';

/**
 * Helper to determine if commit is V4 based on schema
 */
export function isCommitV4(commit: CommitDisplay): commit is CommitV4Display {
  return commit.schema === 't3x/commit/v4';
}

/**
 * Author badge for V3 commits (with verification)
 */
export function CommitV3AuthorBadge({ author }: { author: CommitV3Display['author'] }) {
  const isVerified = author.verification === 'verified';
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded ${
        isVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {author.name}
      {isVerified && ' \u2713'}
    </span>
  );
}

/**
 * Author badge for V4 commits (with type indicator)
 */
export function CommitV4AuthorBadge({ author }: { author: CommitV4Display['author'] }) {
  const isAgent = author.type === 'agent';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded ${
        isAgent ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {isAgent ? <Bot size={14} /> : <User size={14} />}
      {author.name || author.id || 'Unknown'}
    </span>
  );
}

/**
 * Constraint badge for V3 commits
 */
export function CommitV3ConstraintBadge({ constraint }: { constraint: ConstraintDisplay }) {
  const isRequire = constraint.type === 'require';
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm px-2 py-1 rounded ${
        isRequire
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-red-100 text-red-700 border border-red-300 line-through'
      }`}
    >
      {isRequire ? '\u2713' : '\u2717'} {constraint.value}
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
    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pin size={14} className="text-blue-600" />
          <h3 className="font-semibold text-sm text-blue-700">Pinned Sources</h3>
        </div>
        <span className="text-xs text-blue-400">
          {sourceRefs.length} source{sourceRefs.length !== 1 ? 's' : ''}
        </span>
      </div>
      <ul className="space-y-2">
        {sourceRefs.map((ref, idx) => (
          <li
            key={ref.id || idx}
            className="flex items-start gap-2 p-2 bg-white rounded border border-blue-100"
          >
            <span
              className={cn(
                'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
                ref.type === 'conversation'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-purple-100 text-purple-600'
              )}
            >
              {ref.type === 'conversation' ? 'conv' : 'leaf'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[0.875rem] text-gray-700 break-words">
                {ref.title || ref.id}
              </span>
              {ref.assertion_lessons && ref.assertion_lessons.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
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
      <div className="h-px bg-gray-200 my-4" />
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Memory Context
        </h4>

        {branch ? (
          <PinDropdownSelector projectId={projectId} branch={branch} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
              <Pin size={14} className="text-gray-400 shrink-0" />
              <span>
                {totalCount === 0
                  ? 'No pins'
                  : `${convCount} conversation${convCount !== 1 ? 's' : ''}${leafCount > 0 ? `, ${leafCount} leaf${leafCount !== 1 ? 's' : ''}` : ''} pinned`}
              </span>
            </div>
            {conversationId && (
              <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 mt-2">
                <span className="text-xs text-gray-600 truncate mr-2">
                  conv#{conversationId.slice(0, 6)}
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
    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
      <div className="flex items-start gap-3">
        <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sm text-amber-800 mb-1">V4 Architecture</h3>
          <p className="text-sm text-amber-700">
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
  const isV4 = isCommitV4(commit);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyHash}
          className="inline-flex items-center gap-1 font-mono text-sm text-gray-500 bg-white hover:bg-gray-100 px-2 py-1 rounded border border-gray-200 transition-colors cursor-pointer"
        >
          {commit.hash.slice(0, 7)}
          {copiedHash ? (
            <CheckCircle size={14} className="text-green-500" />
          ) : (
            <Copy size={14} className="text-gray-400" />
          )}
        </button>
        <span
          className={cn(
            'text-xs font-medium px-1.5 py-0.5 rounded',
            isV4 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          )}
        >
          {isV4 ? 'V4' : 'V3'}
        </span>
        {branchName && (
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded',
              branchName === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            )}
          >
            {branchName}
          </span>
        )}
      </div>
      {isV4 ? (
        <CommitV4AuthorBadge author={commit.author} />
      ) : (
        <CommitV3AuthorBadge author={(commit as CommitV3Display).author} />
      )}
    </div>
  );
}

/**
 * Renders the source context / sentence display for a commit, used inside tabs.
 */
export function CommitSourceContent({ commit }: { commit: CommitDisplay }) {
  const isV4 = isCommitV4(commit);
  const sentences = isV4 ? commit.content.sentences : (commit as CommitV3Display).sentences;

  const hasLeafSources =
    isV4 && (commit as CommitV4Display).source_refs?.some((r) => r.type === 'leaf');
  const hasTurnSourceInfo = isV4
    ? (commit as CommitV4Display).content.sentences.some((s) => s.source_ref?.turn_hash)
    : (commit as CommitV3Display).sentences.some((s) => s.source?.turn_hash);
  const hasSourceInfo = hasTurnSourceInfo || hasLeafSources;

  if (hasSourceInfo) {
    const mappedSentences = isV4
      ? (commit as CommitV4Display).content.sentences.map((s) => ({
          id: s.id,
          text: s.text,
          source: s.source_ref?.turn_hash
            ? {
                turn_hash: s.source_ref.turn_hash,
                start_char: s.source_ref.start_char,
                end_char: s.source_ref.end_char,
              }
            : undefined,
        }))
      : (commit as CommitV3Display).sentences.map((s) => ({
          id: s.id,
          text: s.text,
          source: s.source
            ? {
                turn_hash: s.source.turn_hash,
                start_char: s.source.start_char || 0,
                end_char: s.source.end_char || s.text.length,
              }
            : undefined,
        }));

    const commitSourceRefs = isV4
      ? ((commit as CommitV4Display).source_refs ?? undefined)
      : undefined;

    return <CommitSourceContext sentences={mappedSentences} sourceRefs={commitSourceRefs} />;
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-gray-700">Sentences</h3>
        <span className="text-xs text-gray-400">{sentences.length} total</span>
      </div>
      <ul className="space-y-2">
        {sentences.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100"
          >
            <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
              {s.id}
            </span>
            <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
              {s.text}
            </span>
          </li>
        ))}
        {sentences.length === 0 && (
          <li className="text-center py-4 text-gray-400 text-sm">No sentences</li>
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
  const [showCreateLeaf, setShowCreateLeaf] = useState(false);
  const isV4 = isCommitV4(commit);

  return (
    <>
      {isV4 ? (
        <div className="space-y-3">
          <V4ConstraintInfoMessage />
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateLeaf(true)}
              className="w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300"
            >
              <Plus size={16} className="mr-1" />
              Create Leaf from This Commit
            </Button>
          )}
        </div>
      ) : (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-gray-700">Constraints</h3>
            <span className="text-xs text-gray-400">
              {(commit as CommitV3Display).constraints.length} total
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(commit as CommitV3Display).constraints.map((c) => (
              <CommitV3ConstraintBadge key={c.id} constraint={c} />
            ))}
            {(commit as CommitV3Display).constraints.length === 0 && (
              <span className="text-center py-4 text-gray-400 text-sm w-full">No constraints</span>
            )}
          </div>
        </div>
      )}

      {isV4 && leaves && leaves.length > 0 && projectId && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Leaf size={14} className="text-green-600" />
              <h3 className="font-semibold text-sm text-green-700">Associated Leaves</h3>
            </div>
            <span className="text-xs text-green-400">
              {leaves.length} leaf{leaves.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-2">
            {leaves.map((leaf) => (
              <li key={leaf.id}>
                <Link
                  href={`/project/${projectId}/leaf/${leaf.id}`}
                  className="flex items-center justify-between p-2 bg-white rounded border border-green-100 hover:border-green-300 hover:bg-green-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'text-xs font-medium px-1.5 py-0.5 rounded',
                        leaf.type === 'eval'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                          : leaf.type === 'deploy_agent'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      )}
                    >
                      {leaf.type}
                    </span>
                    <span className="text-sm text-foreground/80 truncate">{leaf.title}</span>
                  </div>
                  <ExternalLink size={14} className="text-green-400 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isV4 && projectId && (
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
