'use client';

import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
import { useChatSessionStore } from '@/store/chatSessionStore';
import { useSettingsModalStore } from '@/store/settingsModalStore';
import styles from './GenerationModelSelector.module.css';

interface GenerationModelSelectorProps {
  onThinkingChange?: (enabled: boolean) => void;
  selectedProvider?: string;
  selectedModel: string;
  supportsThinking?: boolean;
  thinkingEnabled?: boolean;
  showReasoningInTrigger?: boolean;
  onModelChange: (provider: string, model: string) => void;
}

type SelectorPane = 'effort' | 'model' | 'provider' | 'context';

export function GenerationModelSelector({
  onThinkingChange,
  selectedProvider,
  selectedModel,
  supportsThinking = false,
  showReasoningInTrigger = true,
  onModelChange,
}: GenerationModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [activePane, setActivePane] = useState<SelectorPane>('model');
  const [query, setQuery] = useState('');
  const preferences = useChatSessionStore();
  const [popoverHeight, setPopoverHeight] = useState(320);
  const { defaultModel, defaultProvider, providers } = useAvailableModels();
  const openSettingsModal = useSettingsModalStore((state) => state.openSettingsModal);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelOptions = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models.map((model) => ({
          id: model.id,
          label: model.label,
          provider: provider.name,
        }))
      ),
    [providers]
  );
  const currentModel = modelOptions.find(
    (model) =>
      model.id === selectedModel && (!selectedProvider || model.provider === selectedProvider)
  );
  const currentLabel =
    currentModel?.label ||
    selectedModel ||
    (modelOptions.length > 0 ? 'Select model' : 'No models configured');
  const modelValueLabel =
    selectedModel === 'gpt-5.4' ? 'gpt5.4' : compactModelLabel(currentLabel, 'control');
  const selectedVendor =
    currentModel?.provider || selectedProvider || defaultProvider || providers[0]?.name;
  const vendorLabel =
    providers.find((provider) => provider.name === selectedVendor)?.label ||
    selectedVendor ||
    'Select provider';
  const reasoningSupported =
    supportsThinking &&
    Boolean(currentModel?.id.match(/^(gpt-5|o[134]|claude-|gemini-(?:2\.|3\.[01]))/));
  const effort = preferences.fastEnabled ? 'low' : preferences.reasoningEffort;
  const effortValueLabel = reasoningSupported ? effort[0].toUpperCase() + effort.slice(1) : 'Auto';
  const triggerLabel =
    showReasoningInTrigger && reasoningSupported
      ? `${modelValueLabel} ${effortValueLabel}`
      : modelValueLabel;
  const canSelectEffort = reasoningSupported;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(
    () =>
      modelOptions.filter(
        (model) =>
          model.provider === selectedVendor &&
          (!normalizedQuery || model.label.toLowerCase().includes(normalizedQuery))
      ),
    [modelOptions, normalizedQuery, selectedVendor]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !dropdownRef.current) return;
    const measure = () =>
      setPopoverHeight(dropdownRef.current?.getBoundingClientRect().height || 320);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dropdownRef.current);
    return () => observer.disconnect();
  }, [open]);

  const popoverLayout = getPopoverLayout(buttonRef.current, popoverHeight);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Select model: ${currentLabel}`}
        className={styles.trigger}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) setActivePane('model');
        }}
        ref={buttonRef}
        title={currentLabel}
        type="button"
      >
        <span>{triggerLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              className={styles.popover}
              data-open-left={popoverLayout.openLeft}
              ref={dropdownRef}
              role="menu"
              style={popoverLayout.style}
            >
              <section className={styles.settingsPanel} aria-label="Model preferences">
                <div className={styles.settingsRow}>
                  <span>Fast</span>
                  <button
                    aria-checked={preferences.fastEnabled}
                    aria-label="Fast responses"
                    className={styles.switch}
                    data-checked={preferences.fastEnabled}
                    onClick={() => preferences.setFast(!preferences.fastEnabled)}
                    disabled={!reasoningSupported}
                    role="switch"
                    title="Use lower reasoning effort for faster responses"
                    type="button"
                  >
                    <span />
                  </button>
                </div>
                <SelectorRow
                  active={activePane === 'context'}
                  label="Context"
                  onClick={() => setActivePane('context')}
                  value={
                    preferences.contextMode[0].toUpperCase() + preferences.contextMode.slice(1)
                  }
                />
                <SelectorRow
                  active={activePane === 'provider'}
                  label="Provider"
                  onClick={() => setActivePane('provider')}
                  value={vendorLabel}
                />
                <SelectorRow
                  active={activePane === 'effort'}
                  disabled={!canSelectEffort}
                  label="Effort"
                  onClick={() => setActivePane('effort')}
                  value={effortValueLabel}
                />
                <SelectorRow
                  active={activePane === 'model'}
                  label="Model"
                  onClick={() => setActivePane('model')}
                  value={modelValueLabel}
                />
              </section>

              {activePane === 'model' ? (
                <section className={styles.detailPanel} aria-label="Models">
                  <label className={styles.searchBox}>
                    <Search aria-hidden="true" />
                    <input
                      aria-label="Search models"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search models"
                      value={query}
                    />
                  </label>
                  <div className={styles.modelList}>
                    {defaultProvider === selectedVendor && defaultModel ? (
                      <button
                        className={styles.option}
                        onClick={() => {
                          onModelChange(defaultProvider, defaultModel);
                          setOpen(false);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <span>Auto</span>
                      </button>
                    ) : null}
                    {filteredModels.map((model) => {
                      const selected =
                        model.id === selectedModel &&
                        (!selectedProvider || model.provider === selectedProvider);
                      return (
                        <button
                          aria-checked={selected}
                          className={styles.option}
                          key={`${model.provider}:${model.id}`}
                          onClick={() => {
                            onModelChange(model.provider, model.id);
                            setOpen(false);
                          }}
                          role="menuitemradio"
                          title={model.label}
                          type="button"
                        >
                          <span>{compactModelLabel(model.label)}</span>
                          {selected ? <Check aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                    {filteredModels.length === 0 ? (
                      <p className={styles.empty}>No matching models</p>
                    ) : null}
                  </div>
                  <button
                    aria-label="Open provider settings"
                    className={styles.addModels}
                    onClick={() => {
                      setOpen(false);
                      openSettingsModal('providers');
                    }}
                    type="button"
                  >
                    Add Models
                  </button>
                </section>
              ) : activePane === 'provider' ? (
                <section className={styles.effortPanel} aria-label="Providers">
                  {providers.map((provider) => (
                    <button
                      key={provider.name}
                      className={styles.option}
                      role="menuitemradio"
                      aria-checked={provider.name === selectedVendor}
                      type="button"
                      onClick={() => {
                        const nextModel =
                          provider.models.find((entry) => entry.id === selectedModel) ??
                          provider.models[0];
                        if (nextModel) onModelChange(provider.name, nextModel.id);
                        setQuery('');
                        setActivePane('model');
                      }}
                    >
                      <span>{provider.label || provider.name}</span>
                      {provider.name === selectedVendor ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </section>
              ) : activePane === 'context' ? (
                <section className={styles.effortPanel} aria-label="Context">
                  {(['auto', 'compact', 'expanded'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={styles.option}
                      type="button"
                      role="menuitemradio"
                      aria-checked={preferences.contextMode === mode}
                      title={
                        mode === 'auto'
                          ? 'Automatic context budget'
                          : mode === 'compact'
                            ? 'Smaller context; exact details remain retrievable'
                            : 'Include more draft, source and conversation context'
                      }
                      onClick={() => {
                        preferences.setContextMode(mode);
                        setOpen(false);
                      }}
                    >
                      <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
                      {preferences.contextMode === mode ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </section>
              ) : (
                <section className={styles.effortPanel} aria-label="Effort">
                  {[
                    { effort: 'low' as const, label: 'Low' },
                    { effort: 'medium' as const, label: 'Medium' },
                    { effort: 'high' as const, label: 'High' },
                  ].map((option) => (
                    <button
                      aria-checked={option.effort === effort}
                      className={styles.option}
                      key={option.label}
                      onClick={() => {
                        preferences.setReasoningEffort(option.effort);
                        onThinkingChange?.(option.effort !== 'low');
                        setOpen(false);
                      }}
                      role="menuitemradio"
                      type="button"
                    >
                      <span>{option.label}</span>
                      {option.effort === effort ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </section>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function SelectorRow({
  active,
  disabled = false,
  label,
  onClick,
  value,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      className={styles.selectorRow}
      data-active={active}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span className={styles.rowValue}>
        {value}
        <ChevronRight aria-hidden="true" />
      </span>
    </button>
  );
}

function getPopoverLayout(
  button: HTMLButtonElement | null,
  detailHeight: number
): {
  openLeft: boolean;
  style: React.CSSProperties;
} {
  if (!button) return { openLeft: false, style: {} };
  const rect = button.getBoundingClientRect();
  const panelWidth = 228;
  const detailWidth = 230;
  const gap = 4;
  const totalWidth = panelWidth + detailWidth + gap;
  const openLeft = rect.right + detailWidth + gap > window.innerWidth - 8;
  const left = openLeft ? rect.right - totalWidth : rect.right - panelWidth;
  return {
    openLeft,
    style: {
      left: Math.max(8, Math.min(left, window.innerWidth - totalWidth - 8)),
      top: Math.max(8, rect.top - detailHeight - 6),
    },
  };
}

function compactModelLabel(label: string, mode: 'list' | 'control' = 'list') {
  const normalized = label.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (mode === 'control' && normalized.length > 18) return `${normalized.slice(0, 17).trim()}…`;
  return normalized;
}
