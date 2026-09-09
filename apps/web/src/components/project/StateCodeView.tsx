'use client';

import { JSON_SCHEMA, load } from 'js-yaml';
import { Check, Code2, Copy, GitBranch, Search } from 'lucide-react';
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

  const fileName = `${rootKey}-state.${mode === 'json' ? 'json' : 'yaml'}`;

  return (
    <section
      aria-label="YAML code view"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-panel)]"
    >
      <header className="flex min-h-[64px] shrink-0 flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
          <Code2 aria-hidden="true" className="size-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold leading-5 text-[var(--text-primary)]">
            {fileName}
          </h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs leading-[18px] text-[var(--text-tertiary)]">
            <GitBranch aria-hidden="true" className="size-3" />
            <span className="truncate font-mono">{branch}</span>
            <span aria-hidden="true" className="text-[var(--text-quaternary)]">
              /
            </span>
            <span className="truncate font-mono">{rootKey}</span>
            <span aria-hidden="true" className="text-[var(--text-quaternary)]">
              /
            </span>
            <span className="truncate font-mono">{fileName}</span>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div
            aria-label="Code format"
            className="hidden h-8 items-center rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-app)] p-[2px] text-xs font-medium leading-4 sm:inline-flex"
            role="toolbar"
          >
            {(['yaml', 'json', 'raw'] as const).map((format) => (
              <button
                aria-pressed={mode === format}
                className={cn(
                  'h-full rounded-[4px] px-3 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]',
                  mode === format &&
                    'border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                )}
                key={format}
                onClick={() => setMode(format)}
                type="button"
              >
                {format === 'raw' ? 'Raw' : format.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            aria-label={copied ? 'Copied code' : `Copy ${mode === 'json' ? 'JSON' : 'YAML'} code`}
            className="inline-flex size-8 items-center justify-center rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
            disabled={Boolean(error)}
            onClick={() => void copy()}
            title={copied ? 'Copied' : 'Copy code'}
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3.5 text-[var(--status-success)]" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )}
          </button>
          <button
            aria-label="Find in code"
            aria-pressed={searchOpen}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
              searchOpen && 'border-[var(--accent-commit)]/40 text-[var(--accent-commit)]'
            )}
            onClick={() => setSearchOpen((open) => !open)}
            title="Find in code"
            type="button"
          >
            <Search aria-hidden="true" className="size-3.5" />
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
        className="min-h-0 min-w-0 flex-1 bg-[var(--editor-bg)]"
        viewportClassName="font-mono text-[13px] leading-[22px] text-[var(--text-primary)]"
      >
        <code className="block min-w-max py-4 pr-6">
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
                  className="sticky left-0 select-none border-r border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3 text-right text-[var(--text-tertiary)]"
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
