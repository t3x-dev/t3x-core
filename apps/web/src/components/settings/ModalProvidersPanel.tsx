'use client';

import { AlertCircle, Blocks, Loader2, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProviderCredentialDialog } from '@/components/settings/ProviderCredentialDialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getLocalGenerationProviderId,
  getSettingsProviderName,
  useProvidersSettingsPanel,
  type ProviderInfo,
} from '@/hooks/providers/useProvidersSettingsPanel';
import { cn } from '@/utils/cn';

interface ModalProvidersPanelProps {
  className?: string;
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  anthropic: 'Best for Claude models and reasoning-focused chat workflows.',
  openai: 'Best for GPT models and general-purpose chat and automation.',
  google: 'Best for Gemini models and Google-native model access.',
};

function getProviderDescription(provider: ProviderInfo): string {
  return (
    PROVIDER_DESCRIPTIONS[getLocalGenerationProviderId(provider) ?? provider.id] ??
    'Connect a provider to start chatting.'
  );
}

export function ModalProvidersPanel({ className }: ModalProvidersPanelProps) {
  const {
    closeDialog,
    dialogError,
    dialogProvider,
    dialogStatus,
    dialogStatusLoading,
    handleDialogDelete,
    handleDialogSave,
    handleManageCredentials,
    handleTest,
    loadError,
    loadProviders,
    loading,
    providers,
    testResults,
  } = useProvidersSettingsPanel();

  const generationProviders = useMemo(
    () => providers.filter((provider) => getLocalGenerationProviderId(provider) !== null),
    [providers]
  );

  const [selectedProviderId, setSelectedProviderId] = useState<string>('');

  useEffect(() => {
    if (generationProviders.length === 0) {
      setSelectedProviderId('');
      return;
    }

    const configuredDefault = generationProviders.find((provider) => provider.configured);
    const fallbackProvider = configuredDefault ?? generationProviders[0];

    setSelectedProviderId((current) => {
      if (current && generationProviders.some((provider) => provider.id === current)) {
        return current;
      }
      return fallbackProvider.id;
    });
  }, [generationProviders]);

  const selectedProvider =
    generationProviders.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedProviderTestResult = selectedProvider ? testResults[selectedProvider.id] : undefined;
  const isTesting = selectedProviderTestResult === 'loading';
  const connectedCount = generationProviders.filter((provider) => provider.configured).length;

  return (
    <div className={cn('mx-auto w-full max-w-xl px-5 py-5', className)}>
      <div className="mb-4 space-y-1">
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">Providers</h1>
        <p className="text-xs text-[var(--text-tertiary)]">
          Set up and test a provider here, then choose models in chat.
        </p>
      </div>

      {loading ? (
        <div className="flex h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-xs font-medium text-destructive">Failed to load providers</p>
                <p className="mt-1 text-xs text-destructive/90">{loadError}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadProviders()}
                className="h-8 gap-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      ) : generationProviders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)]/40 px-4 py-5 text-xs text-[var(--text-secondary)]">
          No locally configurable generation providers are available in this environment.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-primary)]">Provider</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {connectedCount} of {generationProviders.length} connected
                </p>
              </div>
            </div>

            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger size="sm" className="w-full justify-between bg-background text-xs">
                <SelectValue placeholder="Choose a provider" />
              </SelectTrigger>
              <SelectContent>
                {generationProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {getSettingsProviderName(provider)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProvider && (
            <div className="rounded-lg border border-[var(--stroke-divider)] bg-background p-4 shadow-sm">
              <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-panel)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] ring-1 ring-[var(--stroke-divider)]">
                    <Blocks className="h-3.5 w-3.5" />
                    {selectedProvider.configured ? 'Set up' : 'Not set up'}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {getSettingsProviderName(selectedProvider)}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {getProviderDescription(selectedProvider)}
                    </p>
                  </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/40 px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                  {selectedProviderTestResult === 'loading'
                    ? 'Testing...'
                    : selectedProviderTestResult?.ok
                      ? `Connected in ${selectedProviderTestResult.latency_ms}ms`
                      : selectedProviderTestResult?.error || (selectedProvider.configured
                          ? 'Saved locally'
                          : 'Needs credentials')}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleManageCredentials(selectedProvider)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {selectedProvider.configured ? 'Edit setup' : 'Set up'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!selectedProvider.configured || isTesting}
                  onClick={() => void handleTest(selectedProvider.id)}
                >
                  {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Test
                </Button>
              </div>

              <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                Choose the active model from chat after setup.
              </p>
            </div>
          )}
        </div>
      )}

      {dialogProvider && (
        <ProviderCredentialDialog
          providerId={dialogProvider.id}
          providerName={dialogProvider.name}
          availableModels={dialogProvider.availableModels}
          error={dialogError}
          open={dialogProvider !== null}
          onOpenChange={(open) => {
            if (!open) {
              closeDialog();
            }
          }}
          onDelete={handleDialogDelete}
          onSave={handleDialogSave}
          status={
            dialogStatus
              ? {
                  configured: dialogStatus.configured,
                  defaultModel: dialogStatus.default_model,
                  lastTestStatus: dialogStatus.last_test_status,
                  lastTestError: dialogStatus.last_test_error,
                }
              : null
          }
          statusLoading={dialogStatusLoading}
        />
      )}
    </div>
  );
}
