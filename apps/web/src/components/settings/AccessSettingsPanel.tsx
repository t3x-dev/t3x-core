'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LocalAccessCheckResult, LocalConfigState } from '@/domain/accessConfig';
import { useAccessSettings } from '@/hooks/access/useAccessSettings';

function formatSourceLabel(
  source: LocalConfigState['api_url_source'] | LocalConfigState['api_key_source']
): string {
  switch (source) {
    case 'env':
      return 'Environment variable';
    case 'file':
      return 'Shared local config';
    case 'default':
      return 'Built-in default';
    case 'none':
      return 'Not configured';
  }
}

export function AccessSettingsPanel() {
  const { fetchLocalConfig, saveLocalConfig, clearLocalApiKey, checkLocalAccess } =
    useAccessSettings();
  const [config, setConfig] = useState<LocalConfigState | null>(null);
  const [accessCheck, setAccessCheck] = useState<LocalAccessCheckResult | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchLocalConfig()
      .then((nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setApiUrl(nextConfig.api_url);
        setApiKey('');
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : 'Failed to load shared access');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchLocalConfig]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const nextConfig = await saveLocalConfig({
        api_url: apiUrl.trim(),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setConfig(nextConfig);
      setAccessCheck(null);
      setApiUrl(nextConfig.api_url);
      setApiKey('');
      toast.success('Shared access updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save shared access');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearStoredKey() {
    setIsClearing(true);

    try {
      const nextConfig = await clearLocalApiKey();
      setConfig(nextConfig);
      setAccessCheck(null);
      setApiUrl(nextConfig.api_url);
      setApiKey('');
      toast.success('Stored API key cleared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear stored API key');
    } finally {
      setIsClearing(false);
    }
  }

  async function handleCheckAccess() {
    setIsChecking(true);
    try {
      const result = await checkLocalAccess();
      setAccessCheck(result);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to test shared access');
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Local Shared Access</h2>
        <p className="text-xs text-[var(--text-tertiary)]">
          This page manages the standalone API host&apos;s local API URL and key. In a one-machine
          setup, CLI and MCP can point at the same shared file.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">CLI fallback</p>
        <p className="mt-1">
          You can set the same shared values from the terminal with{' '}
          <span className="font-mono text-[var(--text-primary)]">t3x auth use-key &lt;key&gt;</span>{' '}
          and{' '}
          <span className="font-mono text-[var(--text-primary)]">
            t3x config set api-url &lt;url&gt;
          </span>
          .
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Loading shared access...
        </div>
      ) : (
        <form
          className="space-y-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-5"
          onSubmit={(event) => void handleSave(event)}
        >
          <div className="grid gap-4">
            <div className="space-y-2">
              <label
                htmlFor="access-api-url"
                className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]"
              >
                API URL
              </label>
              <Input
                id="access-api-url"
                aria-label="API URL"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="http://localhost:8000/api"
              />
              {config && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Current source: {formatSourceLabel(config.api_url_source)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="access-api-key"
                className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]"
              >
                API Key
              </label>
              <Input
                id="access-api-key"
                aria-label="API Key"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="t3xk_..."
                autoComplete="off"
              />
              <p className="text-xs text-[var(--text-secondary)]">
                {config?.api_key_present
                  ? `API key active (${formatSourceLabel(config.api_key_source)})${config.api_key_preview ? `: ${config.api_key_preview}` : ''}`
                  : 'API key not configured'}
              </p>
            </div>
          </div>

          {config?.api_key_source === 'env' || config?.api_url_source === 'env' ? (
            <div className="rounded-xl bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              Environment variables currently override part of this local config. File changes stay
              saved, but they will not take effect until the override is removed.
            </div>
          ) : null}

          <div className="rounded-xl bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Config path:{' '}
            <span className="font-mono text-[var(--text-primary)]">{config?.config_path}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Access
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isChecking}
              onClick={() => void handleCheckAccess()}
            >
              {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Test Access
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isClearing}
              onClick={() => void handleClearStoredKey()}
            >
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Clear Stored Key
            </Button>
          </div>

          {accessCheck ? (
            <div className="rounded-xl bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">
                Access check: {accessCheck.code}
              </p>
              <p className="mt-1">{accessCheck.message}</p>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
