'use client';

import {
  ArrowRight,
  BookMarked,
  ChevronDown,
  GitBranch,
  ShieldCheck,
  SquareTerminal,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { T3XMark } from '@/components/layout/T3XMark';
import {
  type DelegationConsent,
  type DelegationDays,
  type DelegationMode,
  delegationModes,
  permittedModes,
} from '@/domain/mcpDelegation';
import { useDelegationConsent } from '@/hooks/access/useMcpDelegations';
import s from './AgentAccessDemo.module.css';

export function AgentConsent() {
  const request = useSearchParams().toString();
  return <ConsentRequest key={request} request={request} />;
}

function ConsentRequest({ request }: { request: string }) {
  const [choice, choose] = useState<string | null>(null);
  const params = new URLSearchParams(request);
  if (choice) params.set('projectId', choice);
  else if (choice === '') params.delete('projectId');
  const query = params.toString();
  const consent = useDelegationConsent(query);
  const loginHref = `/login?${new URLSearchParams({ callbackUrl: `/settings/agent-access/authorize?${query}` })}`;
  return (
    <section aria-label="Agent authorization" className={s.page}>
      <header className={s.topbar}>
        <span className={s.brand}>
          <T3XMark /> T3X
        </span>
      </header>
      <div className={s.body}>
        {consent.data ? (
          <ConsentCard
            key={query}
            consent={consent.data}
            choose={choose}
            decide={consent.decide}
            loginHref={loginHref}
          />
        ) : consent.error ? (
          <article className={s.card}>
            <div className={s.content}>
              <h1 className={s.title}>Unable to open this request</h1>
              <p role="alert" className={s.description}>
                {consent.error}
              </p>
              {consent.loginRequired && (
                <Link className={s.primary} href={loginHref}>
                  Sign in to continue
                </Link>
              )}
              <button
                className={s.secondary}
                type="button"
                onClick={choice ? () => choose('') : consent.reload}
              >
                {choice ? 'Back to repository selection' : 'Try again'}
              </button>
            </div>
          </article>
        ) : (
          <output>Opening the authorization request…</output>
        )}
      </div>
    </section>
  );
}

function ConsentCard({
  consent,
  choose,
  decide,
  loginHref,
}: {
  consent: DelegationConsent;
  choose: (projectId: string) => void;
  decide: ReturnType<typeof useDelegationConsent>['decide'];
  loginHref: string;
}) {
  const { clientName, selected } = consent;
  const maximum = selected?.outcome === 'read_only' ? 'read' : consent.scope;
  const [mode, setMode] = useState<DelegationMode>(maximum);
  const [days, setDays] = useState<DelegationDays>(7);
  const [branchOnly, setBranchOnly] = useState(false);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const canApprove = selected && selected.outcome !== 'unknown';
  async function finish(decision: 'approve' | 'cancel') {
    if (sending.current || (decision === 'approve' && !canApprove)) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await decide({
        decision,
        ...(selected && { projectId: selected.id, branch: selected.branch }),
        days,
        mode,
        branchOnly,
      });
      // Only the consent service can supply the registered callback.
      const destination = new URL(result.redirectTo);
      if (!['https:', 'http:'].includes(destination.protocol))
        throw new Error('T3X returned an invalid client callback.');
      window.location.assign(destination.href);
    } catch (cause) {
      setLoginRequired(
        cause instanceof Error && 'code' in cause && cause.code === 'UNAUTHENTICATED'
      );
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
      sending.current = false;
      setBusy(false);
    }
  }
  const subject = selected?.name.split('/').at(-1);
  const repair = selected?.outcome === 'policy' && mode !== 'read';
  const description = !selected
    ? `Select the repository ${clientName} should use for this task.`
    : mode === 'read'
      ? `${clientName} can read the content and history of this repository.`
      : mode === 'prepare'
        ? `${clientName} can edit content and prepare changes for human review.`
        : branchOnly
          ? `${clientName} can read this repository and edit content on ${selected.branch}.`
          : `${clientName} can organize sources and edit content across this repository. Each branch keeps its review rules.`;
  return (
    <>
      <article className={s.card}>
        <div className={s.content}>
          {selected && (
            <div className={s.identity} aria-hidden="true">
              <span className={s.agentIcon}>
                <SquareTerminal />
              </span>
              <span className={s.connector}>
                <ArrowRight size={16} />
              </span>
              <span className={s.repoIcon}>
                <BookMarked />
              </span>
            </div>
          )}
          <h1 className={s.title}>
            {selected
              ? repair
                ? `Complete ${clientName} access for ${subject}?`
                : `Let ${clientName} work on ${subject}?`
              : 'Choose a repository'}
          </h1>
          <p className={s.description}>{description}</p>
          <div className={s.requestContext}>
            <dl>
              {consent.task && (
                <div>
                  <dt>Task from {clientName}</dt>
                  <dd>{consent.task}</dd>
                </div>
              )}
              {consent.repositoryLocked && selected && (
                <div>
                  <dt>Repository</dt>
                  <dd>{selected.name}</dd>
                </div>
              )}
            </dl>
            {!consent.repositoryLocked && (
              <label className={s.field}>
                Repository
                <select
                  className={s.select}
                  aria-label="Repository"
                  disabled={busy}
                  value={selected?.id ?? ''}
                  onChange={(event) => choose(event.target.value)}
                >
                  <option value="">Choose a repository…</option>
                  {consent.repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!selected && consent.repositories.length === 0 && (
              <p className={s.statusText}>
                Your account has no repositories available for this request.
              </p>
            )}
          </div>
          {selected && (
            <>
              <div className={s.scope}>
                <span className={s.branch}>
                  <GitBranch size={16} aria-hidden="true" />
                  <code>{selected.branch}</code>
                </span>
                <span>
                  {mode !== 'read' && selected.readinessDetail && <>{selected.readinessDetail} </>}
                  {selected.outcome === 'unknown' || selected.outcome === 'read_only'
                    ? selected.detail
                    : mode === 'read'
                      ? 'Read content and history only.'
                      : mode === 'prepare' && selected.outcome === 'eligible'
                        ? 'You decide which changes to commit.'
                        : selected.detail}
                </span>
              </div>
              <details className={s.advanced}>
                <summary>
                  Advanced settings <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className={s.fields}>
                  <label>
                    Access duration
                    <select
                      disabled={busy}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value) as DelegationDays)}
                    >
                      {[1, 7, 30].map((day) => (
                        <option key={day} value={day}>
                          {day} {day === 1 ? 'day' : 'days'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Writable branches
                    <select
                      disabled={busy || mode === 'read'}
                      value={mode === 'read' ? 'none' : branchOnly ? 'current' : 'all'}
                      onChange={(e) => setBranchOnly(e.target.value === 'current')}
                    >
                      {mode === 'read' && <option value="none">No writable branches</option>}
                      <option value="all">All branches, subject to their rules</option>
                      <option value="current">Only {selected.branch}</option>
                    </select>
                  </label>
                  <label>
                    Agent actions
                    <select
                      disabled={busy || maximum === 'read'}
                      value={mode}
                      onChange={(e) => setMode(e.target.value as DelegationMode)}
                    >
                      {permittedModes(maximum).map((action) => (
                        <option key={action} value={action}>
                          {delegationModes[action]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </>
          )}
          {loginRequired && (
            <Link href={loginHref} className={s.primary}>
              Sign in to continue
            </Link>
          )}
          {error && (
            <p role="alert" className={s.statusText}>
              {error}
            </p>
          )}
        </div>
        <div className={s.footer}>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            onClick={() => void finish('cancel')}
          >
            Cancel
          </button>
          {selected && (
            <button
              type="button"
              className={s.primary}
              disabled={busy || !canApprove}
              onClick={() => void finish('approve')}
            >
              {busy
                ? 'Returning to client…'
                : repair
                  ? 'Complete authorization'
                  : 'Authorize and start'}{' '}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </article>
      <p className={s.note}>
        <ShieldCheck size={15} aria-hidden="true" />
        You can revoke access in repository settings at any time.
      </p>
    </>
  );
}
