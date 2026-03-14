'use client';

import { useEffect, useRef, useState } from 'react';
import { getChatProviders } from '@/lib/api/chat';

interface ChatModelSelectorProps {
  conversationId: string | null;
  selectedModel: string;
  onModelChange: (provider: string, model: string) => void;
}

const MODEL_OPTIONS: Record<string, { label: string; models: { id: string; label: string }[] }> = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
  },
};

export function ChatModelSelector({ conversationId, selectedModel, onModelChange }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatProviders().then((p) => setProviders(p.providers)).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentLabel = Object.values(MODEL_OPTIONS)
    .flatMap((p) => p.models)
    .find((m) => m.id === selectedModel)?.label ?? selectedModel;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs px-2 py-0.5 rounded border cursor-pointer"
        style={{
          background: 'rgba(139,92,246,0.15)',
          color: 'rgb(167,139,250)',
          borderColor: 'rgba(139,92,246,0.3)',
        }}
      >
        ⚡ {currentLabel} ▾
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 right-0 rounded-lg border shadow-lg z-50"
          style={{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--stroke-default)',
            minWidth: 200,
            padding: 4,
          }}
        >
          {providers.map((providerKey) => {
            const provider = MODEL_OPTIONS[providerKey];
            if (!provider) return null;
            return (
              <div key={providerKey}>
                <div className="text-[10px] uppercase px-2 py-1" style={{ color: 'var(--text-secondary)' }}>
                  {provider.label}
                </div>
                {provider.models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => { onModelChange(providerKey, model.id); setOpen(false); }}
                    className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--hover-bg)]"
                    style={{ color: model.id === selectedModel ? 'rgb(167,139,250)' : undefined }}
                  >
                    {model.id === selectedModel ? '✓ ' : '  '}{model.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
