'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

// ── Types ──

type LeafType = 'tweet' | 'email' | 'article' | 'custom';

interface PreviewPanelProps {
  className?: string;
}

// ── Type chips ──

const LEAF_TYPES: { value: LeafType; label: string }[] = [
  { value: 'tweet', label: 'Tweet' },
  { value: 'email', label: 'Email' },
  { value: 'article', label: 'Article' },
  { value: 'custom', label: 'Custom' },
];

// ── Component ──

export function PreviewPanel({ className }: PreviewPanelProps) {
  const draft = useExtractionPanelStore((s) => s.draft);

  const [selectedType, setSelectedType] = useState<LeafType>('tweet');
  const [prompt, setPrompt] = useState('');
  const [generatedOutput, setGeneratedOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showApiKeyNote, setShowApiKeyNote] = useState(false);

  const frameCount = draft.frames.length;

  const handleRegenerate = () => {
    // v1: Generation requires a committed commit + leaf — not available at preview time.
    setShowApiKeyNote(true);
    setIsLoading(false);
  };

  return (
    <div className={cn('flex flex-col gap-0 text-xs', className)}>
      {/* Section header */}
      <div className="border-b border-[var(--stroke-default)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
          Preview
        </span>
      </div>

      {/* Type chips */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--stroke-default)] px-3 py-2">
        {LEAF_TYPES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSelectedType(value);
              setShowApiKeyNote(false);
            }}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
              selectedType === value
                ? 'border-[var(--accent-commit)] bg-[var(--accent-commit)] text-white'
                : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:border-[var(--accent-commit)] hover:text-[var(--text-primary)]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <div className="flex flex-col gap-1.5 border-b border-[var(--stroke-default)] px-3 py-2">
        <label
          htmlFor="preview-prompt"
          className="text-[10px] font-medium text-[var(--text-tertiary)]"
        >
          Prompt
        </label>
        <input
          id="preview-prompt"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`Generate a ${selectedType} from these frames...`}
          className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRegenerate();
          }}
        />
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isLoading || frameCount === 0}
          className="flex items-center gap-1 self-start rounded border border-[var(--stroke-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-40"
        >
          <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
          Regenerate
        </button>
      </div>

      {/* Generated output / placeholder */}
      <div className="flex flex-1 flex-col gap-1 border-b border-[var(--stroke-default)] px-3 py-2">
        <span className="text-[10px] font-medium text-[var(--text-tertiary)]">Output</span>

        {showApiKeyNote ? (
          <div className="rounded border border-[var(--stroke-default)] bg-[var(--hover-bg)] p-2">
            <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
              Generation requires a committed commit and leaf. Use &ldquo;Commit&rdquo; first, then
              generate from the leaf detail view.
            </p>
          </div>
        ) : generatedOutput ? (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 text-[10px] leading-relaxed text-[var(--text-primary)]">
            {generatedOutput}
          </pre>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded border border-dashed border-[var(--stroke-default)] py-4">
            <p className="text-center text-[10px] text-[var(--text-tertiary)]">
              {frameCount === 0 ? 'No frames to preview' : 'Click Regenerate to preview output'}
            </p>
          </div>
        )}
      </div>

      {/* Commit message + commit */}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <label
          htmlFor="preview-commit-msg"
          className="text-[10px] font-medium text-[var(--text-tertiary)]"
        >
          Commit message
        </label>
        <input
          id="preview-commit-msg"
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Describe this commit..."
          className="w-full rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
        />
        <button
          type="button"
          disabled={frameCount === 0}
          className="w-full rounded bg-[var(--accent-commit)] py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          Commit
        </button>
      </div>
    </div>
  );
}
