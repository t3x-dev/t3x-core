'use client';

import { Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useSettingsModalStore } from '@/store/settingsModalStore';

interface ChatModelSelectorProps {
  conversationId: string | null;
  selectedModel: string;
  onModelChange: (provider: string, model: string) => void;
}

export function ChatModelSelector({ selectedModel, onModelChange }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const { providers } = useAvailableModels();
  const openSettingsModal = useSettingsModalStore((state) => state.openSettingsModal);
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
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = 280;
    const estimatedHeight = Math.min(
      320,
      providers.reduce((sum, provider) => sum + 28 + provider.models.length * 34, 16)
    );
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const openUpward = spaceBelow < Math.min(estimatedHeight, 220);
    const left = Math.min(rect.left, viewportWidth - popoverWidth - 8);
    return {
      position: 'fixed',
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? viewportHeight - rect.top + 4 : undefined,
      left: Math.max(8, left),
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
        aria-label={`Select model: ${currentLabel}`}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border shadow-[0_1px_2px_rgba(15,23,42,0.035)] transition-colors hover:bg-[var(--source-dim)]"
        style={{
          background: 'color-mix(in srgb, var(--source-dim) 68%, transparent)',
          color: 'var(--source)',
          borderColor: 'color-mix(in srgb, var(--source) 18%, transparent)',
        }}
        title={currentLabel}
      >
        <Zap className="h-3.5 w-3.5" />
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
              maxHeight: 'min(320px, calc(100vh - 16px))',
              overflowY: 'auto',
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-center"
                  onClick={() => {
                    setOpen(false);
                    openSettingsModal('providers');
                  }}
                >
                  Open provider settings
                </Button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
