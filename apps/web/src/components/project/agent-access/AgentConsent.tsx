'use client';

import { ArrowRight, ChevronDown, GitBranch, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { T3XMark } from '@/components/layout/T3XMark';
import {
  type AttemptStatus,
  authorizationPage,
  type ConsentDecision,
  type DelegationConsent,
  delegationModes,
  permittedModes,
  selectionLabel,
} from '@/domain/mcpDelegation';
import { getProjectIdRepoPath, repositoryAgentAccessHref } from '@/domain/project/repoPath';
import { useDelegationConsent } from '@/hooks/access/useMcpDelegations';
import s from './AgentAccessDemo.module.css';

const outcomes: Record<Exclude<AttemptStatus, 'pending'>, string> = {
  approved: 'Access approved. Return to your client to finish connecting.',
  cancelled: 'Authorization cancelled. Start a new connection in your client.',
  expired: 'This request expired. Start a new connection in your client.',
  token_issued:
    'Access approved and a token issued. Return to your client to check the connection.',
  spent_without_token: 'No token was issued. Start a new connection in your client.',
  code_expired: 'The authorization code expired. Start a new connection in your client.',
  closed: 'This request has ended. Start again in your client.',
};

export function AgentConsent() {
  const original = new URLSearchParams(useSearchParams().toString());
  // Only explicit choices made on this page can select a saved connection or change preview terms.
  for (const key of ['task', 'projectId', 'useSelection', 'requestedMode', 'days', 'branchOnly'])
    original.delete(key);
  const request = original.toString();
  return <ConsentRequest key={request} request={request} />;
}

function ConsentRequest({ request }: { request: string }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(request);
  for (const [key, value] of Object.entries(choices)) if (value) params.set(key, value);
  const query = params.toString();
  const consent = useDelegationConsent(query);
  const loginHref = `/login?${new URLSearchParams({ callbackUrl: `${authorizationPage}?${request}` })}`;
  function choose(key: string, value: string) {
    setNotice('');
    if (key === 'projectId' || key === 'useSelection') setChoices({ [key]: value });
    else setChoices((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <section aria-label="Agent authorization" className={s.page}>
      <header className={s.topbar}>
        <span className={s.brand}>
          <T3XMark /> T3X
        </span>
      </header>
      <div className={s.body}>
        {notice && <output className={s.scope}>{notice}</output>}
        {consent.data ? (
          consent.data.status === 'pending' ? (
            <ConsentCard
              key={query}
              consent={consent.data}
              decide={consent.decide}
              choose={choose}
              selectedSuggestion={choices.useSelection || ''}
              hasReference={params.has('preselection')}
              advanced={advanced}
              toggle={() => setAdvanced(!advanced)}
              refresh={(message) => {
                setNotice(message);
                consent.reload();
              }}
            />
          ) : (
            <article className={s.card}>
              <div className={s.content}>
                <h1 className={s.title}>Authorization status</h1>
                <output className={s.description}>{outcomes[consent.data.status]}</output>
              </div>
            </article>
          )
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
                type="button"
                className={s.secondary}
                onClick={Object.keys(choices).length ? () => setChoices({}) : consent.reload}
              >
                {Object.keys(choices).length ? 'Reset selection' : 'Try again'}
              </button>
            </div>
          </article>
        ) : (
          <output>Loading the authorization preview…</output>
        )}
      </div>
    </section>
  );
}

function ConsentCard({
  consent,
  decide,
  choose,
  selectedSuggestion,
  hasReference,
  advanced,
  toggle,
  refresh,
}: {
  consent: DelegationConsent;
  decide: ReturnType<typeof useDelegationConsent>['decide'];
  choose: (key: string, value: string) => void;
  selectedSuggestion: string;
  hasReference: boolean;
  advanced: boolean;
  toggle: () => void;
  refresh: (message: string) => void;
}) {
  const { clientName, selected, mode, branchOnly, days, previewVersion } = consent;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function finish(decision: ConsentDecision['decision']) {
    if (!previewVersion || sending.current || (decision === 'approve' && !selected)) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await decide({
        decision,
        previewVersion,
        ...(selected && { projectId: selected.id, branch: selected.branch }),
        days,
        mode,
        branchOnly,
      });
      if (!active.current) return;
      const destination = new URL(result.redirectTo);
      if (!['https:', 'http:'].includes(destination.protocol))
        throw new Error('T3X returned an invalid client callback.');
      window.location.assign(destination.href);
    } catch (cause) {
      if (!active.current) return;
      const code = cause instanceof Error && 'code' in cause ? cause.code : null;
      if (code === 'UNAUTHENTICATED') {
        refresh('Your session changed. Sign in to review this request.');
        return;
      }
      if (code === 'PREVIEW_CONFLICT' || code === 'DELEGATION_UNAVAILABLE') {
        refresh('The request changed. Review the latest authorization status and permissions.');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
      sending.current = false;
      setBusy(false);
    }
  }
  const singleBranch = mode !== 'read' && branchOnly;
  const subject = selected?.name.split('/').at(-1);
  const scope =
    mode === 'read'
      ? 'Read this repository.'
      : singleBranch
        ? `Read this repository. Edit content only on ${selected?.branch}.`
        : 'Read this repository. Edit content on all branches, subject to their rules.';
  return (
    <>
      <article className={s.card}>
        <div className={s.content}>
          <h1 className={s.title}>
            {selected ? `Let ${clientName} work on ${subject}?` : 'Choose a repository'}
          </h1>
          <p className={s.description}>
            {selected ? scope : `Select the repository ${clientName} should use.`}
          </p>
          <div className={s.requestContext}>
            <dl>
              <div>
                <dt>T3X account</dt>
                <dd>{consent.account.name || consent.account.id}</dd>
              </div>
              {consent.repositoryLocked && selected && (
                <div>
                  <dt>Repository</dt>
                  <dd>{selected.name}</dd>
                </div>
              )}
            </dl>
            {!hasReference && (consent.preselections.length > 0 || selectedSuggestion) && (
              <label className={s.field}>
                Use this saved selection
                <select
                  className={s.select}
                  disabled={busy}
                  value={selectedSuggestion}
                  onChange={(e) => choose('useSelection', e.target.value)}
                >
                  <option value="">Continue without a saved selection</option>
                  {consent.preselections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.repository} · {item.branch} · {selectionLabel(item.id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!consent.repositoryLocked && (
              <label className={s.field}>
                Repository
                <select
                  className={s.select}
                  disabled={busy}
                  value={selected?.id ?? ''}
                  onChange={(e) => choose('projectId', e.target.value)}
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
                  {selected.detail}
                  {mode !== 'read' && selected.readinessDetail && <> {selected.readinessDetail}</>}
                </span>
              </div>
              {consent.priorGrant && (
                <p role="note" className={s.description}>
                  This approval replaces {consent.priorGrant.clientName}’s existing access to{' '}
                  {selected.name}. Other devices using that grant will need to reconnect.
                </p>
              )}
              <details className={s.advanced} open={advanced}>
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    toggle();
                  }}
                >
                  Advanced settings <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className={s.fields}>
                  <label>
                    Access duration
                    <select
                      disabled={busy}
                      value={days}
                      onChange={(e) => choose('days', e.target.value)}
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
                      onChange={(e) => choose('branchOnly', String(e.target.value === 'current'))}
                    >
                      {mode === 'read' && <option value="none">No writable branches</option>}
                      <option value="all">All branches, subject to their rules</option>
                      <option value="current">Only {selected.branch}</option>
                    </select>
                  </label>
                  <label>
                    Agent actions
                    <select
                      disabled={busy || consent.scope === 'read'}
                      value={mode}
                      onChange={(e) => choose('requestedMode', e.target.value)}
                    >
                      {permittedModes(consent.scope).map((action) => (
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
            disabled={busy || !previewVersion}
            onClick={() => void finish('cancel')}
          >
            Cancel
          </button>
          {selected && (
            <button
              type="button"
              className={s.primary}
              disabled={busy || !previewVersion || selected.outcome === 'unknown'}
              onClick={() => void finish('approve')}
            >
              {busy ? 'Returning to client…' : 'Authorize and start'}{' '}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </article>
      {selected && (
        <p className={s.note}>
          <ShieldCheck size={15} aria-hidden="true" />
          <Link
            href={repositoryAgentAccessHref(getProjectIdRepoPath(selected.id), selected.branch)}
          >
            Manage or revoke access in repository settings
          </Link>
        </p>
      )}
    </>
  );
}
