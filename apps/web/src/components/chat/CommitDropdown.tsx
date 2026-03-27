'use client';

import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function CommitDropdown() {
  const router = useRouter();
  const draft = useExtractionPanelStore((s) => s.draft);
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);
  const selectDeltaNodes = useExtractionPanelStore((s) => s.selectDeltaNodes);
  const commitNodes = useExtractionPanelStore((s) => s.commitNodes);
  const commitBranch = useExtractionPanelStore((s) => s.commitBranch);
  const isCommitting = useExtractionPanelStore((s) => s.isCommitting);
  const projectId = useExtractionPanelStore((s) => s.projectId);

  const [showMessageInput, setShowMessageInput] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showMessageInput) inputRef.current?.focus();
  }, [showMessageInput]);

  const deltaCount = selectDeltaNodes().length;
  const hasNodes = draft.trees.length > 0;
  const hasDelta = deltaCount > 0;

  const handleCommit = useCallback(() => {
    if (!hasDelta && !hasNodes) return;
    setShowMessageInput(true);
  }, [hasDelta, hasNodes]);

  const handleConfirmCommit = useCallback(async () => {
    try {
      const result = await commitNodes(commitMessage);
      const commitUrl = projectId
        ? `/project/${projectId}/commit/${encodeURIComponent(result.hash)}`
        : null;
      toast.success(`Committed to ${commitBranch}`, {
        description: result.hash.slice(0, 16),
        action: commitUrl
          ? {
              label: 'View commit',
              onClick: () => router.push(commitUrl),
            }
          : undefined,
      });
      setShowMessageInput(false);
      setCommitMessage('');
    } catch {
      toast.error('Commit failed');
    }
  }, [commitNodes, commitMessage, commitBranch]);

  const handlePreviewAndCommit = useCallback(() => {
    setPanelMode('preview');
  }, [setPanelMode]);

  if (showMessageInput) {
    return (
      <div className="flex flex-col gap-2 border-t border-[var(--stroke-default)] p-3">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message (optional)"
          ref={inputRef}
          className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isCommitting) handleConfirmCommit();
            if (e.key === 'Escape') setShowMessageInput(false);
          }}
          disabled={isCommitting}
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => setShowMessageInput(false)}
            disabled={isCommitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-[var(--accent-commit)] text-xs text-white hover:opacity-90"
            onClick={handleConfirmCommit}
            disabled={isCommitting || (!hasDelta && !hasNodes)}
          >
            {isCommitting ? 'Committing...' : 'Confirm'}
          </Button>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)]">
          {deltaCount} new node{deltaCount !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="flex border-t border-[var(--stroke-default)] p-3">
      <div className="flex flex-1 rounded-md overflow-hidden">
        <Button
          size="sm"
          disabled={(!hasDelta && !hasNodes) || isCommitting}
          onClick={handleCommit}
          className="flex-1 rounded-r-none bg-[var(--accent-commit)] text-xs text-white hover:opacity-90 disabled:opacity-40"
        >
          {hasDelta ? `Commit (${deltaCount})` : hasNodes ? 'Commit current' : 'Commit'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={(!hasDelta && !hasNodes) || isCommitting}
              className="rounded-l-none border-l border-white/20 bg-[var(--accent-commit)] px-2 text-white hover:opacity-90 disabled:opacity-40"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={handleCommit}>Commit</DropdownMenuItem>
            <DropdownMenuItem onClick={handlePreviewAndCommit}>
              Preview &amp; Commit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
