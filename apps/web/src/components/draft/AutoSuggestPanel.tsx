'use client';

/**
 * AutoSuggestPanel - Goal-driven node recommendations
 *
 * Uses pgvector similarity search to suggest relevant committed nodes
 * based on the draft's goal text. Part of Workbench V2 (RFC §4.4, §12.8).
 */

import { Lightbulb, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSuggestForDraft } from '@/hooks/drafts/useSuggestForDraft';
import { cn } from '@/utils/cn';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import type { SuggestResult } from '@/types/api';

export function AutoSuggestPanel() {
  const draftId = useDraftWorkspaceStore((s) => s.draftId);
  const draft = useDraftWorkspaceStore((s) => s.draft);
  const addManualNode = useDraftWorkspaceStore((s) => s.addManualNode);

  const [suggestions, setSuggestions] = useState<SuggestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { loadSuggestions } = useSuggestForDraft();

  const goal = draft?.goal;

  const fetchSuggestions = useCallback(async () => {
    if (!draftId || !goal) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await loadSuggestions(draftId, 10);
      setSuggestions(results);
    } catch (err) {
      if (err instanceof Error && err.message.includes('501')) {
        setError('Embedding service not configured');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load suggestions');
      }
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [draftId, goal, loadSuggestions]);

  // Fetch on mount + debounce on goal change
  useEffect(() => {
    if (!goal) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions();
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [goal, fetchSuggestions]);

  const handleAdd = useCallback(
    (nodeId: string, text: string) => {
      addManualNode(text);
      // Mark as added in suggestions list (match by ID, not text, to avoid false positives)
      setSuggestions((prev) =>
        prev.map((s) => (s.node_id === nodeId ? { ...s, already_in_draft: true } : s))
      );
    },
    [addManualNode]
  );

  if (!goal) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="h-4 w-4" />
          Set a goal to get node suggestions from your knowledge base.
        </div>
      </div>
    );
  }

  const activeSuggestions = suggestions.filter((s) => !s.already_in_draft);

  return (
    <section className="rounded-lg border border-border bg-[var(--surface-card)]">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">Suggestions</span>
        {activeSuggestions.length > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {activeSuggestions.length}
          </span>
        )}
        <div className="flex-1" />
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              fetchSuggestions();
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </Button>
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="border-t border-border px-4 py-3">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding relevant nodes...
            </div>
          )}

          {error && <p className="text-sm text-muted-foreground italic">{error}</p>}

          {!loading && !error && activeSuggestions.length === 0 && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No matching nodes found. Commit more knowledge to improve suggestions.
            </p>
          )}

          {!loading && !error && activeSuggestions.length === 0 && suggestions.length > 0 && (
            <p className="text-sm text-muted-foreground italic">
              All suggestions already added to draft.
            </p>
          )}

          {activeSuggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                Based on your goal: &ldquo;{goal.length > 60 ? `${goal.slice(0, 60)}...` : goal}
                &rdquo;
              </p>
              {activeSuggestions.map((s) => (
                <div
                  key={s.node_id}
                  className={cn(
                    'flex items-start gap-2 rounded-md border border-border/50 px-3 py-2',
                    'hover:border-border hover:bg-muted/30 transition-colors'
                  )}
                >
                  <span className="shrink-0 mt-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-mono text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {Math.round(s.similarity * 100)}%
                  </span>
                  <p className="flex-1 text-sm text-foreground leading-snug line-clamp-2">
                    {s.text}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 gap-1 text-xs"
                    onClick={() => handleAdd(s.node_id, s.text)}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
