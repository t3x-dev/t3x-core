'use client';

import { useEffect, useRef, useState } from 'react';
import { getAvailableModels } from '@/lib/api/llm';
import type { LLMProviderInfo } from '@/lib/api/types';

interface ChatModelSelectorProps {
  conversationId: string | null;
  selectedModel: string;
  onModelChange: (provider: string, model: string) => void;
}

export function ChatModelSelector({ selectedModel, onModelChange }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getAvailableModels()
      .then((data) => setProviders(data.providers.filter((p) => p.available)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentLabel = providers
    .flatMap((p) => p.models)
    .find((m) => m.id === selectedModel)?.label ?? selectedModel.split('-').slice(0, -1).join(' ');

  const getPopoverStyle = (): React.CSSProperties => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 9999,
    };
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
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
          className="rounded-lg border shadow-lg"
          style={{
            ...getPopoverStyle(),
            background: 'var(--surface-overlay)',
            borderColor: 'var(--stroke-default)',
            minWidth: 200,
            padding: 4,
          }}
        >
          {providers.map((provider) => (
            <div key={provider.name}>
              <div className="text-[10px] uppercase px-2 py-1" style={{ color: 'var(--text-secondary)' }}>
                {provider.label}
              </div>
              {provider.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => { onModelChange(provider.name, model.id); setOpen(false); }}
                  className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--hover-bg)]"
                  style={{ color: model.id === selectedModel ? 'rgb(167,139,250)' : undefined }}
                >
                  {model.id === selectedModel ? '✓ ' : '  '}{model.label}
                </button>
              ))}
            </div>
          ))}
          {providers.length === 0 && (
            <div className="text-xs px-2 py-2" style={{ color: 'var(--text-tertiary)' }}>
              No providers configured
            </div>
          )}
        </div>
      )}
    </div>
  );
}
