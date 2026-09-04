'use client';

import { Check, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useSettingsModalStore } from '@/store/settingsModalStore';
import { cn } from '@/utils/cn';

interface GenerationModelSelectorProps {
  onThinkingChange?: (enabled: boolean) => void;
  selectedProvider?: string;
  selectedModel: string;
  supportsThinking?: boolean;
  thinkingEnabled?: boolean;
  onModelChange: (provider: string, model: string) => void;
}

export function GenerationModelSelector({
  onThinkingChange,
  selectedProvider,
  selectedModel,
  supportsThinking = false,
  thinkingEnabled = false,
  onModelChange,
}: GenerationModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [activePane, setActivePane] = useState<'model' | 'reasoning' | 'provider'>('model');
  const { defaultModel, defaultProvider, providers } = useAvailableModels();
  const openSettingsModal = useSettingsModalStore((state) => state.openSettingsModal);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentProvider =
    providers.find((provider) => provider.name === selectedProvider) ??
    providers.find((provider) => provider.models.some((model) => model.id === selectedModel)) ??
    null;
  const modelOptions = providers.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      label: model.label,
      provider: provider.name,
    }))
  );
  const currentProviderName = currentProvider?.name ?? selectedProvider ?? '';
  const visibleModels = currentProvider
    ? currentProvider.models.map((model) => ({
        id: model.id,
        label: model.label,
        provider: currentProvider.name,
      }))
    : modelOptions;
  const hasModels = modelOptions.length > 0;
  let currentLabel = hasModels ? 'Select model' : 'No models configured';

  const selectedModelLabel =
    visibleModels.find((model) => model.id === selectedModel)?.label ??
    modelOptions.find((model) => model.id === selectedModel)?.label ??
    currentProvider?.models.find((model) => model.id === selectedModel)?.label;
  if (selectedModelLabel) {
    currentLabel = selectedModelLabel;
  } else if (selectedModel) {
    currentLabel = selectedModel.split('-').slice(0, -1).join(' ') || selectedModel;
  }
  const modelValueLabel = compactModelLabel(currentLabel, 'control');
  const currentProviderLabel = currentProvider?.label ?? selectedProvider ?? '厂商';
  const reasoningValueLabel = thinkingEnabled ? '极高' : '标准';
  const triggerLabel = hasModels ? `${modelValueLabel} ${reasoningValueLabel}` : currentLabel;
  const canSelectReasoning = Boolean(onThinkingChange && supportsThinking);
  const canReset =
    Boolean(defaultProvider && defaultModel) &&
    (defaultProvider !== currentProviderName || defaultModel !== selectedModel);
  const selectProvider = (providerName: string) => {
    const provider = providers.find((entry) => entry.name === providerName);
    if (!provider) return;
    const providerModel =
      (providerName === currentProviderName &&
      provider.models.some((model) => model.id === selectedModel)
        ? selectedModel
        : null) ??
      (providerName === defaultProvider &&
      defaultModel &&
      provider.models.some((model) => model.id === defaultModel)
        ? defaultModel
        : null) ??
      provider.models[0]?.id;

    if (!providerModel) return;
    onModelChange(provider.name, providerModel);
    setActivePane('model');
  };
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
    const popoverWidth = 308;
    const popoverHeight = 188;
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const openUpward = spaceBelow < 196;
    const left = Math.min(rect.right - popoverWidth, viewportWidth - popoverWidth - 8);
    const top = openUpward
      ? Math.max(8, Math.min(rect.top - popoverHeight - 4, viewportHeight - popoverHeight - 8))
      : rect.bottom + 4;
    return {
      position: 'fixed',
      top,
      left: Math.max(8, left),
      zIndex: 9999,
    };
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) setActivePane('model');
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Select model: ${currentLabel}`}
        className="relative flex h-8 w-[112px] max-w-full shrink min-w-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-[var(--hover-bg)] px-6 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stroke-strong)]"
        title={currentLabel}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className="absolute right-3 h-3 w-3 shrink-0 text-[var(--text-tertiary)]"
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="flex items-start gap-0 bg-transparent text-[13px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="menu"
            style={{
              ...getPopoverStyle(),
              minWidth: 308,
              maxWidth: 308,
              overflow: 'visible',
            }}
          >
            {hasModels ? (
              <>
                <div className="max-h-[188px] w-[176px] overflow-y-auto rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--fx-shadow-sm)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {activePane === 'provider'
                    ? providers.map((provider) => (
                        <button
                          key={provider.name}
                          type="button"
                          role="menuitemradio"
                          aria-checked={provider.name === currentProviderName}
                          onClick={() => selectProvider(provider.name)}
                          className="flex h-7 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
                        >
                          <span className="min-w-0 truncate" title={provider.label}>
                            {provider.label}
                          </span>
                          {provider.name === currentProviderName ? (
                            <Check
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]"
                            />
                          ) : null}
                        </button>
                      ))
                    : activePane === 'reasoning'
                      ? [
                          { enabled: false, label: '标准' },
                          { enabled: true, label: '极高' },
                        ].map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.enabled === thinkingEnabled}
                            onClick={() => {
                              onThinkingChange?.(option.enabled);
                              setOpen(false);
                            }}
                            className="flex h-7 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
                          >
                            <span className="min-w-0 truncate">{option.label}</span>
                            {option.enabled === thinkingEnabled ? (
                              <Check
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]"
                              />
                            ) : null}
                          </button>
                        ))
                      : visibleModels.map((model) => {
                          const modelLabel = compactModelLabel(model.label);
                          return (
                            <button
                              key={`${model.provider}:${model.id}`}
                              type="button"
                              role="menuitemradio"
                              aria-checked={model.id === selectedModel}
                              onClick={() => {
                                onModelChange(model.provider, model.id);
                                setOpen(false);
                              }}
                              className="flex h-7 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left leading-none text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
                            >
                              <span className="min-w-0 truncate" title={model.label}>
                                {modelLabel}
                              </span>
                              {model.id === selectedModel ? (
                                <Check
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                </div>
                <div className="mt-[22px] w-[132px] -translate-x-px rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-1">
                  <ModelSelectorPanelRow
                    active={activePane === 'model'}
                    label="模型"
                    onClick={() => setActivePane('model')}
                    value={modelValueLabel}
                  />
                  <ModelSelectorPanelRow
                    active={activePane === 'reasoning'}
                    label="推理强度"
                    onClick={canSelectReasoning ? () => setActivePane('reasoning') : undefined}
                    value={reasoningValueLabel}
                  />
                  <ModelSelectorPanelRow
                    active={activePane === 'provider'}
                    label="厂商"
                    onClick={() => setActivePane('provider')}
                    value={currentProviderLabel}
                  />
                  <div className="my-1 border-t border-[var(--stroke-divider)]" />
                  <button
                    type="button"
                    disabled={!canReset}
                    onClick={() => {
                      if (!defaultProvider || !defaultModel) return;
                      onModelChange(defaultProvider, defaultModel);
                      setOpen(false);
                    }}
                    className="flex h-7 w-full items-center justify-between rounded-lg px-2 text-left text-[11px] text-[var(--text-tertiary)] transition-colors enabled:hover:bg-[var(--hover-bg)] enabled:hover:text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span>重置为默认设置</span>
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
              </>
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

function compactModelLabel(label: string, mode: 'list' | 'control' = 'list') {
  const normalized = label.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const gemini = normalized.match(/^Gemini\s+(\d+(?:\.\d+)?)(?:\s+(.+))?$/i);
  if (gemini) {
    if (mode === 'control') return gemini[1];
    const family = gemini[2]?.replace(/^Flash\s+Lite$/i, 'Lite').replace(/^Flash$/i, 'Flash');
    return family ? `Gemini ${gemini[1]} ${family}` : `Gemini ${gemini[1]}`;
  }

  const gpt = normalized.match(/^GPT\s*(\d+(?:\.\d+)?)(?:\s+(.+))?$/i);
  if (gpt) {
    if (mode === 'control') return gpt[1];
    return gpt[2] ? `${gpt[1]} ${gpt[2]}` : gpt[1];
  }

  const claude = normalized.match(/^Claude\s+(Sonnet|Opus|Haiku)(?:\s+(.+))?$/i);
  if (claude) {
    if (mode === 'control') return claude[1];
    return claude[2] ? `Claude ${claude[1]} ${claude[2]}` : `Claude ${claude[1]}`;
  }

  if (mode === 'control' && normalized.length > 10) return `${normalized.slice(0, 9).trim()}…`;
  return normalized;
}

function ModelSelectorPanelRow({
  active,
  label,
  onClick,
  value,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  value: string;
}) {
  const className = cn(
    'flex h-7 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[12px] leading-none text-[var(--text-primary)]',
    onClick
      ? 'transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stroke-strong)]'
      : '',
    active ? 'bg-[var(--hover-bg)]' : ''
  );
  const content = (
    <>
      <span className="shrink-0 font-semibold">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[var(--text-tertiary)]">
        <span className="truncate">{value}</span>
        {onClick ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
