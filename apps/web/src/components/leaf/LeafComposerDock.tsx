'use client';

import { CheckCircle, Grid2x2, Loader2, Play, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompareModelsDialog } from '@/components/leaf/CompareModelsDialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProvidersList } from '@/hooks/useProvidersList';
import { cn } from '@/utils/cn';

interface LeafComposerDockProps {
  leafId: string;
  instruction: string;
  currentModel: string | undefined;
  hasOutput: boolean;
  saving: boolean;
  savingInstruction: boolean;
  savingModel: boolean;
  modelError: string | null;
  isGenerating: boolean;
  isValidating: boolean;
  generatePhase: number;
  generateProgressMessages: string[];
  onUpdateInstruction: (instruction: string) => Promise<void>;
  onUpdateModel: (model: string | undefined) => Promise<void>;
  onGenerate: () => Promise<void>;
  onValidate: () => Promise<void>;
  onSuggestOpen: () => void;
  className?: string;
}

interface ModelOption {
  providerId: string;
  providerName: string;
  model: string;
}

export function LeafComposerDock({
  leafId,
  instruction,
  currentModel,
  hasOutput,
  saving: _saving,
  savingInstruction,
  savingModel,
  modelError,
  isGenerating,
  isValidating,
  generatePhase,
  generateProgressMessages,
  onUpdateInstruction,
  onUpdateModel,
  onGenerate,
  onValidate,
  onSuggestOpen,
  className,
}: LeafComposerDockProps) {
  const [value, setValue] = useState(instruction);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const savedFeedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [compareOpen, setCompareOpen] = useState(false);

  // Provider/model state
  const { providers, loading: loadingProviders } = useProvidersList();

  // Sync with prop changes
  useEffect(() => {
    setValue(instruction);
  }, [instruction]);

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

  // Auto-save on blur with debounce
  const handleBlur = useCallback(() => {
    if (value === instruction) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await onUpdateInstruction(value);
      setSavedFeedback(true);
      clearTimeout(savedFeedbackTimer.current);
      savedFeedbackTimer.current = setTimeout(() => setSavedFeedback(false), 1500);
    }, 500);
  }, [value, instruction, onUpdateInstruction]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearTimeout(savedFeedbackTimer.current);
    };
  }, []);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value === '__default__' ? undefined : e.target.value;
      onUpdateModel(model);
    },
    [onUpdateModel]
  );

  return (
    <div
      className={cn(
        'shrink-0 border-t px-6 py-3',
        'bg-[color-mix(in_srgb,var(--surface-panel)_92%,transparent)]',
        'backdrop-blur-[6px]',
        className
      )}
    >
      <div className="overflow-hidden rounded-xl border border-[var(--stroke-default)] bg-card transition-colors focus-within:border-[var(--accent-leaf)]">
        {/* Textarea */}
        <textarea
          className={cn(
            'w-full resize-none border-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none',
            'placeholder:text-[var(--text-tertiary)]',
            'min-h-[44px] max-h-[120px]'
          )}
          placeholder="Generation instructions..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          disabled={savingInstruction}
          rows={2}
        />

        {/* Action bar */}
        <div className="flex items-center gap-1 border-t border-[var(--stroke-divider)] px-2.5 py-1.5">
          {/* Model selector */}
          {loadingProviders ? (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          ) : modelOptions.length > 0 ? (
            <select
              className="cursor-pointer border-none bg-transparent text-[11px] text-[var(--text-tertiary)] outline-none font-inherit min-w-[140px]"
              value={currentModel ?? '__default__'}
              onChange={handleModelChange}
              disabled={savingModel}
            >
              <option value="__default__">Default model</option>
              {modelOptions.map((opt) => (
                <option key={`${opt.providerId}:${opt.model}`} value={opt.model}>
                  {opt.model}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-[var(--text-tertiary)]">No models</span>
          )}

          {/* Saving indicators */}
          {savingInstruction && (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
          )}
          {savedFeedback && <span className="text-[10px] text-[var(--status-success)]">Saved</span>}
          {modelError && <span className="text-[10px] text-destructive">{modelError}</span>}

          <span className="flex-1" />

          {/* Compare models */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCompareOpen(true)}
              >
                <Grid2x2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Compare models</TooltipContent>
          </Tooltip>

          {/* Suggest constraints */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSuggestOpen}>
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Suggest constraints</TooltipContent>
          </Tooltip>

          {/* Validate */}
          {hasOutput && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onValidate}
                  disabled={isValidating}
                >
                  {isValidating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isValidating ? 'Validating...' : 'Validate'}</TooltipContent>
            </Tooltip>
          )}

          {/* Divider */}
          <div className="mx-0.5 h-5 w-px bg-[var(--stroke-divider)]" />

          {/* Generate button — primary */}
          <Button
            size="sm"
            className="h-7 gap-1.5 rounded-lg bg-[var(--accent-leaf)] text-white text-xs font-semibold hover:brightness-110"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {generateProgressMessages[generatePhase]}
              </>
            ) : (
              <>
                <Play className="h-3 w-3" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Compare Models Dialog */}
      <CompareModelsDialog open={compareOpen} onOpenChange={setCompareOpen} leafId={leafId} />
    </div>
  );
}
