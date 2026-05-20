'use client';

import { Loader2, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProviderCredentialDialogStatus {
  configured: boolean;
  defaultModel: string | null;
  lastTestStatus: 'ok' | 'error' | null;
  lastTestError: string | null;
}

interface ProviderCredentialDialogValue {
  api_key: string;
  default_model?: string | null;
}

interface ProviderCredentialDialogProps {
  providerId: 'anthropic' | 'openai' | 'google';
  providerName: string;
  availableModels: string[];
  open: boolean;
  status: ProviderCredentialDialogStatus | null;
  statusLoading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ProviderCredentialDialogValue) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function getStatusLabel(status: ProviderCredentialDialogStatus | null): string {
  if (!status) return 'Loading local credential status...';
  if (!status.configured) return 'No local credentials saved yet.';
  if (status.lastTestStatus === 'ok') return 'Last connection test passed.';
  if (status.lastTestStatus === 'error') return 'Last connection test failed.';
  return 'Local credentials saved.';
}

export function ProviderCredentialDialog({
  providerId,
  providerName,
  availableModels,
  open,
  status,
  statusLoading,
  error,
  onOpenChange,
  onSave,
  onDelete,
}: ProviderCredentialDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setApiKey('');
    setDefaultModel(status?.defaultModel ?? '');
    setValidationError(null);
  }, [open, status?.defaultModel]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      setValidationError('API key is required.');
      return;
    }

    setSaving(true);
    setValidationError(null);

    try {
      await onSave({
        api_key: trimmedApiKey,
        default_model: defaultModel.trim() ? defaultModel.trim() : null,
      });
      setApiKey('');
      onOpenChange(false);
    } catch {
      // The parent owns the async error state for persistence failures.
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setValidationError(null);

    try {
      await onDelete();
      setApiKey('');
      setDefaultModel('');
      onOpenChange(false);
    } catch {
      // The parent owns the async error state for persistence failures.
    } finally {
      setDeleting(false);
    }
  };

  const apiKeyInputId = `${providerId}-api-key`;
  const defaultModelInputId = `${providerId}-default-model`;
  const modelsListId = `${providerId}-models`;
  const busy = saving || deleting;
  const displayedError = validationError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{providerName} credentials</DialogTitle>
          <DialogDescription>
            Save a local API key and optional default model for {providerName}. Stored keys are
            never shown again after you submit them.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSave}>
          <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-4 py-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">
              {getStatusLabel(status)}
            </div>
            {status?.defaultModel && (
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                Current default model: {status.defaultModel}
              </div>
            )}
            {status?.lastTestError && (
              <div className="mt-1 text-xs text-[var(--status-error)]">{status.lastTestError}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={apiKeyInputId}>API Key</Label>
            <Input
              autoComplete="off"
              disabled={busy || statusLoading}
              id={apiKeyInputId}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={`Enter your ${providerName} API key`}
              type="password"
              value={apiKey}
            />
            <p className="text-xs text-[var(--text-tertiary)]">
              Re-enter the key any time you want to rotate or replace the saved credential.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={defaultModelInputId}>Default model (optional)</Label>
            <Input
              disabled={busy || statusLoading}
              id={defaultModelInputId}
              list={availableModels.length > 0 ? modelsListId : undefined}
              onChange={(event) => setDefaultModel(event.target.value)}
              placeholder="Leave blank to use the provider default"
              value={defaultModel}
            />
            {availableModels.length > 0 && (
              <>
                <datalist id={modelsListId}>
                  {availableModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Suggested models: {availableModels.join(', ')}
                </p>
              </>
            )}
          </div>

          {displayedError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {displayedError}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {status?.configured && (
                <Button
                  disabled={busy || statusLoading}
                  onClick={handleDelete}
                  type="button"
                  variant="destructive"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 />}
                  Remove local provider
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                disabled={busy}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={busy || statusLoading} type="submit">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save provider
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
