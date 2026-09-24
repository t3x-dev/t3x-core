'use client';

import { JSON_SCHEMA, load } from 'js-yaml';
import { Check, ChevronDown, ChevronUp, Copy, Info, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/components/project/StateCodeView.module.css';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { cn } from '@/utils/cn';

type CodeMode = 'yaml' | 'json' | 'raw';

/** Read-only formats of the selected State. Never reads HEAD or runs validation. */
export function StateCodeView({
  yamlText,
  commitHash,
}: {
  yamlText: string;
  branch: string;
  rootKey: string;
  commitHash: string;
}) {
  const [mode, setMode] = useState<CodeMode>('yaml');
  const [searchOpen, setSearchOpen] = useState(true);
  const [query, setQuery] = useState('allocation');
  const [activeMatch, setActiveMatch] = useState(0);
  const [wrapLines, setWrapLines] = useState(true);
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
  const matchingLines = useMemo(
    () =>
      search
        ? lines.reduce<number[]>((results, line, index) => {
            if (line.toLowerCase().includes(search)) results.push(index);
            return results;
          }, [])
        : [],
    [lines, search]
  );
  const matches = matchingLines.length;

  useEffect(() => {
    if (searchOpen) input.current?.focus();
  }, [searchOpen]);
  useEffect(() => setActiveMatch(0), [mode, query, yamlText]);
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

  async function copyRevision() {
    try {
      await navigator.clipboard.writeText(commitHash);
    } catch {
      setCopyError('Clipboard unavailable. Select and copy the revision directly.');
    }
  }

  function moveMatch(direction: -1 | 1) {
    if (!matches) return;
    setActiveMatch((current) => (current + direction + matches) % matches);
  }

  const shortHash = commitHash.replace(/^sha256:/, '').slice(0, 7);
  const modeLabel = mode === 'raw' ? 'Plain YAML' : mode.toUpperCase();

  return (
    <section
      aria-label="YAML code view"
      className={cn(styles.root, 'min-h-0 flex-1 overflow-hidden')}
    >
      <div className={styles.card}>
        <header className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <h2>State source</h2>
            <span className={styles.readOnly}>Read-only</span>
          </div>

          <div className={styles.controls}>
            <div aria-label="Code format" className={styles.formatTabs} role="toolbar">
              {(['yaml', 'json', 'raw'] as const).map((format) => (
                <button
                  aria-label={format === 'raw' ? 'Raw' : undefined}
                  aria-pressed={mode === format}
                  className={cn(styles.formatButton, mode === format && styles.formatButtonActive)}
                  key={format}
                  onClick={() => setMode(format)}
                  type="button"
                >
                  {format === 'raw' ? 'Plain YAML' : format.toUpperCase()}
                </button>
              ))}
            </div>
            <span aria-hidden="true" className={styles.separator} />
            <label className={styles.wrapControl}>
              <span>Wrap lines</span>
              <button
                aria-label="Wrap lines"
                aria-pressed={wrapLines}
                className={cn(styles.switch, wrapLines && styles.switchOn)}
                onClick={() => setWrapLines((value) => !value)}
                type="button"
              >
                <span />
              </button>
            </label>
            <button
              aria-label={copied ? 'Copied code' : `Copy ${mode === 'json' ? 'JSON' : 'YAML'} code`}
              className={styles.copyButton}
              disabled={Boolean(error)}
              onClick={() => void copy()}
              type="button"
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              aria-label="Find in code"
              className={cn(styles.findButton, searchOpen && 'sr-only')}
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" />
            </button>
          </div>
        </header>

        {searchOpen ? (
          <div className={styles.searchRow}>
            <div className={styles.searchField}>
              <Search aria-hidden="true" />
              <input
                ref={input}
                aria-label="Find in code"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find in code…"
              />
            </div>
            <output className={styles.matchCount}>
              {matches ? `${Math.min(activeMatch + 1, matches)} of ${matches}` : '0 of 0'}
              <span className="sr-only">{matches} matching lines</span>
            </output>
            <div className={styles.matchButtons}>
              <button aria-label="Previous match" onClick={() => moveMatch(-1)} type="button">
                <ChevronUp aria-hidden="true" />
              </button>
              <button aria-label="Next match" onClick={() => moveMatch(1)} type="button">
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
            <span aria-hidden="true" className={styles.separator} />
            <button
              aria-label="Close search"
              className={styles.closeSearch}
              onClick={() => setSearchOpen(false)}
              type="button"
            >
              <X aria-hidden="true" />
              <span>Close</span>
            </button>
          </div>
        ) : null}

        {(error || copyError) && (
          <p role="alert" className={styles.error}>
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
          className={cn(styles.codeArea, 'min-h-0 flex-1')}
          viewportClassName={styles.viewport}
        >
          <code className={cn(styles.code, 'min-w-max')}>
            {!error &&
              lines.map((line, index) => (
                <div className={styles.codeLine} key={`${index}:${line}`}>
                  <span aria-hidden="true" className={styles.lineNumber}>
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      styles.lineText,
                      'whitespace-pre',
                      wrapLines && styles.lineTextWrapped
                    )}
                  >
                    {mode === 'raw' ? markSearch(line, search) : highlightLine(line, mode, search)}
                  </span>
                </div>
              ))}
          </code>
        </StateScrollArea>

        <div className={styles.statusRow}>
          <span>{modeLabel === 'YAML' ? 'Canonical YAML' : modeLabel}</span>
          <span aria-hidden="true">·</span>
          <span>Read-only</span>
          <span className={styles.revision}>
            Revision <code>{shortHash}</code>
            <button
              aria-label="Copy revision hash"
              onClick={() => void copyRevision()}
              type="button"
            >
              <Copy aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className={styles.noteRow}>
          <span className={styles.infoIcon}>
            <Info aria-hidden="true" />
          </span>
          <span>Plain YAML shows the same YAML without syntax highlighting.</span>
          <span className={styles.proposeNote}>
            Propose a change to update this committed state.
          </span>
        </div>
      </div>
    </section>
  );
}

function highlightLine(line: string, mode: CodeMode, search: string): ReactNode {
  if (mode === 'json') return highlightJsonLine(line, search);
  const match = line.match(/^(\s*(?:-\s+)?)("(?:[^"\\]|\\.)*"|[^:#]+)(:)(\s*)(.*)$/);
  if (!match) return markSearch(line, search);
  return (
    <>
      {match[1]}
      <span className={styles.key}>{markSearch(`${match[2]}${match[3]}`, search)}</span>
      {match[4]}
      <span className={valueClass(match[5])}>{markSearch(match[5], search)}</span>
    </>
  );
}

function highlightJsonLine(line: string, search: string): ReactNode {
  const match = line.match(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)?(.*)$/);
  if (!match) return markSearch(line, search);
  return (
    <>
      {match[1]}
      <span className={match[3] ? styles.key : styles.stringValue}>
        {markSearch(match[2], search)}
      </span>
      {match[3]}
      <span className={valueClass(match[4])}>{markSearch(match[4], search)}</span>
    </>
  );
}

function valueClass(value: string): string | undefined {
  const clean = value.replace(/,$/, '').trim();
  if (/^(true|false)$/.test(clean)) return styles.booleanValue;
  if (clean === 'null') return styles.nullValue;
  if (/^-?\d+(?:\.\d+)?$/.test(clean)) return styles.numberValue;
  if (/^".*"$/.test(clean)) return styles.stringValue;
  return undefined;
}

function markSearch(text: string, search: string): ReactNode {
  if (!search) return text;
  const index = text.toLowerCase().indexOf(search);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className={styles.searchMatch}>{text.slice(index, index + search.length)}</mark>
      {text.slice(index + search.length)}
    </>
  );
}
