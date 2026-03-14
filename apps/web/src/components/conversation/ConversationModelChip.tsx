'use client';

import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAvailableModels, updateConversation } from '@/lib/api';
import type { LLMProviderInfo } from '@/lib/api/types';

interface ConversationModelChipProps {
  conversationId: string;
  provider?: string | null;
  model?: string | null;
  onUpdated?: (provider: string | null, model: string | null) => void;
}

function useModelLabel(provider: string | null | undefined, model: string | null | undefined) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!provider && !model) {
      setLabel(null);
      return;
    }
    getAvailableModels()
      .then((res: { providers: LLMProviderInfo[] }) => {
        const providerInfo = res.providers.find((p) => p.name === provider);
        const modelInfo = providerInfo?.models.find((m) => m.id === model);
        if (modelInfo) {
          setLabel(modelInfo.label);
        } else if (providerInfo) {
          setLabel(providerInfo.label);
        } else {
          setLabel(model ?? provider ?? null);
        }
      })
      .catch(() => {
        setLabel(model ?? provider ?? null);
      });
  }, [provider, model]);

  return label;
}

export function ConversationModelChip({
  conversationId,
  provider,
  model,
  onUpdated,
}: ConversationModelChipProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const modelLabel = useModelLabel(provider, model);

  const hasOverride = Boolean(provider || model);

  const handleChange = async (newProvider: string | null, newModel: string | null) => {
    setSaving(true);
    try {
      await updateConversation(conversationId, { provider: newProvider, model: newModel });
      onUpdated?.(newProvider, newModel);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const handleReset = async () => {
    await handleChange(null, null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--hover-bg)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate max-w-[140px]">
            {hasOverride ? (modelLabel ?? '...') : 'Project default'}
          </span>
          <ChevronDown size={10} className="shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Model override</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Override the model for this conversation. Leave unset to use the project default.
          </p>
        </div>
        <ModelSelector
          initialProvider={provider}
          initialModel={model}
          onChange={(p, m) => {
            if (!saving) handleChange(p, m);
          }}
        />
        {hasOverride && (
          <div className="border-t border-[var(--stroke-divider)] pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw size={13} />
              Reset to project default
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
