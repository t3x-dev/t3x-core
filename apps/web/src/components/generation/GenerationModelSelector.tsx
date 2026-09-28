'use client';

import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAvailableModels } from '@/hooks/shared/useAvailableModels';
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

type SelectorPane = 'effort' | 'model';

export function GenerationModelSelector({
  onThinkingChange,
  selectedProvider,
  selectedModel,
  supportsThinking = false,
  thinkingEnabled = false,
  showReasoningInTrigger = true,
  onModelChange,
}: GenerationModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [activePane, setActivePane] = useState<SelectorPane>('model');
  const [query, setQuery] = useState('');
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
  const effortValueLabel = thinkingEnabled ? 'High' : 'Low';
  const triggerLabel = showReasoningInTrigger
    ? `${modelValueLabel} ${effortValueLabel}`
    : modelValueLabel;
  const canSelectEffort = Boolean(onThinkingChange && supportsThinking);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = useMemo(
    () =>
      normalizedQuery
        ? modelOptions.filter((model) =>
            `${model.label} ${model.provider}`.toLowerCase().includes(normalizedQuery)
          )
        : modelOptions,
    [modelOptions, normalizedQuery]
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

  const popoverLayout = getPopoverLayout(buttonRef.current);

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
                    aria-checked={false}
                    aria-label="Fast responses"
                    className={styles.switch}
                    data-checked={false}
                    disabled
                    role="switch"
                    title="Fast mode is not available for this runtime"
                    type="button"
                  >
                    <span />
                  </button>
                </div>
                <div className={styles.settingsRow}>
                  <span>Context</span>
                  <span className={styles.rowValue}>Auto</span>
                </div>
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
                    {defaultProvider && defaultModel ? (
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
              ) : (
                <section className={styles.effortPanel} aria-label="Effort">
                  {[
                    { enabled: false, label: 'Low' },
                    { enabled: true, label: 'High' },
                  ].map((option) => (
                    <button
                      aria-checked={option.enabled === thinkingEnabled}
                      className={styles.option}
                      key={option.label}
                      onClick={() => {
                        onThinkingChange?.(option.enabled);
                        setOpen(false);
                      }}
                      role="menuitemradio"
                      type="button"
                    >
                      <span>{option.label}</span>
                      {option.enabled === thinkingEnabled ? <Check aria-hidden="true" /> : null}
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

function getPopoverLayout(button: HTMLButtonElement | null): {
  openLeft: boolean;
  style: React.CSSProperties;
} {
  if (!button) return { openLeft: false, style: {} };
  const rect = button.getBoundingClientRect();
  const panelWidth = 228;
  const detailWidth = 230;
  const gap = 4;
  const totalWidth = panelWidth + detailWidth + gap;
  const detailHeight = 320;
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
