'use client';

import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { framesToSentences } from '@/lib/framesToSentences';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function CommitDropdown() {
  const draft = useExtractionPanelStore((s) => s.draft);
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);

  const [showMessageInput, setShowMessageInput] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showMessageInput) inputRef.current?.focus();
  }, [showMessageInput]);

  const sentences = framesToSentences(draft);
  const hasFrames = draft.frames.length > 0;

  const handleCommit = useCallback(() => {
    if (!hasFrames) return;
    setShowMessageInput(true);
  }, [hasFrames]);

  const handleConfirmCommit = useCallback(() => {
    // Placeholder: actual commit API call goes here
    // The sentences payload is ready: sentences
    setShowMessageInput(false);
    setCommitMessage('');
  }, []);

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
            if (e.key === 'Enter') handleConfirmCommit();
            if (e.key === 'Escape') setShowMessageInput(false);
          }}
        />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => setShowMessageInput(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-[var(--accent-commit)] text-xs text-white hover:opacity-90"
            onClick={handleConfirmCommit}
          >
            Confirm
          </Button>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)]">
          {sentences.length} sentence{sentences.length !== 1 ? 's' : ''} ready
        </p>
      </div>
    );
  }

  return (
    <div className="flex border-t border-[var(--stroke-default)] p-3">
      <div className="flex flex-1 rounded-md overflow-hidden">
        {/* Primary commit button */}
        <Button
          size="sm"
          disabled={!hasFrames}
          onClick={handleCommit}
          className="flex-1 rounded-r-none bg-[var(--accent-commit)] text-xs text-white hover:opacity-90 disabled:opacity-40"
        >
          Commit
        </Button>

        {/* Dropdown chevron */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!hasFrames}
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
