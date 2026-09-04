'use client';

import * as yaml from 'js-yaml';
import { Check, Code2, Copy, GitBranch, Search } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { type StateYamlReviewLine, stateYamlLinePaths } from '@/domain/diff/stateYamlReview';
import { cn } from '@/utils/cn';

export interface StateCodeReview {
  lines: StateYamlReviewLine[];
  selectedPath?: string;
  onSelectPath: (path: string) => void;
  statusLabel: string;
}

type StateCodeMode = 'json' | 'raw' | 'yaml';

const STATE_CODE_MODES: Array<{ id: StateCodeMode; label: string }> = [
  { id: 'yaml', label: 'YAML' },
  { id: 'json', label: 'JSON' },
  { id: 'raw', label: 'Raw' },
];

export function StateCodeView({
  branch,
  rootKey,
  validationReady,
  yamlText,
  review,
}: {
  branch: string;
  rootKey: string;
  validationReady: boolean;
  yamlText: string;
  review?: StateCodeReview;
}) {
  const [codeMode, setCodeMode] = useState<StateCodeMode>('yaml');
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const jsonText = useMemo(() => {
    try {
      return JSON.stringify(yaml.load(yamlText) ?? null, null, 2);
    } catch {
      return JSON.stringify({ error: 'Unable to parse canonical YAML.' }, null, 2);
    }
  }, [yamlText]);
  const reviewLines = useMemo(() => {
    if (!review) return undefined;
    if (codeMode !== 'json') return review.lines;
    const paths = stateYamlLinePaths(jsonText);
    return jsonText.split('\n').map((text, index) => ({
      text,
      path: paths[index],
      kind: 'unchanged' as const,
    }));
  }, [codeMode, jsonText, review?.lines]);
  const displayText = reviewLines
    ? reviewLines.map((line) => line.text).join('\n')
    : codeMode === 'json'
      ? jsonText
      : yamlText;
  const lines = displayText.split('\n');
  const selectedIndex =
    reviewLines?.findIndex(
      (line) => line.path === review?.selectedPath && line.kind !== 'removed'
    ) ?? -1;
  const activeLine =
    selectedIndex >= 0
      ? selectedIndex
      : (reviewLines?.findIndex((line) => line.path === review?.selectedPath) ?? -1);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchCount = normalizedSearchQuery
    ? lines.filter((line) => line.toLowerCase().includes(normalizedSearchQuery)).length
    : 0;
  const fileName = `${rootKey}-state.${codeMode === 'json' ? 'json' : 'yaml'}`;
  const codeKindLabel =
    review && codeMode !== 'json'
      ? 'YAML DIFF'
      : codeMode === 'json'
        ? 'PARSED JSON'
        : codeMode === 'raw'
          ? 'RAW YAML'
          : 'CANONICAL YAML';

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (review)
      codeRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView?.({
        block: 'nearest',
        inline: 'nearest',
      });
  }, [activeLine, codeMode, review?.selectedPath]);

  const handleCopyCode = useCallback(async () => {
    // A unified diff is not valid YAML. Copy the actual result, never the merged before/after lines.
    await navigator.clipboard.writeText(codeMode === 'json' ? jsonText : yamlText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [codeMode, jsonText, yamlText]);

  return (
    <section
      aria-label="YAML code view"
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-app)]',
        !review && 'p-4'
      )}
    >
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]',
          !review && 'rounded-md border border-[var(--stroke-divider)] shadow-[var(--fx-shadow-sm)]'
        )}
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
              {STATE_CODE_MODES.map((mode) => (
                <button
                  aria-pressed={codeMode === mode.id}
                  className={cn(
                    'h-full rounded-[4px] px-3 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]',
                    codeMode === mode.id &&
                      'border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                  )}
                  key={mode.id}
                  onClick={() => setCodeMode(mode.id)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button
              aria-label={
                copied
                  ? 'Copied code'
                  : `Copy ${codeMode === 'json' ? 'JSON' : 'YAML'} ${review ? 'result' : 'code'}`
              }
              className="inline-flex size-8 items-center justify-center rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              onClick={() => void handleCopyCode()}
              title={copied ? 'Copied' : review ? 'Copy result' : 'Copy code'}
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

        {searchOpen ? (
          <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-5 py-2">
            <label className="group relative h-8 w-[min(360px,42vw)] min-w-[220px] rounded-[5px] bg-[var(--surface-app)] p-[2px] transition-colors focus-within:bg-[var(--accent-commit)]/10">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--accent-commit)]"
              />
              <input
                className="h-full w-full rounded-[4px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] pl-8 pr-3 font-mono text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find in code..."
                ref={searchInputRef}
                value={searchQuery}
              />
            </label>
            <span className="font-mono text-xs leading-4 text-[var(--text-tertiary)]">
              {normalizedSearchQuery ? `${String(matchCount)} matches` : 'No query'}
            </span>
          </div>
        ) : null}

        <StateScrollArea
          className="min-h-0 min-w-0 flex-1 bg-[var(--editor-bg)]"
          horizontal
          label={codeMode === 'json' ? 'JSON code content' : 'Canonical YAML content'}
          viewportClassName="font-mono text-[13px] leading-[22px] text-[var(--text-primary)]"
        >
          <code className="block min-w-max py-4 pr-6" ref={codeRef}>
            {lines.map((line, index) => {
              const highlightedBySearch =
                Boolean(normalizedSearchQuery) &&
                line.toLowerCase().includes(normalizedSearchQuery);
              const meta = reviewLines?.[index];
              const selectable = Boolean(meta?.path && review);
              const Line = selectable ? 'button' : 'span';
              return (
                <Line
                  aria-label={
                    selectable ? `Select code path ${meta?.path}, line ${index + 1}` : undefined
                  }
                  aria-pressed={selectable ? activeLine === index : undefined}
                  data-selected={review && activeLine === index ? 'true' : undefined}
                  data-diff-kind={meta?.kind}
                  type={selectable ? 'button' : undefined}
                  onClick={
                    selectable
                      ? () => {
                          if (meta?.path) review?.onSelectPath(meta.path);
                        }
                      : undefined
                  }
                  className={cn(
                    'group grid min-h-[22px] grid-cols-[52px_max-content] transition-colors hover:bg-[var(--surface-hover)]',
                    meta?.kind === 'added' && 'bg-[var(--diff-added-bg)]',
                    meta?.kind === 'removed' && 'bg-[var(--diff-removed-bg)]',
                    selectable &&
                      'w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-commit)]',
                    (highlightedBySearch || (review && activeLine === index)) &&
                      'bg-[var(--accent-commit-soft)]'
                  )}
                  key={String(index)}
                >
                  <span className="sticky left-0 z-10 select-none border-r border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3 text-right text-[var(--text-quaternary)] transition-colors group-hover:text-[var(--text-tertiary)]">
                    {index + 1}
                  </span>
                  <span className="relative whitespace-pre pl-5 pr-8">
                    {meta && meta.kind !== 'unchanged' ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute left-1',
                          meta.kind === 'added'
                            ? 'text-[var(--diff-added-text)]'
                            : 'text-[var(--diff-removed-text)]'
                        )}
                      >
                        {meta.kind === 'added' ? '+' : '−'}
                      </span>
                    ) : null}
                    {codeMode === 'raw'
                      ? line
                      : codeMode === 'json'
                        ? renderHighlightedJsonLine(line, index)
                        : renderHighlightedYamlLine(line, index)}
                  </span>
                </Line>
              );
            })}
          </code>
        </StateScrollArea>

        <footer className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-1 text-xs leading-4 text-[var(--text-tertiary)]">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              validationReady ? 'text-[var(--status-success)]' : 'text-[var(--text-tertiary)]'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                validationReady ? 'bg-[var(--status-success)]' : 'bg-[var(--text-tertiary)]'
              )}
            />
            {review?.statusLabel ?? (validationReady ? 'Valid Schema' : 'Schema pending')}
          </span>
          <span className="hidden h-4 w-px bg-[var(--stroke-divider)] sm:block" />
          <span>Indentation: 2 spaces</span>
          <span className="hidden sm:inline">{String(lines.length)} lines</span>
          <span className="ml-auto rounded-[4px] bg-[var(--surface-app)] px-2 py-0.5 font-mono text-xs font-semibold leading-4 text-[var(--text-tertiary)]">
            {codeKindLabel}
          </span>
          <span className="font-mono text-xs">{formatCodeSize(displayText)}</span>
        </footer>
      </div>
    </section>
  );
}

function renderHighlightedYamlLine(line: string, lineIndex: number): ReactNode {
  if (!line) return null;
  const commentLine = line.match(/^(\s*)(#.*)$/);
  if (commentLine) {
    return (
      <>
        {commentLine[1]}
        <span className="italic text-[var(--yaml-comment)]">{commentLine[2]}</span>
      </>
    );
  }

  const keyLine = line.match(/^(\s*)(-\s+)?([^:#\s][^:#]*?)(:)(\s*)(.*)$/);
  if (keyLine) {
    const [, indent, listMarker = '', key, colon, gap, value] = keyLine;
    return (
      <>
        {indent}
        {listMarker ? <span className="text-[var(--yaml-punctuation)]">{listMarker}</span> : null}
        <span className="font-semibold text-[var(--yaml-key)]">{key.trimEnd()}</span>
        <span className="text-[var(--yaml-punctuation)]">{colon}</span>
        {gap}
        {renderHighlightedYamlValue(value, `yaml-${String(lineIndex)}`)}
      </>
    );
  }

  const listValue = line.match(/^(\s*)(-\s+)(.*)$/);
  if (listValue) {
    const [, indent, listMarker, value] = listValue;
    return (
      <>
        {indent}
        <span className="text-[var(--yaml-punctuation)]">{listMarker}</span>
        {renderHighlightedYamlValue(value, `yaml-list-${String(lineIndex)}`)}
      </>
    );
  }

  return <span className="text-[var(--text-primary)]">{line}</span>;
}

function renderHighlightedYamlValue(value: string, keyPrefix: string): ReactNode {
  if (!value) return null;
  const { code, comment } = splitInlineComment(value);
  const leadingSpace = code.match(/^\s*/)?.[0] ?? '';
  const rawValue = code.slice(leadingSpace.length);
  const className = yamlValueClassName(rawValue);

  return (
    <>
      {leadingSpace}
      {rawValue ? (
        <span className={className} key={`${keyPrefix}-value`}>
          {rawValue}
        </span>
      ) : null}
      {comment ? (
        <span className="italic text-[var(--yaml-comment)]" key={`${keyPrefix}-comment`}>
          {comment}
        </span>
      ) : null}
    </>
  );
}

function renderHighlightedJsonLine(line: string, lineIndex: number): ReactNode {
  if (!line) return null;
  const keyLine = line.match(/^(\s*)("[^"]+")(:)(\s*)(.*)$/);
  if (keyLine) {
    const [, indent, key, colon, gap, value] = keyLine;
    return (
      <>
        {indent}
        <span className="font-semibold text-[var(--yaml-key)]">{key}</span>
        <span className="text-[var(--yaml-punctuation)]">{colon}</span>
        {gap}
        {renderHighlightedJsonValue(value, `json-${String(lineIndex)}`)}
      </>
    );
  }
  return renderHighlightedJsonValue(line, `json-line-${String(lineIndex)}`);
}

function renderHighlightedJsonValue(value: string, keyPrefix: string): ReactNode {
  const leadingSpace = value.match(/^\s*/)?.[0] ?? '';
  const rawValue = value.slice(leadingSpace.length);
  if (!rawValue) return leadingSpace;
  const hasComma = rawValue.endsWith(',');
  const valueBody = hasComma ? rawValue.slice(0, -1) : rawValue;
  return (
    <>
      {leadingSpace}
      <span className={jsonValueClassName(valueBody)} key={`${keyPrefix}-value`}>
        {valueBody}
      </span>
      {hasComma ? (
        <span className="text-[var(--yaml-punctuation)]" key={`${keyPrefix}-comma`}>
          ,
        </span>
      ) : null}
    </>
  );
}

function splitInlineComment(value: string): { code: string; comment: string } {
  if (value.trimStart().startsWith('#')) return { code: '', comment: value };
  const match = value.match(/(\s+#.*)$/);
  if (!match?.index) return { code: value, comment: '' };
  return {
    code: value.slice(0, match.index),
    comment: value.slice(match.index),
  };
}

function yamlValueClassName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'text-[var(--text-primary)]';
  if (/^["'].*["']$/.test(trimmed)) return 'text-[var(--yaml-string)]';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'text-[var(--yaml-number)]';
  if (/^(true|false|null|~)$/i.test(trimmed)) return 'text-[var(--yaml-ref)]';
  if (/^[&*]/.test(trimmed)) return 'text-[var(--yaml-ref)]';
  const first = trimmed.at(0);
  const last = trimmed.at(-1);
  if (
    ['[', ']', '{', '}'].includes(trimmed) ||
    ((first === '[' || first === '{') && (last === ']' || last === '}'))
  ) {
    return 'text-[var(--yaml-bracket)]';
  }
  return 'text-[var(--yaml-string)]';
}

function jsonValueClassName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'text-[var(--text-primary)]';
  if (/^".*"$/.test(trimmed)) return 'text-[var(--yaml-string)]';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'text-[var(--yaml-number)]';
  if (/^(true|false|null)$/i.test(trimmed)) return 'text-[var(--yaml-ref)]';
  const first = trimmed.at(0);
  const last = trimmed.at(-1);
  if (
    ['[', ']', '{', '}'].includes(trimmed) ||
    ((first === '[' || first === '{') && (last === ']' || last === '}'))
  ) {
    return 'text-[var(--yaml-bracket)]';
  }
  return 'text-[var(--text-primary)]';
}

function formatCodeSize(value: string): string {
  const bytes = value.length;
  if (bytes < 1024) return `${String(bytes)} B`;
  const size = bytes / 1024;
  return `${size < 10 ? size.toFixed(1) : size.toFixed(0)} KB`;
}
