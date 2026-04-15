import { CheckCircle, Copy, FileOutput, GitCommit, PenSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CommitDisplay } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { toneAccent } from '@/utils/theme';
import { CommitContentSection, PREVIEW_MAX_NODES } from '../CommitNodeContent';

export interface NodeDetailsSectionProps {
  // Hash display
  hashDisplay: string;
  copiedHash: boolean;
  onCopyHash: (e: React.MouseEvent) => void;

  // Merge info
  isMergeCommit?: boolean;
  mergeSummary?: CommitDisplay['merge_summary'];

  // Status
  isStaging: boolean;
  branchType?: string;
  summary?: string;
  mustHaveCount: number;
  mustntHaveCount: number;

  // Content
  commit?: CommitDisplay;
  isDetail: boolean;
  projectId?: string;
  onViewFull: () => void;

  // Terminology
  t: (key: string) => string;

  // Notifications
  notify?: ((message: string, type: 'success' | 'error' | 'warning') => void) | null;
}

export function NodeDetailsSection({
  hashDisplay,
  copiedHash,
  onCopyHash,
  isMergeCommit,
  mergeSummary,
  isStaging,
  branchType,
  summary,
  mustHaveCount,
  mustntHaveCount,
  commit,
  isDetail,
  projectId,
  onViewFull,
  t,
  notify,
}: NodeDetailsSectionProps) {
  return (
    <>
      {/* Hash + copy button */}
      <div className="flex items-center gap-1.5 text-[0.7rem] text-[var(--text-tertiary)] mb-[var(--space-item)] mt-2 nodrag">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onCopyHash}
                className="inline-flex items-center gap-1 font-mono text-[var(--text-tertiary)] bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] px-1.5 py-0.5 rounded text-xs transition-colors cursor-pointer"
              >
                {hashDisplay}
                {copiedHash ? (
                  <CheckCircle size={10} className="text-[var(--status-success)]" />
                ) : (
                  <Copy size={10} className="text-[var(--text-tertiary)]" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {copiedHash ? 'Copied!' : 'Click to copy hash'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {isMergeCommit && (
          <>
            <span className="text-[var(--text-tertiary)]/50">·</span>
            <span className={cn('font-medium', toneAccent.conversation.text)}>
              {t('merge').toLowerCase()}
            </span>
          </>
        )}
      </div>

      {/* Merge summary one-liner */}
      {isMergeCommit &&
        mergeSummary &&
        (() => {
          const ms = mergeSummary;
          const parts = [
            `${ms.total_nodes} kept`,
            `${ms.resolved_conflicts} ${t('resolved').toLowerCase()}`,
          ];
          if (ms.discarded > 0) parts.push(`${ms.discarded} discarded`);
          return (
            <div className="text-[10px] text-[var(--text-tertiary)] mb-1 flex items-center gap-1.5">
              <span className="truncate">{parts.join(' · ')}</span>
              {ms.release_note && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 p-0.5 rounded hover:bg-[var(--hover-bg)] text-[var(--text-tertiary)] hover:text-[var(--accent-commit)] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const note = ms.release_note!;
                          const md = [`# ${note.title}`, '', `**Summary:** ${note.summary}`, ''];
                          for (const sec of note.sections) {
                            md.push(`## ${sec.heading}`, '');
                            for (const item of sec.items) md.push(`- ${item}`);
                            md.push('');
                          }
                          navigator.clipboard.writeText(md.join('\n')).then(
                            () => notify?.('Release note copied', 'success'),
                            () => notify?.('Failed to copy', 'error')
                          );
                        }}
                      >
                        <FileOutput size={10} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Copy release note
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        })()}

      {/* Status indicator */}
      <div className="flex items-center justify-between mb-[var(--space-item)]">
        <div className="flex items-center gap-1.5">
          {isStaging ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <PenSquare size={12} className={toneAccent.pending.text} />
              <span>{t('draft')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <GitCommit
                size={12}
                className={branchType === 'main' ? toneAccent.commit.text : toneAccent.branch.text}
              />
              <span>{t('committed')}</span>
            </span>
          )}
        </div>
        {isStaging && mustHaveCount + mustntHaveCount > 0 && (
          <span className="text-xs font-medium">
            <span className="text-[var(--status-success)]">{mustHaveCount}✓</span>{' '}
            <span className="text-[var(--status-error)]">{mustntHaveCount}✗</span>
          </span>
        )}
        {!isStaging && summary && (
          <span className="text-xs text-[var(--text-tertiary)] truncate max-w-[100px]">
            {summary}
          </span>
        )}
      </div>

      {/* V4: ContentNodes content */}
      {commit && (
        <CommitContentSection
          commit={commit}
          onViewFull={onViewFull}
          projectId={projectId}
          maxContentNodes={isDetail ? Number.MAX_SAFE_INTEGER : PREVIEW_MAX_NODES}
        />
      )}
    </>
  );
}
