"use client";

import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CreatedT3xApiKey, T3xApiKey } from "@/domain/apiKeys";
import type {
  LocalAccessCheckResult,
  LocalConfigState,
} from "@/domain/accessConfig";
import { formatUserFacingError } from "@/domain/format/errors";
import { formatDate, relativeTime } from "@/domain/format/formatters";
import { useAccessSettings } from "@/hooks/access/useAccessSettings";

function formatSourceLabel(
  source:
    | LocalConfigState["api_url_source"]
    | LocalConfigState["api_key_source"]
): string {
  switch (source) {
    case "env":
      return "Environment variable";
    case "file":
      return "Shared local config";
    case "default":
      return "Built-in default";
    case "none":
      return "Not configured";
  }
}

export function AccessSettingsPanel() {
  const {
    fetchLocalConfig,
    listApiKeys,
    saveLocalConfig,
    createApiKey,
    revokeApiKey,
    clearLocalApiKey,
    checkLocalAccess,
  } = useAccessSettings();
  const [config, setConfig] = useState<LocalConfigState | null>(null);
  const [accessCheck, setAccessCheck] = useState<LocalAccessCheckResult | null>(
    null
  );
  const [apiKeys, setApiKeys] = useState<T3xApiKey[]>([]);
  const [createdKey, setCreatedKey] = useState<CreatedT3xApiKey | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyProjectId, setNewKeyProjectId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const loadApiKeys = useCallback(async () => {
    setIsLoadingKeys(true);
    try {
      const keys = await listApiKeys();
      setApiKeys(keys);
    } catch (error) {
      toast.error(formatUserFacingError(error, "Failed to load API keys."));
    } finally {
      setIsLoadingKeys(false);
    }
  }, [listApiKeys]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchLocalConfig()
      .then((nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setApiUrl(nextConfig.api_url);
        setApiKey("");
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(
          formatUserFacingError(error, "Failed to load shared access.")
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchLocalConfig]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccessState() {
      setIsChecking(true);
      try {
        const result = await checkLocalAccess();
        if (!cancelled) setAccessCheck(result);
      } catch (error) {
        if (!cancelled)
          toast.error(
            formatUserFacingError(error, "Failed to test shared access.")
          );
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    void loadAccessState();
    void loadApiKeys();

    return () => {
      cancelled = true;
    };
  }, [checkLocalAccess, loadApiKeys]);

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
      setApiKey("");
      toast.success("Shared access updated");
    } catch (error) {
      toast.error(
        formatUserFacingError(error, "Failed to save shared access.")
      );
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
      setApiKey("");
      toast.success("Stored API key cleared");
    } catch (error) {
      toast.error(
        formatUserFacingError(error, "Failed to clear stored API key.")
      );
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
      toast.error(
        formatUserFacingError(error, "Failed to test shared access.")
      );
    } finally {
      setIsChecking(false);
    }
  }

  async function handleCreateApiKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newKeyName.trim();
    const projectId = newKeyProjectId.trim();
    if (!name) return;

    setIsCreatingKey(true);
    try {
      const nextKey = await createApiKey({
        name,
        ...(projectId ? { project_id: projectId } : {}),
      });
      setCreatedKey(nextKey);
      setNewKeyName("");
      setNewKeyProjectId("");
      await loadApiKeys();
      toast.success("API key created");
    } catch (error) {
      toast.error(formatUserFacingError(error, "Failed to create API key."));
    } finally {
      setIsCreatingKey(false);
    }
  }

  async function handleCopyCreatedKey() {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey.key);
      toast.success("API key copied");
    } catch {
      toast.error("Could not copy API key");
    }
  }

  async function handleRevokeApiKey(key: T3xApiKey) {
    if (
      !window.confirm(`Revoke API key "${key.name}"? This cannot be undone.`)
    ) {
      return;
    }

    setRevokingKeyId(key.id);
    try {
      await revokeApiKey(key.id);
      setApiKeys((current) =>
        current.filter((candidate) => candidate.id !== key.id)
      );
      await loadApiKeys();
      toast.success("API key revoked");
    } catch (error) {
      toast.error(formatUserFacingError(error, "Failed to revoke API key."));
    } finally {
      setRevokingKeyId(null);
    }
  }

  const accessModeLabel =
    accessCheck?.auth_mode === "open"
      ? "Open local API"
      : accessCheck?.auth_mode === "protected"
      ? "Protected API"
      : accessCheck?.auth_mode === "unreachable"
      ? "Unreachable API"
      : "Checking access";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Access control
        </h2>
        <p className="text-xs text-[var(--text-tertiary)]">
          Manage T3X API access separately from model provider credentials.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-[var(--text-primary)]">
              Runtime access mode
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {accessCheck?.message ??
                "Checking whether the configured API currently requires authentication."}
            </p>
          </div>
          <span className="rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
            {isChecking && !accessCheck ? "Checking" : accessModeLabel}
          </span>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <KeyRound className="h-4 w-4" />
              T3X API keys
            </h3>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Create keys for WebUI sessions, CLI, MCP, and automation.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadApiKeys()}
          >
            Refresh
          </Button>
        </div>

        {accessCheck?.auth_mode === "open" ? (
          <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Source development is currently open. Keys here are mainly for CLI,
            MCP, and self-hosted simulation.
          </div>
        ) : null}

        <form
          className="grid gap-3 border-y border-[var(--stroke-divider)] py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => void handleCreateApiKey(event)}
        >
          <div className="space-y-2">
            <label
              htmlFor="new-api-key-name"
              className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]"
            >
              New API key name
            </label>
            <Input
              id="new-api-key-name"
              aria-label="New API key name"
              value={newKeyName}
              onChange={(event) => setNewKeyName(event.target.value)}
              placeholder="CLI key"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="new-api-key-project"
              className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]"
            >
              Project scope
            </label>
            <Input
              id="new-api-key-project"
              aria-label="Project scope"
              value={newKeyProjectId}
              onChange={(event) => setNewKeyProjectId(event.target.value)}
              placeholder="Optional project id"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={isCreatingKey || !newKeyName.trim()}
            >
              {isCreatingKey ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Create API key
            </Button>
          </div>
        </form>

        {createdKey ? (
          <div className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-secondary)] p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  Created key
                </p>
                <p className="mt-1 break-all font-mono text-xs text-[var(--text-primary)]">
                  {createdKey.key}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyCreatedKey()}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreatedKey(null)}
                >
                  Dismiss created key
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {isLoadingKeys ? (
          <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Loading API keys...
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            No active API keys.
          </div>
        ) : (
          <div className="divide-y divide-[var(--stroke-divider)] overflow-hidden rounded-xl border border-[var(--stroke-divider)]">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="grid gap-3 bg-[var(--surface-primary)] px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--text-primary)]">
                      {key.name}
                    </p>
                    <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                      {key.key_prefix}
                    </span>
                    <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                      {key.project_id
                        ? `Project ${key.project_id}`
                        : "User-level key"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Created {relativeTime(key.created_at)}
                    {key.last_used_at
                      ? `; last used ${relativeTime(key.last_used_at)}`
                      : ""}
                  </p>
                  <p className="sr-only">
                    Created at {formatDate(key.created_at)}
                    {key.last_used_at
                      ? `; last used at ${formatDate(key.last_used_at)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Revoke ${key.name}`}
                    disabled={revokingKeyId === key.id}
                    onClick={() => void handleRevokeApiKey(key)}
                  >
                    {revokingKeyId === key.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <span>Provider keys stay in Settings / Providers.</span>
          <Link
            href="/settings/providers"
            className="font-medium text-[var(--text-primary)]"
          >
            Open providers settings
          </Link>
        </div>
      </section>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Local Shared Access
        </h3>
        <p className="text-xs text-[var(--text-tertiary)]">
          This page manages the standalone API host&apos;s local API URL and
          key. In a one-machine setup, CLI and MCP can point at the same shared
          file.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)]">CLI fallback</p>
        <p className="mt-1">
          You can set the same shared values from the terminal with{" "}
          <span className="font-mono text-[var(--text-primary)]">
            t3x auth use-key &lt;key&gt;
          </span>{" "}
          and{" "}
          <span className="font-mono text-[var(--text-primary)]">
            t3x config set api-url &lt;url&gt;
          </span>
          .
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Loading shared access...
        </div>
      ) : (
        <form
          className="space-y-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5"
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
                  ? `API key active (${formatSourceLabel(
                      config.api_key_source
                    )})${
                      config.api_key_preview
                        ? `: ${config.api_key_preview}`
                        : ""
                    }`
                  : "API key not configured"}
              </p>
            </div>
          </div>

          {config?.api_key_source === "env" ||
          config?.api_url_source === "env" ? (
            <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              Environment variables currently override part of this local
              config. File changes stay saved, but they will not take effect
              until the override is removed.
            </div>
          ) : null}

          <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Config path:{" "}
            <span className="font-mono text-[var(--text-primary)]">
              {config?.config_path}
            </span>
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
            <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
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
