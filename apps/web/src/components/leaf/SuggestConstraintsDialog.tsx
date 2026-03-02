'use client';

/**
 * SuggestConstraintsDialog — Two-phase dialog for AI constraint suggestions.
 *
 * Phase 1: Loading (LLM analyzing leaf content)
 * Phase 2: Results list with checkboxes to accept/reject suggestions
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type SuggestedConstraint, suggestLeafConstraints } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SuggestConstraintsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leafId: string;
  onAccept: (constraints: SuggestedConstraint[]) => void;
}

export function SuggestConstraintsDialog({
  open,
  onOpenChange,
  leafId,
  onAccept,
}: SuggestConstraintsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedConstraint[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch suggestions when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(new Set());

    suggestLeafConstraints(leafId)
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result.suggestions);
        // Select all by default
        setSelected(new Set(result.suggestions.map((_, i) => i)));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to get suggestions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, leafId]);

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAccept = useCallback(() => {
    const accepted = suggestions.filter((_, i) => selected.has(i));
    onAccept(accepted);
    onOpenChange(false);
  }, [suggestions, selected, onAccept, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Suggest Constraints
          </DialogTitle>
          <DialogDescription>
            AI-analyzed constraints based on the leaf&apos;s commit content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {/* Loading phase */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Analyzing content...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Results */}
          {!loading && !error && suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div
                  key={`${s.type}-${s.value.slice(0, 20)}-${i}`}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    selected.has(i)
                      ? 'border-border bg-[var(--surface-card)]'
                      : 'border-border/50 opacity-60'
                  )}
                >
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={() => toggleItem(i)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          s.type === 'require'
                            ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                            : 'border-red-500/50 text-red-600 dark:text-red-400'
                        )}
                      >
                        {s.type}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {s.match_mode}
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-sm">{s.value}</p>
                    {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {!loading && !error && suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No suggestions available.
            </p>
          )}
        </div>

        {!loading && suggestions.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAccept} disabled={selected.size === 0}>
              Accept {selected.size} Selected
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
