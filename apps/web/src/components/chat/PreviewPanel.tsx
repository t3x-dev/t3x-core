'use client';

import { fuzzyLocate } from '@t3x-dev/core';
import { RefreshCw, Square } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { chatStream } from '@/lib/api/chat';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { type Frame, contentToFrames, treesToFrames } from '@/lib/treeCompat';

// ── Types ──

type LeafType = 'tweet' | 'email' | 'article' | 'custom';

interface PreviewPanelProps {
  className?: string;
}

// ── Type prompts ──

const LEAF_TYPES: { value: LeafType; label: string; systemHint: string }[] = [
  {
    value: 'tweet',
    label: 'Tweet',
    systemHint: 'Write a concise tweet (max 280 chars). Be punchy and engaging.',
  },
  {
    value: 'email',
    label: 'Email',
    systemHint: 'Write a professional email with subject line, greeting, body, and sign-off.',
  },
  {
    value: 'article',
    label: 'Article',
    systemHint:
      'Write a well-structured article with title, introduction, body paragraphs, and conclusion.',
  },
  {
    value: 'custom',
    label: 'Custom',
    systemHint: "Generate content based on the user's instructions.",
  },
];

// ── Highlighted output (inline) ──

function HighlightedOutput({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<{ start: number; end: number }>;
}) {
  if (ranges.length === 0) return <>{text}</>;

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const r of merged) {
    const start = Math.max(0, r.start);
    const end = Math.min(text.length, r.end);
    if (cursor < start) parts.push({ text: text.slice(cursor, start), highlighted: false });
    parts.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });

  return (
    <>
      {parts.map((p, i) =>
        p.highlighted ? (
          <mark
            key={i}
            style={{
              background: 'rgba(96, 165, 250, 0.25)',
              borderRadius: 2,
              padding: '1px 0',
              color: 'inherit',
            }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

// ── Component ──

export function PreviewPanel({ className }: PreviewPanelProps) {
  const draft = useExtractionPanelStore((s) => s.draft);
  const hoveredFrameId = useExtractionPanelStore((s) => s.hoveredFrameId);
  const hoveredSlotKey = useExtractionPanelStore((s) => s.hoveredSlotKey);

  const [selectedType, setSelectedType] = useState<LeafType>('tweet');
  const [prompt, setPrompt] = useState('');
  const [generatedOutput, setGeneratedOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const frameCount = draft.trees.length;

  // Compute highlight ranges in generated output based on hovered YAML slot
  const outputHighlightRanges = useMemo(() => {
    if (!generatedOutput || !hoveredFrameId || !hoveredSlotKey) return [];
    const frame = draft.trees.find((f) => f.id === hoveredFrameId);
    if (!frame) return [];
    const slotValue = frame.slots[hoveredSlotKey];
    if (!slotValue || typeof slotValue !== 'string') return [];
    const located = fuzzyLocate(generatedOutput, slotValue);
    if (!located || located.score < 0.6) return [];
    return [{ start: located.start, end: located.end }];
  }, [generatedOutput, hoveredFrameId, hoveredSlotKey, draft.trees]);

  // Build context string from extracted frames
  const buildContext = useCallback(() => {
    return draft.trees
      .map((frame) => {
        const slots = Object.entries(frame.slots)
          .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('\n');
        return `[${frame.type}]\n${slots}`;
      })
      .join('\n\n');
  }, [draft.trees]);

  const handleGenerate = useCallback(async () => {
    if (frameCount === 0) return;

    // Cancel any in-flight generation
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const leafType = LEAF_TYPES.find((t) => t.value === selectedType)!;
    const context = buildContext();
    const userPrompt = prompt || `Generate a ${selectedType} from the knowledge below.`;

    setIsLoading(true);
    setGeneratedOutput('');

    try {
      let output = '';
      for await (const event of chatStream({
        messages: [
          {
            role: 'system',
            content: `You are a content generator. Use ONLY the knowledge context below to generate content. Do not make up information.\n\n${leafType.systemHint}\n\n--- KNOWLEDGE CONTEXT ---\n${context}\n--- END CONTEXT ---`,
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      })) {
        if (controller.signal.aborted) break;
        if (event.type === 'token' && event.content) {
          output += event.content;
          setGeneratedOutput(output);
        }
        if (event.type === 'error') {
          setGeneratedOutput(`Error: ${event.message || 'Generation failed'}`);
          break;
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setGeneratedOutput(`Error: ${err instanceof Error ? err.message : 'Generation failed'}`);
      }
    } finally {
      setIsLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [frameCount, selectedType, prompt, buildContext]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

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
            onClick={() => setSelectedType(value)}
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
            if (e.key === 'Enter' && !isLoading) handleGenerate();
          }}
          disabled={isLoading}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={isLoading ? handleStop : handleGenerate}
            disabled={!isLoading && frameCount === 0}
            className="flex items-center gap-1 self-start rounded border border-[var(--stroke-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <Square className="h-3 w-3" />
                Stop
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated output */}
      <div className="flex flex-1 flex-col gap-1 px-3 py-2">
        <span className="text-[10px] font-medium text-[var(--text-tertiary)]">Output</span>

        {generatedOutput ? (
          <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2 text-[11px] leading-relaxed text-[var(--text-primary)]">
            {outputHighlightRanges.length > 0 ? (
              <HighlightedOutput text={generatedOutput} ranges={outputHighlightRanges} />
            ) : (
              generatedOutput
            )}
            {isLoading && (
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-[var(--accent-commit)] rounded-sm animate-pulse" />
            )}
          </pre>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded border border-dashed border-[var(--stroke-default)] py-4">
            <p className="text-center text-[10px] text-[var(--text-tertiary)]">
              {frameCount === 0 ? 'No frames to preview' : 'Click Generate to preview output'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
