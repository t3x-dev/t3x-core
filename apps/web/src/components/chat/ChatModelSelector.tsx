'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';

interface ChatModelSelectorProps {
  conversationId: string | null;
  selectedModel: string;
  onModelChange: (provider: string, model: string) => void;
}

export function ChatModelSelector({ selectedModel, onModelChange }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const { providers } = useAvailableModels();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasProviders = providers.length > 0;
  let currentLabel = hasProviders ? 'Select model' : 'No models configured';

  const selectedModelLabel = providers
    .flatMap((p) => p.models)
    .find((m) => m.id === selectedModel)?.label;
  if (selectedModelLabel) {
    currentLabel = selectedModelLabel;
  } else if (selectedModel) {
    currentLabel = selectedModel.split('-').slice(0, -1).join(' ') || selectedModel;
  }

  // Close on outside click — check both button and portal dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs px-2 py-0.5 rounded border cursor-pointer"
        style={{
          background: 'var(--source-dim)',
          color: 'var(--source)',
          borderColor: 'color-mix(in srgb, var(--source) 30%, transparent)',
        }}
      >
        ⚡ {currentLabel} ▾
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="rounded-lg border shadow-xl bg-white dark:bg-zinc-900"
            style={{
              ...getPopoverStyle(),
              borderColor: 'var(--stroke-default)',
              minWidth: 220,
              maxWidth: 280,
              padding: 4,
            }}
          >
            {hasProviders ? (
              providers.map((provider) => (
                <div key={provider.name}>
                  <div
                    className="text-[10px] uppercase px-2 py-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {provider.label}
                  </div>
                  {provider.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onModelChange(provider.name, model.id);
                        setOpen(false);
                      }}
                      className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      style={{ color: model.id === selectedModel ? 'rgb(167,139,250)' : undefined }}
                    >
                      {model.id === selectedModel ? '✓ ' : '  '}
                      {model.label}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <div className="px-2 py-2 space-y-2">
                <div className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                  No generation providers are configured yet.
                </div>
                <Button asChild variant="outline" size="sm" className="h-8 w-full justify-center">
                  <Link href="/settings/providers">Open provider settings</Link>
                </Button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
