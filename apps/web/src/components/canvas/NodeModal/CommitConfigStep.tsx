'use client';

/**
 * CommitConfigStep — left sidebar for the PendingCommitView modal.
 *
 * Contains:
 *  - Step 1: Configure (branch, template selection)
 *  - Step 2: Extract & Review (LLM extraction status display)
 *
 * Extracted from PendingCommitView.tsx to reduce component size.
 */

import { AlertCircle, Check, GitCompare, Loader2, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTerminology } from '@/hooks/shared/useTerminology';
import type { Branch } from '@/types/api';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { bridgeTemplates } from './helpers';

// ============================================================================
// Props
// ============================================================================

export interface CommitConfigStepProps {
  data: CanvasNodeData;

  // Config state
  template: string;
  setTemplate: (v: string) => void;
  configLocked: boolean;

  // Extraction state (LLM pipeline)
  extractionLoading: boolean;
  extractionError: string | null;
  semanticPointsCount: number;

  // Commit state
  commitError: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  isMainBranchInvalid: boolean;

  // Derived values
  isMergeDraft: boolean;
  shouldShowBranchSelect: boolean;
  requireBranchName: boolean;
  hasSourceConversation: boolean;

  // Callbacks
  handleProceed: () => void;
  handleReset: () => void;

  // External props
  onBranchChange: ((branch: 'main' | 'branch') => void) | undefined;
  onBranchNameChange: ((name: string) => void) | undefined;
}

// ============================================================================
// Component
// ============================================================================

export function CommitConfigStep({
  data,
  template,
  setTemplate,
  configLocked,
  extractionLoading,
  extractionError,
  semanticPointsCount,
  commitError,
  branches,
  branchesLoading,
  isMainBranchInvalid,
  isMergeDraft,
  shouldShowBranchSelect,
  requireBranchName,
  hasSourceConversation,
  handleProceed,
  handleReset,
  onBranchChange,
  onBranchNameChange,
}: CommitConfigStepProps) {
  const { t } = useTerminology();

  return (
    <>
      {/* STEP 1: Configure (or Merge for merge drafts) */}
      <div
        className={cn(
          'flex flex-col gap-[var(--space-group)] flex-1 min-h-0 overflow-y-auto',
          (configLocked || isMergeDraft) && 'opacity-95'
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
            {isMergeDraft ? 'MERGE' : 'STEP 1'}
          </span>
          <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-primary)]">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                !configLocked && !isMergeDraft
                  ? 'bg-emerald-500 dark:bg-emerald-400'
                  : 'bg-[var(--text-tertiary)]'
              )}
            />
            {isMergeDraft ? 'Analyze & Resolve' : 'Configure'}
            {configLocked && !isMergeDraft && (
              <Lock size={12} className="text-[var(--text-tertiary)] ml-1" />
            )}
          </span>
        </div>

        {/* Merge Draft: Legacy three-way merge UI removed */}
        {isMergeDraft ? (
          <div className="flex flex-col gap-3 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center gap-2 font-semibold text-[var(--color-text-secondary)]">
              <GitCompare size={16} />
              <span>
                Merge: {data?.mergeConfig?.sourceCommitTitle} →{' '}
                {data?.mergeConfig?.targetCommitTitle}
              </span>
            </div>
            <div className="text-sm text-[var(--color-text-muted)]">
              Use the MergePanel for two-way merge operations.
            </div>
          </div>
        ) : !configLocked ? (
          /* Unlocked state: Show editable controls */
          <div className="flex flex-col gap-[var(--space-group)]">
            {/* Branch Selection - from real API data */}
            {shouldShowBranchSelect && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="pending-branch"
                  className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide flex items-center"
                >
                  {t('branch')}
                  {branchesLoading && <Loader2 size={12} className="animate-spin ml-1" />}
                </label>
                <select
                  id="pending-branch"
                  className="w-full py-2 px-3 border border-[var(--stroke-default)] rounded-md text-[0.85rem] bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-[var(--accent-conversation)] focus:ring-2 focus:ring-[var(--accent-conversation-soft)]"
                  value={
                    data.pendingBranch !== 'branch'
                      ? 'main'
                      : data.pendingBranchName &&
                          branches.some((b) => b.name === data.pendingBranchName)
                        ? data.pendingBranchName
                        : '__new__'
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'main') {
                      onBranchChange?.('main');
                      onBranchNameChange?.('');
                    } else if (value === '__new__') {
                      onBranchChange?.('branch');
                      onBranchNameChange?.('');
                    } else {
                      onBranchChange?.('branch');
                      onBranchNameChange?.(value);
                    }
                  }}
                  disabled={branchesLoading}
                >
                  <option value="main">main</option>
                  {branches
                    .filter((b) => b.name !== 'main')
                    .map((branch) => (
                      <option key={branch.branch_id} value={branch.name}>
                        {branch.name}
                        {branch.is_current ? ' (current)' : ''}
                      </option>
                    ))}
                  <option value="__new__">+ New {t('branch').toLowerCase()}...</option>
                </select>
                {/* Warning when main branch selection is invalid */}
                {isMainBranchInvalid && (
                  <div className="flex items-start gap-2 mt-1.5 p-2 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/25 rounded text-[var(--status-warning)] text-xs">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {!data.sourceCommitHash
                        ? 'A root commit on main branch already exists.'
                        : 'Can only extend main branch from its latest commit.'}{' '}
                      Please select a different branch.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Branch Name - only shown when creating new branch */}
            {requireBranchName &&
              data.pendingBranch === 'branch' &&
              !branches.some((b) => b.name === data.pendingBranchName) && (
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="pending-branch-name"
                    className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide"
                  >
                    New {t('branch')} Name
                  </label>
                  <Input
                    id="pending-branch-name"
                    type="text"
                    value={data.pendingBranchName || ''}
                    onChange={(e) => onBranchNameChange?.(e.target.value)}
                    placeholder={t('new_branch_name')}
                  />
                </div>
              )}

            {/* Template */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="pending-template"
                className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide"
              >
                Template
              </label>
              <select
                id="pending-template"
                className="w-full py-2 px-3 border border-[var(--stroke-default)] rounded-md text-[0.85rem] bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-[var(--accent-conversation)] focus:ring-2 focus:ring-[var(--accent-conversation-soft)]"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {bridgeTemplates.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Proceed Button */}
            <div className="flex gap-2 mt-2">
              <Button
                onClick={handleProceed}
                disabled={!hasSourceConversation}
                title="Lock configuration and start LLM extraction"
                className="flex-1 gap-1.5 bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Check size={16} />
                <span>Proceed</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Locked state: Show read-only summary */
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 p-3 bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)]">
              {shouldShowBranchSelect && (
                <div className="flex items-center gap-2 text-[0.85rem]">
                  <span className="text-[var(--text-tertiary)] min-w-[70px]">{t('branch')}:</span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {data.pendingBranch || 'branch'}
                  </span>
                </div>
              )}
              {requireBranchName && (
                <div className="flex items-center gap-2 text-[0.85rem]">
                  <span className="text-[var(--text-tertiary)] min-w-[70px]">Name:</span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {data.pendingBranchName || '-'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[0.85rem]">
                <span className="text-[var(--text-tertiary)] min-w-[70px]">Template:</span>
                <span className="text-[var(--text-primary)] font-medium">{template}</span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleReset}
              title="Unlock configuration (will reset Step 2 changes)"
              className="gap-2"
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </Button>
          </div>
        )}
      </div>

      <div className="h-px bg-[var(--stroke-divider)] my-5" />

      {/* STEP 2: Extract & Review */}
      <div
        className={cn(
          'flex flex-col gap-[var(--space-group)]',
          !configLocked && 'opacity-50 pointer-events-none'
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[0.7rem] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
            STEP 2
          </span>
          <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-primary)]">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                configLocked ? 'bg-emerald-500' : 'bg-[var(--stroke-divider)]'
              )}
            />
            Extract & Review
          </span>
        </div>

        {!configLocked ? (
          <div className="flex items-center gap-2 p-[var(--space-group)] bg-[var(--surface-app)] rounded-lg text-[var(--text-tertiary)] text-[0.85rem]">
            <Lock size={16} />
            <span>Complete Step 1 first</span>
          </div>
        ) : (
          <>
            {extractionLoading && (
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)]">
                <Loader2 size={14} className="animate-spin" />
                <span>Extracting semantic points...</span>
              </div>
            )}

            {extractionError && (
              <div
                className="flex items-start gap-2 p-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-md text-[var(--status-error)] text-sm"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span>{extractionError}</span>
                  <span className="text-xs opacity-75">
                    Ensure ANTHROPIC_API_KEY or GOOGLE_AI_STUDIO_KEY is configured.
                  </span>
                </div>
              </div>
            )}

            {!extractionLoading && !extractionError && semanticPointsCount > 0 && (
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)]">
                <Check size={14} className="text-emerald-500" />
                <span>{semanticPointsCount} semantic points extracted</span>
              </div>
            )}

            {commitError && (
              <div
                className="flex items-center gap-2 py-2 px-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-md text-[var(--status-error)] text-sm"
                role="alert"
              >
                <AlertCircle size={14} />
                <span>{commitError}</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
