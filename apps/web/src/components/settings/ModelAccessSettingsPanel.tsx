'use client';

import { Building2, Cloud, Columns3, Download, Hand, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { runProviderConnectionTest } from '@/commands/providers';
import { formatUserFacingError } from '@/domain/format/errors';
import { useModelAccessSettings } from '@/hooks/providers/useModelAccessSettings';
import type { ModelAccessConfig, ProviderInfo, TestConnectionResult } from '@/types/providers';
import styles from './ModelAccessSettingsPanel.module.css';

type TaskKey = keyof ModelAccessConfig['task_defaults'];

interface ModelOption {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'google';
  providerId: string;
  providerLabel: string;
}

const FEATURED_MODELS = [
  'claude-sonnet-4-6',
  'gpt-5.4',
  'gemini-2.5-pro',
  'claude-haiku-4-5-20251001',
] as const;

function providerKind(provider: ProviderInfo): ModelOption['provider'] {
  if (provider.id.includes('anthropic')) return 'anthropic';
  if (provider.id.includes('google')) return 'google';
  return 'openai';
}

function providerLabel(provider: ModelOption['provider']): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'google') return 'Google';
  return 'OpenAI';
}

function modelLabel(id: string): string {
  const labels: Record<string, string> = {
    'claude-sonnet-4-6': 'Claude Sonnet',
    'claude-haiku-4-5-20251001': 'Claude Haiku',
    'gpt-5.4': 'GPT-5.4',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
  };
  return labels[id] ?? id;
}

function modelOptions(providers: ProviderInfo[]): ModelOption[] {
  const all = providers.flatMap((provider) => {
    const kind = providerKind(provider);
    return (provider.available_models ?? []).map((id) => ({
      id,
      label: modelLabel(id),
      provider: kind,
      providerId: provider.id,
      providerLabel: providerLabel(kind),
    }));
  });
  const byId = new Map(all.map((model) => [model.id, model]));
  const featured = FEATURED_MODELS.map((id) => byId.get(id)).filter((model): model is ModelOption =>
    Boolean(model)
  );
  return featured.length > 0 ? featured : all.slice(0, 4);
}

function connectionStatus(result: TestConnectionResult | 'loading' | undefined) {
  if (result === 'loading') return { kind: 'pending' as const, text: 'Testing…' };
  if (!result) return null;
  if (result.ok) {
    return {
      kind: 'ok' as const,
      text:
        result.latency_ms != null ? `Connected · ${result.latency_ms}ms` : 'Connected',
    };
  }
  return {
    kind: 'error' as const,
    text: formatUserFacingError(result.error ?? 'Connection test failed.', 'Connection test failed.'),
  };
}

function ModelMark({ provider }: { provider: ModelOption['provider'] }) {
  if (provider === 'google') return <span className={styles.googleMark}>G</span>;
  if (provider === 'openai') return <span className={styles.openAiMark}>◎</span>;
  return <span className={styles.anthropicMark}>✳</span>;
}

function ModelSelect({
  value,
  models,
  allowNone = false,
  disabled,
  label,
  onChange,
}: {
  value: string | null;
  models: ModelOption[];
  allowNone?: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: string | null) => void;
}) {
  const selected = models.find((model) => model.id === value);
  return (
    <label className={styles.modelSelect}>
      {selected ? <ModelMark provider={selected.provider} /> : null}
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
      >
        {allowNone ? <option value="">None</option> : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ModelAccessSettingsPanel() {
  const { providers, config, loading, saving, error, retry, save } = useModelAccessSettings();
  const [tests, setTests] = useState<Record<string, TestConnectionResult | 'loading'>>({});
  const models = modelOptions(providers);
  const enabledModels = models.filter((model) => config?.enabled_models.includes(model.id));
  const testingAny = Object.values(tests).includes('loading');

  async function testConnection(providerId: string) {
    setTests((current) => ({ ...current, [providerId]: 'loading' }));
    try {
      const result = await runProviderConnectionTest(providerId);
      setTests((current) => ({ ...current, [providerId]: result }));
    } catch (cause) {
      setTests((current) => ({
        ...current,
        [providerId]: {
          ok: false,
          error: formatUserFacingError(cause, 'Connection test failed.'),
        },
      }));
    }
  }

  async function testEnabledConnections() {
    const providerIds = [...new Set(enabledModels.map((model) => model.providerId))];
    await Promise.all(providerIds.map((providerId) => testConnection(providerId)));
  }

  async function persist(next: ModelAccessConfig) {
    try {
      await save(next);
      toast.success('Model access updated');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to update model access.'));
    }
  }

  function toggleModel(modelId: string) {
    if (!config) return;
    const enabled = new Set(config.enabled_models);
    if (enabled.has(modelId)) enabled.delete(modelId);
    else enabled.add(modelId);
    const remaining = models.filter((model) => enabled.has(model.id));
    if (remaining.length === 0) return;
    const replacement = remaining[0]?.id ?? '';
    const next: ModelAccessConfig = {
      ...config,
      enabled_models: [...enabled],
      default_model:
        config.default_model && enabled.has(config.default_model)
          ? config.default_model
          : replacement,
      task_defaults: Object.fromEntries(
        Object.entries(config.task_defaults).map(([task, selection]) => [
          task,
          {
            primary_model: enabled.has(selection.primary_model)
              ? selection.primary_model
              : replacement,
            fallback_model:
              selection.fallback_model && enabled.has(selection.fallback_model)
                ? selection.fallback_model
                : null,
          },
        ])
      ) as ModelAccessConfig['task_defaults'],
    };
    void persist(next);
  }

  function setDefault(model: string | null) {
    if (!config) return;
    void persist({ ...config, default_model: model });
  }

  function setTaskModel(
    task: TaskKey,
    field: 'primary_model' | 'fallback_model',
    model: string | null
  ) {
    if (!config || (field === 'primary_model' && !model)) return;
    void persist({
      ...config,
      task_defaults: {
        ...config.task_defaults,
        [task]: { ...config.task_defaults[task], [field]: model },
      },
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <Link href="/settings">orbit-labs</Link>
          <span>/</span>
          <strong>Model access</strong>
        </nav>

        <div className={styles.titleGroup}>
          <h1>Model access</h1>
          <span>
            <Building2 size={14} />
            Organization
          </span>
          <span>
            <Cloud size={14} />
            Cloud
          </span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={22} className={styles.spin} />
            Loading models
          </div>
        ) : null}
        {error && !config ? (
          <div className={styles.error} role="alert">
            <span>{formatUserFacingError(error, 'Failed to load model access.')}</span>
            <button type="button" onClick={() => void retry()}>
              Retry
            </button>
          </div>
        ) : null}

        {config ? (
          <>
            <section className={styles.availableCard} aria-labelledby="available-models-title">
              <div className={styles.cardHeading}>
                <h2 id="available-models-title">Available models</h2>
                <button
                  type="button"
                  className={styles.testAll}
                  disabled={saving || testingAny || enabledModels.length === 0}
                  onClick={() => void testEnabledConnections()}
                >
                  {testingAny ? 'Testing…' : 'Test connections'}
                </button>
              </div>
              <div className={styles.modelList}>
                {models.map((model) => {
                  const enabled = config.enabled_models.includes(model.id);
                  const status = connectionStatus(tests[model.providerId]);
                  return (
                    <div className={styles.modelRow} key={model.id}>
                      <ModelMark provider={model.provider} />
                      <div>
                        <strong>{model.label}</strong>
                        <span>{model.providerLabel}</span>
                        {status ? (
                          <output
                            className={
                              status.kind === 'ok'
                                ? styles.testOk
                                : status.kind === 'error'
                                  ? styles.testError
                                  : styles.testPending
                            }
                          >
                            {status.text}
                          </output>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label={`Test ${model.label}`}
                        className={styles.testButton}
                        disabled={saving || tests[model.providerId] === 'loading'}
                        onClick={() => void testConnection(model.providerId)}
                      >
                        {tests[model.providerId] === 'loading' ? 'Testing…' : 'Test'}
                      </button>
                      <span className={styles.stateLabel}>{enabled ? 'Enabled' : 'Disabled'}</span>
                      <button
                        type="button"
                        className={styles.switch}
                        role="switch"
                        aria-label={`${enabled ? 'Disable' : 'Enable'} ${model.label}`}
                        aria-checked={enabled}
                        disabled={saving}
                        onClick={() => toggleModel(model.id)}
                      >
                        <i />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.defaultCard}>
              <h2>Default model</h2>
              <ModelSelect
                label="Default model"
                value={config.default_model}
                models={enabledModels}
                disabled={saving}
                onChange={setDefault}
              />
            </section>

            <section className={styles.taskCard} aria-labelledby="task-defaults-title">
              <h2 id="task-defaults-title">Task defaults</h2>
              <div className={styles.taskHeader}>
                <span>Task</span>
                <span>Primary model</span>
                <span>Fallback</span>
              </div>
              {(['compose', 'extraction', 'validation'] as const).map((task) => (
                <div className={styles.taskRow} key={task}>
                  <strong>{task.charAt(0).toUpperCase() + task.slice(1)}</strong>
                  <ModelSelect
                    label={`${task} primary model`}
                    value={config.task_defaults[task].primary_model}
                    models={enabledModels}
                    disabled={saving}
                    onChange={(model) => setTaskModel(task, 'primary_model', model)}
                  />
                  <ModelSelect
                    label={`${task} fallback model`}
                    value={config.task_defaults[task].fallback_model}
                    models={enabledModels}
                    allowNone
                    disabled={saving}
                    onChange={(model) => setTaskModel(task, 'fallback_model', model)}
                  />
                </div>
              ))}
            </section>
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
