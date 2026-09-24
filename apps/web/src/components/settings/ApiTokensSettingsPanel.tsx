'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CreatedT3xApiKey, T3xApiKey } from '@/domain/apiKeys';
import { formatUserFacingError } from '@/domain/format/errors';
import { useAccessSettings } from '@/hooks/access/useAccessSettings';
import styles from './ApiTokensSettingsPanel.module.css';

type ScopeFilter = 'all' | 'organization' | 'projects';
type StatusFilter = 'all' | 'active' | 'revoked';

interface TokenDisplay extends T3xApiKey {
  expires_at?: string | null;
}

function dateParts(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date),
  };
}

function activityTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function displayPrefix(prefix: string) {
  if (prefix.includes('•')) return prefix;
  const separator = prefix.indexOf('_');
  const stem = separator >= 0 ? prefix.slice(0, separator + 1) : 't3x_';
  return `${stem}••••${prefix.slice(-4)}`;
}

export function ApiTokensSettingsPanel() {
  const { listApiKeys, createApiKey, revokeApiKey } = useAccessSettings();
  const [apiKeys, setApiKeys] = useState<T3xApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedT3xApiKey | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setApiKeys(await listApiKeys());
    } catch (error) {
      setLoadError(formatUserFacingError(error, 'Failed to load API tokens.'));
    } finally {
      setLoading(false);
    }
  }, [listApiKeys]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const displayTokens: TokenDisplay[] = apiKeys;

  const filteredTokens = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return displayTokens.filter((token) => {
      const tokenScope = token.project_id ? 'projects' : 'organization';
      const tokenStatus = token.revoked_at ? 'revoked' : 'active';
      return (
        (!normalizedQuery ||
          token.name.toLowerCase().includes(normalizedQuery) ||
          token.key_prefix.toLowerCase().includes(normalizedQuery)) &&
        (scope === 'all' || scope === tokenScope) &&
        (status === 'all' || status === tokenStatus)
      );
    });
  }, [displayTokens, query, scope, status]);

  const activities = useMemo(
    () =>
      [...displayTokens]
        .filter((token) => token.last_used_at)
        .sort(
          (left, right) =>
            new Date(right.last_used_at ?? 0).getTime() - new Date(left.last_used_at ?? 0).getTime()
        )
        .slice(0, 4),
    [displayTokens]
  );

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error('Could not copy API token.');
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    const projectId = newProjectId.trim();
    if (!name) return;
    setCreating(true);
    try {
      const token = await createApiKey({
        name,
        ...(projectId ? { project_id: projectId } : {}),
      });
      setCreatedKey(token);
      setNewName('');
      setNewProjectId('');
      await loadKeys();
      toast.success('API token created');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to create API token.'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(token: TokenDisplay) {
    setOpenMenu(null);
    if (!window.confirm(`Revoke API token "${token.name}"? This cannot be undone.`)) return;
    setRevoking(token.id);
    try {
      await revokeApiKey(token.id);
      await loadKeys();
      toast.success('API token revoked');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to revoke API token.'));
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className={styles.root}>
      <link
        href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css"
        rel="stylesheet"
      />
      <div className={styles.content}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <strong>API tokens</strong>
        </nav>

        <header className={styles.titleRow}>
          <h1>API tokens</h1>
          <span className={styles.scopeBadge}>
            <i aria-hidden="true" className="ph ph-buildings" />
            Organization
          </span>
        </header>

        <section aria-label="API tokens" className={styles.card}>
          <div className={styles.toolbar}>
            <button
              className={styles.primaryButton}
              onClick={() => {
                setCreatedKey(null);
                setShowCreate(true);
              }}
              type="button"
            >
              <i aria-hidden="true" className="ph ph-plus" />
              Create token
            </button>
            <div className={styles.tools}>
              <label className={styles.search}>
                <i aria-hidden="true" className="ph ph-magnifying-glass" />
                <span className="sr-only">Search tokens</span>
                <input
                  aria-label="Search tokens"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tokens..."
                  type="search"
                  value={query}
                />
              </label>
              <label className={styles.selectWrap}>
                <span className="sr-only">Scope</span>
                <select
                  aria-label="Scope"
                  className={styles.filterSelect}
                  onChange={(event) => setScope(event.target.value as ScopeFilter)}
                  value={scope}
                >
                  <option value="all">All scopes</option>
                  <option value="organization">Organization</option>
                  <option value="projects">Projects</option>
                </select>
                <i aria-hidden="true" className="ph ph-caret-down" />
              </label>
              <label className={styles.selectWrap}>
                <span className="sr-only">Status</span>
                <select
                  aria-label="Status"
                  className={styles.filterSelect}
                  onChange={(event) => setStatus(event.target.value as StatusFilter)}
                  value={status}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="revoked">Revoked</option>
                </select>
                <i aria-hidden="true" className="ph ph-caret-down" />
              </label>
            </div>
          </div>

          <div className={styles.tableWrap}>
            {loadError ? (
              <p role="alert">
                {loadError}{' '}
                <button onClick={() => void loadKeys()} type="button">
                  Retry
                </button>
              </p>
            ) : null}
            <table className={`${styles.table} ${styles.tokensTable}`}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Scope</th>
                  <th className={styles.sortable}>
                    <span className={styles.sortLabel}>
                      Created <i aria-hidden="true" className="ph ph-arrow-down" />
                    </span>
                  </th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th className={styles.actions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.map((token) => {
                  const created = dateParts(token.created_at);
                  const used = token.last_used_at ? dateParts(token.last_used_at) : null;
                  const expires = token.expires_at ? dateParts(token.expires_at) : null;
                  return (
                    <tr key={token.id}>
                      <td className={styles.name}>{token.name}</td>
                      <td>
                        <span className={styles.prefix}>
                          {displayPrefix(token.key_prefix)}
                          <button
                            aria-label={`Copy prefix for ${token.name}`}
                            className={styles.iconButton}
                            onClick={() => void copyText(token.key_prefix, 'Token prefix copied')}
                            type="button"
                          >
                            <i aria-hidden="true" className="ph ph-copy" />
                          </button>
                        </span>
                      </td>
                      <td>
                        <span
                          className={token.project_id ? styles.projectBadge : styles.scopeBadge}
                        >
                          <i
                            aria-hidden="true"
                            className={token.project_id ? 'ph ph-cube' : 'ph ph-buildings'}
                          />
                          {token.project_id ? 'Projects' : 'Organization'}
                        </span>
                      </td>
                      <td className={styles.dateCell}>
                        <span>{created.date}</span>
                        <small>{created.time}</small>
                      </td>
                      <td className={styles.dateCell}>
                        {used ? (
                          <>
                            <span>{used.date}</span>
                            <small>{used.time}</small>
                          </>
                        ) : (
                          <span>Never</span>
                        )}
                      </td>
                      <td className={!expires ? styles.expiresNever : styles.dateCell}>
                        {expires ? (
                          <>
                            <span>{expires.date}</span>
                            <small>{expires.time}</small>
                          </>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className={styles.actions}>
                        <button
                          aria-label={`Actions for ${token.name}`}
                          className={styles.menuButton}
                          disabled={revoking === token.id}
                          onClick={() =>
                            setOpenMenu((current) => (current === token.id ? null : token.id))
                          }
                          type="button"
                        >
                          <i aria-hidden="true" className="ph ph-dots-three" />
                        </button>
                        {openMenu === token.id ? (
                          <div className={styles.actionMenu} role="menu">
                            <button
                              onClick={() => void handleRevoke(token)}
                              role="menuitem"
                              type="button"
                            >
                              Revoke token
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !loadError && filteredTokens.length === 0 ? (
              <div className={styles.empty}>
                {apiKeys.length === 0 ? 'No API tokens yet.' : 'No API tokens match these filters.'}
              </div>
            ) : null}
          </div>
        </section>

        <section aria-label="Token activity" className={styles.card}>
          <header className={styles.activityHeader}>
            <h2>Token activity</h2>
            <p>Latest recorded use per token, not a request history.</p>
          </header>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.activityTable}`}>
              <thead>
                <tr>
                  <th className={styles.sortable}>
                    <span className={styles.sortLabel}>
                      Timestamp <i aria-hidden="true" className="ph ph-arrow-down" />
                    </span>
                  </th>
                  <th>Action</th>
                  <th>Token</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((token) => (
                  <tr key={`activity-${token.id}`}>
                    <td className={styles.activityTime}>
                      {activityTimestamp(token.last_used_at ?? token.created_at)}
                    </td>
                    <td>
                      <span className={styles.usedBadge}>Last used</span>
                    </td>
                    <td>
                      <span className={styles.tokenName}>{token.name}</span>{' '}
                      <span className={styles.tokenPrefix}>
                        ({displayPrefix(token.key_prefix)})
                      </span>
                    </td>
                    <td className={styles.details}>Recorded by the API</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {showCreate ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            aria-labelledby="create-api-token-title"
            aria-modal="true"
            className={styles.dialog}
            role="dialog"
          >
            <h2 id="create-api-token-title">Create API token</h2>
            <p>Create a token for organization or project access.</p>
            <form className={styles.dialogForm} onSubmit={(event) => void handleCreate(event)}>
              <label className={styles.dialogField}>
                Token name
                <input
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Production"
                  value={newName}
                />
              </label>
              <label className={styles.dialogField}>
                Project ID (optional)
                <input
                  onChange={(event) => setNewProjectId(event.target.value)}
                  placeholder="Leave empty for organization scope"
                  value={newProjectId}
                />
              </label>
              {createdKey ? (
                <div className={styles.createdKey}>
                  Copy this token now. It will not be shown again.
                  <code>{createdKey.key}</code>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => void copyText(createdKey.key, 'API token copied')}
                    type="button"
                  >
                    Copy token
                  </button>
                </div>
              ) : null}
              <div className={styles.dialogActions}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    setShowCreate(false);
                    setCreatedKey(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={creating || !newName.trim()}
                  type="submit"
                >
                  {creating ? 'Creating…' : 'Create token'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
