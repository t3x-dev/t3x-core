'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompareModels } from '@/hooks/shared/useCompareModels';
import { useProvidersList } from '@/hooks/shared/useProvidersList';
import { cn } from '@/utils/cn';
import type { CompareModelsResult } from '@/types/api';

interface CompareModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leafId: string;
}

interface ModelOption {
  providerId: string;
  providerName: string;
  model: string;
}

export function CompareModelsDialog({ open, onOpenChange, leafId }: CompareModelsDialogProps) {
  const { providers, loading: loadingProviders } = useProvidersList({ enabled: open });
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState<CompareModelsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { compare } = useCompareModels();

  const modelOptions = useMemo(() => {
    const options: ModelOption[] = [];
    const seen = new Set<string>();
    for (const p of providers) {
      if (!p.configured || !p.roles?.includes('generation')) continue;
      if (p.available_models) {
        for (const m of p.available_models) {
          if (!seen.has(m)) {
            seen.add(m);
            options.push({ providerId: p.id, providerName: p.name, model: m });
          }
        }
      }
    }
    return options;
  }, [providers]);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else if (next.size < 3) {
        next.add(model);
      }
      return next;
    });
  };

  const handleCompare = useCallback(async () => {
    if (selectedModels.size === 0) return;
    setComparing(true);
    setError(null);
    setResults(null);

    try {
      const result = await compare(leafId, Array.from(selectedModels));
      setResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }, [leafId, selectedModels, compare]);

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClose = () => {
    if (!comparing) {
      setResults(null);
      setError(null);
      setSelectedModels(new Set());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Compare Models</DialogTitle>
          <DialogDescription>
            Select up to 3 models to generate output in parallel for side-by-side comparison.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          /* Model Selection Phase */
          <div className="space-y-4">
            {loadingProviders ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading available models...
              </div>
            ) : modelOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No LLM providers configured. Configure providers in Settings first.
              </p>
            ) : (
              <>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {modelOptions.map((opt) => {
                    const isDisabled = selectedModels.size >= 3 && !selectedModels.has(opt.model);
                    return (
                      <button
                        type="button"
                        key={`${opt.providerId}:${opt.model}`}
                        onClick={() => !isDisabled && toggleModel(opt.model)}
                        disabled={isDisabled}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors w-full text-left',
                          selectedModels.has(opt.model)
                            ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/5'
                            : 'border-[var(--stroke-divider)] hover:bg-muted/50',
                          isDisabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <Checkbox
                          checked={selectedModels.has(opt.model)}
                          onCheckedChange={() => toggleModel(opt.model)}
                          disabled={isDisabled}
                        />
                        <div>
                          <div className="text-sm font-medium">{opt.model}</div>
                          <div className="text-xs text-muted-foreground">{opt.providerName}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {selectedModels.size}/3 models selected
                  </span>
                  <Button onClick={handleCompare} disabled={selectedModels.size === 0 || comparing}>
                    {comparing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Generating...
                      </>
                    ) : (
                      `Compare ${selectedModels.size} Model${selectedModels.size !== 1 ? 's' : ''}`
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Results Phase */
          <div className="flex-1 overflow-y-auto">
            <div
              className={cn(
                'grid gap-4',
                results.results.length === 1 && 'grid-cols-1',
                results.results.length === 2 && 'grid-cols-2',
                results.results.length >= 3 && 'grid-cols-3'
              )}
            >
              {results.results.map((r, i) => (
                <div
                  key={r.model}
                  className="rounded-lg border border-[var(--stroke-divider)] flex flex-col"
                >
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <div>
                      <div className="text-sm font-medium truncate">{r.model}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : (
                          `${(r.latency_ms / 1000).toFixed(1)}s`
                        )}
                      </div>
                    </div>
                    {r.output && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy(r.output!, i)}
                      >
                        {copiedIndex === i ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="p-3 text-sm overflow-y-auto max-h-80 whitespace-pre-wrap">
                    {r.output ?? (
                      <span className="text-muted-foreground italic">No output generated</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null);
                  setSelectedModels(new Set());
                }}
              >
                Compare Again
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
