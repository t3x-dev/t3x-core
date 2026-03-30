'use client';

import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Project } from '@/lib/api';
import { listProjects } from '@/lib/api';
import type { SearchMode } from '@/lib/api/search';
import { cn } from '@/lib/utils';
import { useSearchStore } from '@/store/searchStore';

const MODES: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'semantic', label: 'Semantic' },
];

/** Highlight matched query terms in text by bolding them */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;

  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return <span>{text}</span>;

  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <span>
      {parts.map((part, i) => {
        const key = `${i}-${part}`;
        const isMatch = words.some((w) => part.toLowerCase() === w.toLowerCase());
        return isMatch ? (
          <strong key={key} className="text-[var(--text-primary)] font-semibold">
            {part}
          </strong>
        ) : (
          <span key={key}>{part}</span>
        );
      })}
    </span>
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function SearchPage() {
  const {
    query,
    mode,
    projectId,
    results,
    total,
    queryTimeMs,
    loading,
    error,
    searched,
    setQuery,
    setMode,
    setProjectId,
    search,
    reset,
  } = useSearchStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    listProjects(200, 0)
      .then((data) => setProjects(data.projects))
      .catch(() => {
        /* ignore project load errors */
      });
  }, []);

  // Debounced search on query change
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) return;
      debounceRef.current = setTimeout(() => {
        search();
      }, 300);
    },
    [setQuery, search]
  );

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (query.trim()) search();
  };

  const handleProjectChange = (value: string) => {
    setProjectId(value === '__all__' ? undefined : value);
    if (query.trim()) search();
  };

  const handleClear = () => {
    reset();
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text-primary)]">Search</h1>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search nodes across your knowledge base..."
          className="pl-10 pr-10 h-11 bg-[var(--surface-card)] border-[var(--stroke-divider)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-[var(--stroke-divider)] p-1 bg-[var(--surface-card)]">
          {MODES.map((m) => (
            <Button
              key={m.value}
              variant={mode === m.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleModeChange(m.value)}
              className={cn(
                'h-7 px-3 text-xs rounded-md',
                mode !== m.value && 'text-[var(--text-secondary)]'
              )}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {/* Project filter */}
        <Select value={projectId ?? '__all__'} onValueChange={handleProjectChange}>
          <SelectTrigger className="w-48 h-9 bg-[var(--surface-card)] border-[var(--stroke-divider)] text-sm text-[var(--text-secondary)]">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.project_id} value={p.project_id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-[var(--status-error)]/20 bg-[var(--status-error)]/5 px-4 py-3 text-sm text-[var(--status-error)]">
          {error.message}
        </div>
      )}

      {/* Empty state (not yet searched) */}
      {!searched && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-tertiary)]">
          <Search className="mb-3 h-10 w-10" />
          <p className="text-sm">Search your knowledge base</p>
        </div>
      )}

      {/* No results */}
      {searched && !loading && !error && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-tertiary)]">
          <p className="text-sm">No results found</p>
        </div>
      )}

      {/* Results list */}
      {!loading && !error && results.length > 0 && (
        <>
          <ul className="space-y-3">
            {results.map((hit) => (
              <li
                key={`${hit.commit_hash}-${hit.node_id}`}
                className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 transition-colors hover:border-[var(--stroke-default)]"
              >
                <p className="mb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  <HighlightedText text={hit.text} query={query} />
                </p>
                <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(hit.commit_hash)}
                    title="Copy commit hash"
                    className="font-mono hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  >
                    {hit.commit_hash.slice(0, 8)}
                  </button>
                  <span className="inline-flex items-center rounded-full bg-[var(--hover-bg)] px-2 py-0.5 font-mono">
                    {hit.score.toFixed(3)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Stats footer */}
          <p className="mt-4 text-center text-xs text-[var(--text-tertiary)]">
            {total} results in {queryTimeMs}ms
          </p>
        </>
      )}
    </div>
  );
}
