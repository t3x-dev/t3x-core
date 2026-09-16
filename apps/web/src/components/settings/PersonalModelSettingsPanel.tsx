'use client';

import {
  Columns3,
  Download,
  GripVertical,
  Hand,
  Loader2,
  UserRound,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/domain/format/errors';
import {
  type PersonalModelPreferences,
  usePersonalModelPreferences,
} from '@/hooks/settings/usePersonalModelPreferences';
import styles from './PersonalModelSettingsPanel.module.css';

function labelFor(model: string): string {
  const labels: Record<string, string> = {
    'claude-sonnet-4-6': 'Claude Sonnet',
    'claude-opus-4-6': 'Claude Opus',
    'claude-haiku-4-5-20251001': 'Claude Haiku',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-3.6-flash': 'Gemini 3.6 Flash',
  };
  return labels[model] ?? model;
}

function providerFor(model: string): 'Anthropic' | 'OpenAI' | 'Google' {
  if (model.startsWith('claude')) return 'Anthropic';
  if (model.startsWith('gemini')) return 'Google';
  return 'OpenAI';
}

function ModelMark({ model }: { model: string }) {
  const provider = providerFor(model);
  if (provider === 'Google') return <span className={styles.googleMark}>G</span>;
  if (provider === 'OpenAI') return <span className={styles.openAiMark}>◎</span>;
  return <span className={styles.anthropicMark}>✳</span>;
}

function ModelSelect({
  value,
  models,
  label,
  onChange,
}: {
  value: string;
  models: string[];
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.modelSelect}>
      <ModelMark model={value} />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {models.map((model) => (
          <option key={model} value={model}>
            {labelFor(model)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PersonalModelSettingsPanel() {
  const { data, loading, saving, error, retry, save } = usePersonalModelPreferences();
  const [draft, setDraft] = useState<PersonalModelPreferences | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => setDraft(data), [data]);

  const available =
    draft?.quick_switcher.filter((item) => item.available).map((item) => item.model) ?? [];

  async function saveChanges() {
    if (!draft) return;
    try {
      await save({
        compose_default: draft.compose_default,
        fallback_model: draft.fallback_model,
        quick_switcher: draft.quick_switcher.map(({ model, visible }) => ({ model, visible })),
      });
      toast.success('Default model preferences saved');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to save model preferences.'));
    }
  }

  function moveModel(targetIndex: number) {
    if (!draft || dragIndex === null || dragIndex === targetIndex) return;
    const next = [...draft.quick_switcher];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    setDraft({ ...draft, quick_switcher: next });
    setDragIndex(targetIndex);
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <span>Personal</span>
          <span>/</span>
          <strong>My default model</strong>
        </nav>
        <div className={styles.titleGroup}>
          <h1>My default model</h1>
          <span>
            <UserRound size={15} />
            Personal
          </span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={22} className={styles.spin} />
            Loading preferences
          </div>
        ) : null}
        {error && !draft ? (
          <div className={styles.error} role="alert">
            <span>{formatUserFacingError(error, 'Failed to load model preferences.')}</span>
            <button type="button" onClick={() => void retry()}>
              Retry
            </button>
          </div>
        ) : null}

        {draft ? (
          <>
            <section className={styles.composeCard}>
              <h2>Compose default</h2>
              <ModelSelect
                label="Compose default"
                value={draft.compose_default}
                models={available}
                onChange={(model) => setDraft({ ...draft, compose_default: model })}
              />
            </section>

            <section className={styles.switcherCard}>
              <h2>Quick switcher</h2>
              <div className={styles.tableHeader}>
                <span>#</span>
                <span>Model</span>
                <span>Provider</span>
                <span>Show in quick switcher</span>
              </div>
              {draft.quick_switcher.map((item, index) => (
                <div
                  className={styles.modelRow}
                  key={item.model}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    moveModel(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <div className={styles.rank}>
                    <GripVertical size={17} />
                    <b>{index + 1}</b>
                  </div>
                  <div className={styles.modelIdentity}>
                    <ModelMark model={item.model} />
                    <strong>{labelFor(item.model)}</strong>
                  </div>
                  <div className={styles.providerCell}>
                    <span>{providerFor(item.model)}</span>
                    {!item.available ? <i>Unavailable</i> : null}
                  </div>
                  <button
                    type="button"
                    className={styles.switch}
                    role="switch"
                    aria-label={`Show ${labelFor(item.model)} in quick switcher`}
                    aria-checked={item.visible && item.available}
                    disabled={!item.available}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        quick_switcher: draft.quick_switcher.map((entry) =>
                          entry.model === item.model ? { ...entry, visible: !entry.visible } : entry
                        ),
                      })
                    }
                  >
                    <i />
                  </button>
                </div>
              ))}
            </section>

            <section className={styles.fallbackCard}>
              <h2>Fallback</h2>
              <ModelSelect
                label="Fallback model"
                value={draft.fallback_model ?? available[0] ?? ''}
                models={available}
                onChange={(model) => setDraft({ ...draft, fallback_model: model })}
              />
            </section>
            <div className={styles.saveRow}>
              <button type="button" disabled={saving} onClick={() => void saveChanges()}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className={styles.prototypeTools} aria-label="View tools" role="toolbar">
        <button type="button" title="Zoom Out">
          <ZoomOut size={20} />
        </button>
        <button type="button" title="Zoom In">
          <ZoomIn size={20} />
        </button>
        <i />
        <button type="button" title="Pan Tool">
          <Hand size={20} />
        </button>
        <button type="button" title="Fit to Screen">
          <Columns3 size={20} />
        </button>
        <button type="button" title="Download">
          <Download size={20} />
        </button>
      </div>
    </div>
  );
}
