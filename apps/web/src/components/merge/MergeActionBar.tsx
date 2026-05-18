'use client';

/**
 * MergeActionBar - Top action bar for merge workspace
 *
 * Shows branch info, save status, and action buttons.
 */

import { AlertCircle, ArrowLeft, Check, GitMerge, Loader2 } from 'lucide-react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface MergeActionBarProps {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  unresolvedCount: number;
  saveStatus: SaveStatus;
  message: string;
  onMessageChange: (message: string) => void;
  onSave: () => void;
  onCommit: () => void;
  onCancel: () => void;
  canCommit: boolean;
  onClose: () => void;
}

export function MergeActionBar({
  projectId,
  sourceBranch,
  targetBranch,
  unresolvedCount,
  saveStatus,
  message,
  onMessageChange,
  onSave: _onSave,
  onCommit,
  onCancel,
  canCommit,
  onClose,
}: MergeActionBarProps) {
  const projectName = useProjectStore((s) => s.getProject(projectId))?.name;
  const { t } = useTerminology();
  return (
    <header
      className={cn(
        'flex h-[var(--h-header)] shrink-0 items-center gap-4 px-4',
        glass.panelBase,
        'border-t-0 border-x-0 rounded-none'
      )}
    >
      {/* Back Button */}
      <Button variant="ghost" size="icon" onClick={onClose}>
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Breadcrumb + Branch Info */}
      <Breadcrumb
        segments={[
          { label: projectName || 'Project', href: `/project/${projectId}` },
          { label: `${sourceBranch} → ${targetBranch}` },
          { label: t('merge') },
        ]}
      />
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-[var(--text-tertiary)]" />
        <span className="font-medium text-[var(--text-primary)]">{sourceBranch}</span>
        <span className="text-[var(--text-tertiary)]">into</span>
        <span className="font-medium text-[var(--text-primary)]">{targetBranch}</span>
      </div>

      {/* Unresolved Count */}
      {unresolvedCount > 0 && (
        <Badge variant="destructive" className="ml-2">
          {unresolvedCount} {t('unresolved').toLowerCase()}
        </Badge>
      )}

      {/* Save Status */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <Check className="h-3 w-3 text-[var(--diff-added-accent)]" />
            <span className="text-[var(--diff-added-accent)]">Saved</span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <AlertCircle className="h-3 w-3 text-destructive" />
            <span className="text-destructive">Save failed</span>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Merge Message Input */}
      <div className="flex items-center gap-2 min-w-[200px] max-w-96 flex-1">
        <Input
          placeholder={`${t('merge')} message (required)`}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          className="h-8"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="commit"
          size="sm"
          onClick={onCommit}
          disabled={!canCommit}
          className="gap-1"
        >
          <GitMerge className="h-3 w-3" />
          {t('mergeConfirm')}
        </Button>
      </div>
    </header>
  );
}
