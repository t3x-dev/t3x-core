'use client';

import { ArrowLeft, ChevronDown, SquareTerminal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  connectAgentPage,
  type DelegationDays,
  type DelegationMode,
  delegationModes,
  permittedModes,
  type RepositoryDelegation,
} from '@/domain/mcpDelegation';
import { useRepositoryDelegations } from '@/hooks/access/useMcpDelegations';
import s from './AgentAccessDemo.module.css';

export function RepositoryAgentAccess({
  projectId,
  repository,
  branch,
  backHref,
}: {
  projectId: string;
  repository: string;
  branch: string;
  backHref: string;
}) {
  const grants = useRepositoryDelegations(projectId, branch);
  return (
    <section aria-labelledby="agent-access-title" className={s.page}>
      <header className={s.topbar}>
        <Link href={backHref} className={s.back}>
          <ArrowLeft size={16} />
          {repository}
        </Link>
      </header>
      <div className={s.body}>
        <h1 className={s.title} id="agent-access-title">
          Agent access
        </h1>
        <p className={s.description}>Manage the Agents you have authorized for {repository}.</p>
        {grants.data && (
          <Link
            className={s.primary}
            href={`${connectAgentPage}?${new URLSearchParams({ projectId, branch })}`}
          >
            Connect an Agent
          </Link>
        )}
        {grants.error ? (
          <div className={s.scope}>
            <p role="alert">{grants.error}</p>
            <button type="button" className={s.secondary} onClick={grants.reload}>
              Retry
            </button>
          </div>
        ) : !grants.data ? (
          <output className={s.statusText}>Loading Agent access…</output>
        ) : grants.data.grants.length === 0 ? (
          <p className={s.scope}>No Agents authorized yet.</p>
        ) : (
          <ul className={s.grants}>
            {grants.data.grants.map((grant) => (
              <li key={grant.id}>
                <GrantRow grant={grant} branch={branch} access={grants} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function GrantRow({
  grant,
  branch,
  access,
}: {
  grant: RepositoryDelegation;
  branch: string;
  access: ReturnType<typeof useRepositoryDelegations>;
}) {
  const [mode, setMode] = useState<DelegationMode>(grant.mode);
  const [days, setDays] = useState<DelegationDays>(7);
  const [restricted, setRestricted] = useState(grant.branch !== null);
  const [target, setTarget] = useState(grant.branch || branch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const [now, setNow] = useState(Date.now);
  const expiry = grant.expiresAt === null ? null : Date.parse(grant.expiresAt);
  const day = 86_400_000;
  const expired = expiry !== null && expiry <= now;
  const expiring = expiry !== null && !expired && expiry - now <= day;
  useEffect(() => {
    if (grant.revoked || expiry === null || expired) return;
    const next = expiring ? expiry : expiry - day;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2_147_483_647, Math.max(1, next - Date.now()))
    );
    return () => clearTimeout(timer);
  }, [expiry, expired, expiring, grant.revoked, now]);
  const status = grant.revoked
    ? 'Revoked'
    : expired
      ? 'Expired'
      : expiring
        ? 'Expires within 24 hours'
        : 'Active';
  async function change(action: 'revoke' | 'save' | 'repair') {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'revoke') await access.revoke(grant.id);
      else if (action === 'repair')
        await access.update(grant.id, { repair: true, branch: grant.branch || branch });
      else
        await access.update(grant.id, {
          mode,
          days,
          branch: grant.branch ?? (mode !== 'read' && restricted ? target.trim() : null),
        });
      access.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this grant.');
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <article className={s.card}>
      <div className={s.content}>
        <h2 className={s.grantTitle}>
          <SquareTerminal size={20} aria-hidden="true" />
          {grant.clientName}
        </h2>
        <p className={s.statusText}>
          {status} · {delegationModes[grant.mode]}
        </p>
        <p className={s.statusText}>
          {grant.branch ? `Branch: ${grant.branch}` : 'All branches, subject to their rules'} ·{' '}
          {grant.expiresAt
            ? `${expired ? 'Expired' : 'Expires'} ${new Date(grant.expiresAt).toLocaleString()}`
            : 'No expiry'}
        </p>
        {grant.needsPolicy && !grant.revoked && !expired && (
          <>
            <p className={s.scope}>
              Complete access to prepare a fixed Review on {grant.branch || branch}. Any saved Draft
              is preserved.
            </p>
            <button
              type="button"
              className={s.primary}
              disabled={busy}
              onClick={() => void change('repair')}
            >
              Complete authorization
            </button>
          </>
        )}
        {!grant.revoked && !grant.needsPolicy && !grant.legacy && (
          <details className={s.advanced}>
            <summary>
              {expired || expiring ? 'Renew access' : 'Edit or renew access'}{' '}
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className={s.fields}>
              <label>
                Agent actions
                <select
                  disabled={busy}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as DelegationMode)}
                >
                  {permittedModes(grant.mode).map((value) => (
                    <option key={value} value={value}>
                      {delegationModes[value]}
                    </option>
                  ))}
                </select>
              </label>
              <p className={s.statusText}>
                Renewal extends the grant. Reconnect from your Agent chat when its current token
                expires.
              </p>
              <label>
                Renew access for
                <select
                  disabled={busy}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) as DelegationDays)}
                >
                  {[1, 7, 30].map((day) => (
                    <option key={day} value={day}>
                      {day} {day === 1 ? 'day' : 'days'} from today
                    </option>
                  ))}
                </select>
              </label>
              {mode !== 'read' && (
                <>
                  <label>
                    Writable branches
                    <select
                      disabled={busy || grant.branch !== null}
                      value={restricted ? 'current' : 'all'}
                      onChange={(e) => setRestricted(e.target.value === 'current')}
                    >
                      {grant.branch === null && (
                        <option value="all">All branches, subject to their rules</option>
                      )}
                      <option value="current">A single branch</option>
                    </select>
                  </label>
                  {restricted && (
                    <label>
                      Branch name
                      <input
                        className={s.select}
                        disabled={busy || grant.branch !== null}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              <button
                type="button"
                className={s.primary}
                disabled={busy || (mode !== 'read' && restricted && !target.trim())}
                onClick={() => void change('save')}
              >
                Save access
              </button>
            </div>
          </details>
        )}
        {error && (
          <p className={s.statusText} role="alert">
            {error}
          </p>
        )}
      </div>
      {!grant.revoked && (
        <div className={s.footer}>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            onClick={() => void change('revoke')}
          >
            Revoke access
          </button>
        </div>
      )}
    </article>
  );
}
