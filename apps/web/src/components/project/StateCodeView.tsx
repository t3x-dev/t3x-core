'use client';

import { JSON_SCHEMA, load } from 'js-yaml';
import { Check, Code2, Copy, Search } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { cn } from '@/utils/cn';

type CodeMode = 'yaml' | 'json' | 'raw';

/** Read-only formats of the selected State. Never reads HEAD or runs validation. */
export function StateCodeView({
  yamlText,
  branch,
  rootKey,
  commitHash,
}: {
  yamlText: string;
  branch: string;
  rootKey: string;
  commitHash: string;
}) {
  const [mode, setMode] = useState<CodeMode>('yaml');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const copySequence = useRef(0);
  const json = useMemo(() => {
    try {
      return {
        text: JSON.stringify(load(yamlText, { schema: JSON_SCHEMA }) ?? null, null, 2),
        error: null,
      };
    } catch {
      return {
        text: '',
        error: 'This State cannot be represented as JSON. YAML and Raw remain available.',
      };
    }
  }, [yamlText]);
  const text = mode === 'json' ? json.text : yamlText;
  const error = mode === 'json' ? json.error : null;
  const lines = text.split('\n');
  const search = searchOpen ? query.trim().toLowerCase() : '';
  const matches = search ? lines.filter((line) => line.toLowerCase().includes(search)).length : 0;

  useEffect(() => {
    if (searchOpen) input.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    copySequence.current += 1;
    setCopied(false);
    setCopyError(null);
  }, [commitHash, mode, yamlText]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    const sequence = ++copySequence.current;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      if (sequence === copySequence.current) setCopied(true);
    } catch {
      if (sequence === copySequence.current)
        setCopyError('Clipboard unavailable. Select and copy the code directly.');
    }
  }

  return (
    <section
      aria-label="YAML code view"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)]"
    >
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <Code2 aria-hidden="true" className="size-5 shrink-0 text-[var(--accent-commit)]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold leading-5">
            {rootKey}-state.{mode === 'json' ? 'json' : 'yaml'}
          </h2>
          <p
            className="truncate font-mono text-[12px] leading-[18px] text-[var(--text-tertiary)]"
            title={`${branch} · ${commitHash}`}
          >
            {branch} · {commitHash}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div
            role="toolbar"
            aria-label="Code format"
            className="inline-flex h-8 rounded-md border border-[var(--stroke-divider)] p-0.5"
          >
            {(['yaml', 'json', 'raw'] as const).map((format) => (
              <button
                key={format}
                type="button"
                aria-pressed={mode === format}
                onClick={() => setMode(format)}
                className={cn(
                  'rounded px-3 text-[12px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]',
                  mode === format && 'bg-[var(--surface-hover)] text-[var(--accent-commit)]'
                )}
              >
                {format === 'raw' ? 'Raw' : format.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={copied ? 'Copied code' : `Copy ${mode === 'json' ? 'JSON' : 'YAML'} code`}
            disabled={Boolean(error)}
            onClick={() => void copy()}
            className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--stroke-divider)] disabled:opacity-40"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label="Find in code"
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-[var(--stroke-divider)]"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-2">
          <input
            ref={input}
            aria-label="Find in code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 text-[13px]"
            placeholder="Find in code…"
          />
          <output className="shrink-0 text-[12px] text-[var(--text-tertiary)]">
            {matches} matching lines
          </output>
        </div>
      )}
      {(error || copyError) && (
        <p role="alert" className="px-4 py-2 text-[13px] text-[var(--status-danger)]">
          {error ?? copyError}
        </p>
      )}
      <StateScrollArea
        label={
          mode === 'json'
            ? 'JSON content'
            : mode === 'raw'
              ? 'Raw YAML content'
              : 'Canonical YAML content'
        }
        horizontal
        className="min-h-0 flex-1"
        viewportClassName="font-mono text-[13px] leading-[22px] text-[var(--text-primary)]"
      >
        <code className="block min-w-max py-3">
          {!error &&
            lines.map((line, index) => (
              <div
                key={`${index}:${line}`}
                className={cn(
                  'grid min-h-[22px] grid-cols-[48px_max-content]',
                  search && line.toLowerCase().includes(search) && 'bg-[var(--accent-commit-soft)]'
                )}
              >
                <span
                  aria-hidden="true"
                  className="sticky left-0 select-none border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-right text-[var(--text-tertiary)]"
                >
                  {index + 1}
                </span>
                <span className="whitespace-pre px-4">
                  {mode === 'raw' ? line : highlightLine(line)}
                </span>
              </div>
            ))}
        </code>
      </StateScrollArea>
      <footer className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--stroke-divider)] px-4 py-2 text-[12px] text-[var(--text-tertiary)]">
        <span>Selected commit</span>
        <span>{error ? 'JSON unavailable' : `${lines.length} lines`}</span>
        <span className="ml-auto font-mono">
          {mode === 'raw' ? 'RAW YAML' : mode === 'json' ? 'PARSED JSON' : 'CANONICAL YAML'}
        </span>
      </footer>
    </section>
  );
}

function highlightLine(line: string): ReactNode {
  // Cosmetic token coloring only. Preserve every character; React escapes the source.
  const match = line.match(/^(\s*(?:-\s+)?)("(?:[^"\\]|\\.)*"|[^:#]+)(:)(\s*)(.*)$/);
  if (!match) return line;
  return (
    <>
      {match[1]}
      <span className="font-semibold text-[var(--accent-commit)]">
        {match[2]}
        {match[3]}
      </span>
      {match[4]}
      {match[5]}
    </>
  );
}
