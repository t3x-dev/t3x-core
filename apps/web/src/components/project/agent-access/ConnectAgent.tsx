'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { T3XMark } from '@/components/layout/T3XMark';
import {
  type ConnectionChoices,
  connectAgentPage,
  type SavedSelection,
  selectionLabel,
} from '@/domain/mcpDelegation';
import { getProjectIdRepoPath, repositoryAgentAccessHref } from '@/domain/project/repoPath';
import {
  useConnectionChoices,
  useConnectionSelectionStatus,
} from '@/hooks/access/useMcpDelegations';
import s from './AgentAccessDemo.module.css';

export function ConnectAgent() {
  const params = useSearchParams();
  const projectId = params.get('projectId') ?? '';
  const branch = params.get('branch') ?? '';
  const choices = useConnectionChoices();
  const localSelection = new URLSearchParams();
  if (projectId) localSelection.set('projectId', projectId);
  if (branch) localSelection.set('branch', branch);
  const loginHref = `/login?${new URLSearchParams({ callbackUrl: connectAgentPage + (localSelection.size ? '?' + localSelection.toString() : '') })}`;
  return (
    <section className={s.page} aria-label="Connect an Agent">
      <header className={s.topbar}>
        <span className={s.brand}>
          <T3XMark /> T3X
        </span>
        <Link
          className={s.back}
          href={
            projectId
              ? repositoryAgentAccessHref(getProjectIdRepoPath(projectId), branch)
              : '/settings'
          }
        >
          {projectId ? 'Repository settings' : 'Settings'}
        </Link>
      </header>
      <div className={s.body}>
        <article className={s.card}>
          <div className={s.content}>
            <h1 className={s.title}>Connect an Agent</h1>
            {choices.data ? (
              <SelectionForm
                key={JSON.stringify([projectId, branch])}
                choices={choices.data}
                projectId={projectId}
                branch={branch}
                save={choices.save}
                refresh={choices.reload}
              />
            ) : choices.error ? (
              <>
                <p role="alert" className={s.description}>
                  {choices.error}
                </p>
                {choices.loginRequired ? (
                  <Link className={s.secondary} href={loginHref}>
                    Sign in to continue
                  </Link>
                ) : (
                  <button type="button" className={s.secondary} onClick={choices.reload}>
                    Retry
                  </button>
                )}
              </>
            ) : (
              <output className={s.statusText}>Loading repositories and registered Agents…</output>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function SelectionForm({
  choices,
  projectId,
  branch,
  save,
  refresh,
}: {
  choices: ConnectionChoices;
  projectId: string;
  branch: string;
  save: ReturnType<typeof useConnectionChoices>['save'];
  refresh: () => void;
}) {
  const [project, setProject] = useState(projectId);
  const [clientId, setClient] = useState(choices.clients.length === 1 ? choices.clients[0].id : '');
  const [target, setTarget] = useState(branch);
  const [saved, setSaved] = useState<SavedSelection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const client = choices.clients.find((item) => item.id === clientId);
  const repository = choices.repositories.find((item) => item.id === project);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !client || !repository) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await save({ projectId: project, clientId, branch: target.trim() });
      if (!active.current) return;
      if (result.launchUrl && !['https:', 'http:'].includes(new URL(result.launchUrl).protocol))
        throw new Error('T3X returned an invalid client connection address.');
      setSaved(result);
      if (result.launchUrl && Date.parse(result.expiresAt) > Date.now())
        window.location.assign(result.launchUrl);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof Error && 'code' in cause && cause.code === 'UNAUTHENTICATED') {
        refresh();
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to save your selection.');
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (projectId && !repository)
    return (
      <p className={s.description} role="alert">
        This repository is unavailable for delegation.
      </p>
    );
  if (!choices.clients.length || !choices.repositories.length)
    return (
      <p className={s.description}>
        {choices.clients.length
          ? 'Your account has no repositories available for delegation.'
          : 'No Agent clients are registered on this deployment.'}
      </p>
    );
  if (saved && client && repository)
    return (
      <SavedConnection
        saved={saved}
        client={client.name}
        repository={repository.name}
        settingsHref={repositoryAgentAccessHref(getProjectIdRepoPath(project), target.trim())}
        onReset={() => setSaved(null)}
      />
    );
  return (
    <form className={s.fields} onSubmit={submit}>
      <p className={s.description}>
        Choose where the Agent will work. You’ll review the permissions when the client connects.
      </p>
      <label>
        Repository
        <select
          required
          disabled={busy || !!projectId}
          value={project}
          onChange={(event) => {
            setProject(event.target.value);
            setTarget('');
          }}
        >
          <option value="">Choose a repository…</option>
          {choices.repositories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target branch
        <input
          className={s.select}
          value={target}
          disabled={busy}
          placeholder="Current branch"
          onChange={(event) => setTarget(event.target.value)}
        />
      </label>
      <label>
        Agent
        <select
          required
          disabled={busy}
          value={clientId}
          onChange={(event) => setClient(event.target.value)}
        >
          <option value="">Choose a registered Agent…</option>
          {choices.clients.map((item) => (
            <option key={item.id} value={item.id}>
              {choices.clients.some((other) => other.id !== item.id && other.name === item.name)
                ? `${item.name} (${item.id})`
                : item.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className={s.statusText} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={s.primary} disabled={busy || !client || !repository}>
        {busy ? 'Saving selection…' : 'Continue in client'}
      </button>
    </form>
  );
}

function SavedConnection({
  saved,
  client,
  repository,
  settingsHref,
  onReset,
}: {
  saved: SavedSelection;
  client: string;
  repository: string;
  settingsHref: string;
  onReset: () => void;
}) {
  const { data, error, reload } = useConnectionSelectionStatus(saved.id, saved.expiresAt);
  return (
    <div className={s.fields}>
      {data?.status === 'pending' && (
        <>
          <output className={s.description}>
            Selection saved for {client} and {repository}. Confirm access when the client opens the
            T3X authorization page.
          </output>
          {saved.launchUrl ? (
            <a className={s.primary} href={saved.launchUrl} referrerPolicy="no-referrer">
              Open {client}
            </a>
          ) : (
            <>
              <p className={s.statusText}>
                Open {client}'s connection settings. Add or select the HTTP MCP server{' '}
                {saved.resourceUrl ? (
                  <>
                    at <code>{saved.resourceUrl}</code>
                  </>
                ) : (
                  <>using the OAuth server URL from your deployment administrator</>
                )}{' '}
                and start OAuth sign-in.
              </p>
              <p className={s.statusText}>
                On the T3X authorization page, choose the saved selection with reference{' '}
                <code>{selectionLabel(saved.id)}</code> and confirm access.
              </p>
            </>
          )}
          <p className={s.statusText}>
            Selection expires {new Date(saved.expiresAt).toLocaleString()}.
          </p>
        </>
      )}
      {data?.status === 'used' && (
        <>
          <output className={s.description}>
            This selection was used to authorize {client} for {repository}.
          </output>
          <Link className={s.primary} href={settingsHref}>
            View repository Agent access
          </Link>
        </>
      )}
      {data?.status === 'expired' && (
        <p className={s.description} role="alert">
          This selection expired before it was used.
        </p>
      )}
      {data?.status === 'unavailable' && (
        <p className={s.description} role="alert">
          This selection is unavailable. Its authorization status cannot be confirmed.
        </p>
      )}
      {error && (
        <>
          <p className={s.description} role="alert">
            Could not check this selection. {error}
          </p>
          <button type="button" className={s.secondary} onClick={reload}>
            Retry status check
          </button>
        </>
      )}
      {!data && !error && <output className={s.statusText}>Checking this selection…</output>}
      <button type="button" className={s.secondary} onClick={onReset}>
        Choose another connection
      </button>
    </div>
  );
}
