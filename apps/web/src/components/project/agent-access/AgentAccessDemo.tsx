'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  ChevronDown,
  FlaskConical,
  GitBranch,
  GitCommitHorizontal,
  ShieldCheck,
  SquareTerminal,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { T3XMark } from '@/components/layout/T3XMark';
import styles from './AgentAccessDemo.module.css';

import {
  initial,
  type Mode,
  type Preview,
  readDemoAccess,
  type Scenario,
  scenarios,
  writeDemoAccess,
} from './agentAccessPreview';

function branchOutcome({ scenario, mode }: Preview) {
  if (mode === 'read' || scenario === 'readonly') return 'Read content and history only.';
  if (scenario === 'protected') return 'An independent reviewer must approve each change.';
  if (scenario === 'empty') return 'Choose a data structure before the first content commit.';
  if (scenario === 'policy') return 'A branch policy is needed to create a fixed Review.';
  if (mode === 'prepare') return 'Codex prepares changes for your review.';
  return 'Codex can commit its changes after checks pass.';
}

function grantResult(preview: Preview, branch: string) {
  if (preview.scenario === 'offline')
    return {
      title: 'Waiting for Codex to connect',
      detail: 'Access is authorized. Connect the client to start using this repository.',
    };
  if (preview.scenario === 'policy' && preview.mode !== 'read')
    return {
      title: 'Your draft is saved',
      detail:
        'Replay and Schema checks passed. Complete this grant so Codex can prepare a fixed Review on this branch.',
    };
  if (preview.scenario === 'completed')
    return {
      title: 'Codex returned a commit',
      detail:
        'Codex changed the owner of “Year in review” from Maya to Sam. The committed version contains the new owner.',
    };
  if (preview.scenario === 'readonly')
    return {
      title: 'Connected with read access',
      detail:
        'This MCP service exposes reading tools only. Its operator can enable editing for this connection.',
    };
  if (preview.mode === 'read')
    return {
      title: 'Codex can read this repository',
      detail: 'Ask Codex to look up content, inspect history or read a committed version.',
    };
  if (preview.scenario === 'empty')
    return {
      title: 'Codex can start collecting sources',
      detail:
        'When the first change needs a Schema, Codex will show you the suggested structure to adopt.',
    };
  if (preview.scenario === 'protected' || preview.mode === 'prepare')
    return {
      title: 'Codex can prepare changes',
      detail:
        preview.scenario === 'protected'
          ? 'Codex will hand the fixed Review to an eligible reviewer before a change reaches this branch.'
          : 'Codex will return a fixed Review. You decide which changes to submit.',
    };
  return {
    title: 'Codex is ready to work',
    detail: `You can now ask Codex to edit this repository and commit eligible changes to ${branch}.`,
  };
}

interface AgentAccessDemoProps {
  repository: string;
  branch: string;
  backHref: string;
  backLabel?: string;
  scenario?: Scenario;
  request?: {
    task: string;
    required: Mode;
    repositoryPicker?: ReactNode;
    onAuthorized: (grant: Preview) => void;
  };
}

export function AgentAccessDemo(props: AgentAccessDemoProps) {
  const identity = JSON.stringify([
    props.repository,
    props.branch,
    props.scenario,
    props.request?.task,
  ]);
  return <AccessForm key={identity} {...props} />;
}

function AccessForm({
  repository,
  branch,
  backHref,
  backLabel,
  scenario: targetScenario,
  request,
}: AgentAccessDemoProps) {
  const [preview, setPreview] = useState<Preview>({
    ...initial,
    scenario: targetScenario ?? 'personal',
  });
  const [loaded, setLoaded] = useState(false);
  const confirmed = useRef(false);
  const demoControls = useRef<HTMLDetailsElement>(null);
  const isRequest = Boolean(request);
  const required = request?.required;
  useEffect(() => {
    const saved = readDemoAccess(repository, branch, targetScenario);
    const policyRepaired =
      targetScenario === 'policy' && saved.stage === 'active' && saved.scenario === 'personal';
    const widen = required === 'commit' || (required === 'prepare' && saved.mode === 'read');
    setPreview({
      ...saved,
      mode: widen ? required : saved.mode,
      scenario: policyRepaired ? 'personal' : (targetScenario ?? saved.scenario),
      stage: isRequest ? 'confirm' : saved.stage,
    });
    setLoaded(true);
  }, [repository, branch, targetScenario, isRequest, required]);

  useEffect(() => {
    if (preview.stage !== 'active' || !preview.expiresAt) return;
    const deadline = preview.expiresAt;
    let timer: ReturnType<typeof setTimeout>;
    function checkExpiry() {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setPreview((current) => ({ ...current, stage: 'confirm', expiresAt: undefined }));
      } else {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      }
    }
    checkExpiry();
    return () => clearTimeout(timer);
  }, [preview.stage, preview.expiresAt]);

  function update(next: Preview) {
    writeDemoAccess(repository, branch, next);
    setPreview(readDemoAccess(repository, branch));
  }

  function authorize() {
    if (!loaded || !repository || (isRequest && confirmed.current)) return;
    confirmed.current = true;
    const next: Preview = {
      ...preview,
      mode: preview.scenario === 'readonly' ? 'read' : preview.mode,
      scenario:
        preview.scenario === 'policy' && preview.mode !== 'read' ? 'personal' : preview.scenario,
      stage: 'active',
      expiresAt: Date.now() + Number(preview.days) * 86_400_000,
    };
    update(next);
    request?.onAuthorized(next);
  }

  function selectScenario(scenario: Scenario) {
    update({
      ...initial,
      scenario,
      stage: scenario === 'policy' || scenario === 'completed' ? 'active' : 'confirm',
    });
    if (demoControls.current) {
      demoControls.current.open = false;
      demoControls.current.querySelector('summary')?.focus();
    }
  }

  const { stage, scenario } = preview;
  const result = grantResult(preview, branch);
  const name = repository.split('/').filter(Boolean).at(-1) ?? repository;
  const scope = branchOutcome(preview);
  const isReadOnly = preview.mode === 'read' || scenario === 'readonly';
  const needsPolicy = scenario === 'policy' && !isReadOnly;
  const title =
    stage === 'confirm'
      ? needsPolicy
        ? 'Complete access for this branch?'
        : `Let Codex work on ${name}?`
      : stage === 'revoked'
        ? 'Codex access revoked'
        : result.title;
  const detail =
    stage === 'confirm'
      ? needsPolicy
        ? preview.mode === 'prepare'
          ? 'The saved draft passed Replay and Schema checks. Allow Codex to prepare a fixed Review for your decision.'
          : 'The saved draft passed Replay and Schema checks. Allow Codex to prepare its fixed Review and commit eligible changes on your behalf.'
        : isReadOnly
          ? 'Codex can look up content and inspect committed versions on your behalf.'
          : preview.branchOnly
            ? `Codex can read this repository, edit content on ${branch} and run its checks.`
            : 'Codex can organize sources and edit content across this repository. Each branch keeps its review rules.'
      : stage === 'revoked'
        ? 'Codex can no longer use this grant. You can continue working with the saved drafts and commits.'
        : result.detail;

  const header = (
    <div className={styles.topbar}>
      {isRequest && (
        <span className={styles.brand}>
          <T3XMark /> T3X
        </span>
      )}
      <Link className={styles.back} href={backHref}>
        <ArrowLeft size={16} aria-hidden="true" />
        {backLabel ?? repository}
      </Link>
      {!isRequest && !targetScenario && (
        <details ref={demoControls} className={styles.demo}>
          <summary>
            <FlaskConical size={15} aria-hidden="true" /> Demo controls
          </summary>
          <div className={styles.demoPanel}>
            <label>
              Preview scenario
              <select
                className={styles.select}
                value={scenario}
                onChange={(e) => selectScenario(e.target.value as Scenario)}
              >
                {Object.entries(scenarios).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => selectScenario(scenario)}
            >
              Restart scenario
            </button>
          </div>
        </details>
      )}
    </div>
  );

  if (request && !repository) {
    return (
      <section aria-label="Repository selection" className={styles.page}>
        {header}
        <div className={styles.body}>
          <article className={styles.card}>
            <div className={styles.content}>
              <h1 className={styles.title}>Choose a repository</h1>
              <p className={styles.description}>
                Select the repository Codex should use for this task.
              </p>
              <div className={styles.requestContext}>
                <dl>
                  <div>
                    <dt>Task from Codex</dt>
                    <dd>{request.task}</dd>
                  </div>
                </dl>
                {request.repositoryPicker}
              </div>
            </div>
            <div className={styles.footer}>
              <Link className={styles.secondary} href={backHref}>
                Cancel
              </Link>
            </div>
          </article>
        </div>
      </section>
    );
  }

  if (!loaded) {
    return (
      <div className={styles.page}>
        <div className={styles.body}>
          <output>Loading Agent access…</output>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Repository agent access" className={styles.page}>
      {header}
      <div className={styles.body}>
        <article className={styles.card}>
          <div className={styles.content}>
            <div className={styles.identity} aria-hidden="true">
              <span className={styles.agentIcon}>
                <SquareTerminal />
              </span>
              <span className={styles.connector}>
                <ArrowRight size={16} />
              </span>
              <span className={styles.repoIcon}>
                <BookMarked />
              </span>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.description}>{detail}</p>
            </div>
            {request && (
              <div className={styles.requestContext}>
                <dl>
                  <div>
                    <dt>Task from Codex</dt>
                    <dd>{request.task}</dd>
                  </div>
                  {!request.repositoryPicker && (
                    <div>
                      <dt>Repository</dt>
                      <dd>{repository}</dd>
                    </div>
                  )}
                </dl>
                {request.repositoryPicker}
              </div>
            )}
            {stage !== 'revoked' && (
              <div className={styles.scope}>
                <span className={styles.branch}>
                  <GitBranch size={16} aria-hidden="true" />
                  <code>{branch}</code>
                </span>
                <span>{scope}</span>
              </div>
            )}
            {stage === 'confirm' && (
              <details className={styles.advanced}>
                <summary>
                  Advanced settings <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <div className={styles.fields}>
                  <label>
                    Access duration
                    <select
                      className={styles.select}
                      value={preview.days}
                      onChange={(e) => setPreview({ ...preview, days: e.target.value })}
                    >
                      <option value="1">1 day</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </label>
                  <label>
                    Writable branches
                    <select
                      className={styles.select}
                      disabled={isReadOnly}
                      value={isReadOnly ? 'none' : preview.branchOnly ? 'current' : 'all'}
                      onChange={(e) =>
                        setPreview({ ...preview, branchOnly: e.target.value === 'current' })
                      }
                    >
                      {isReadOnly && <option value="none">No writable branches</option>}
                      <option value="all">All branches, subject to their rules</option>
                      <option value="current">Only {branch}</option>
                    </select>
                  </label>
                  <label>
                    Agent actions
                    <select
                      className={styles.select}
                      value={isReadOnly ? 'read' : preview.mode}
                      disabled={scenario === 'readonly'}
                      onChange={(e) => setPreview({ ...preview, mode: e.target.value as Mode })}
                    >
                      <option value="commit">Submit eligible changes</option>
                      <option value="prepare">Prepare changes for my review</option>
                      <option value="read">Read only</option>
                    </select>
                  </label>
                </div>
              </details>
            )}
            {stage === 'active' && (
              <details className={styles.advanced}>
                <summary>
                  Access details <ChevronDown size={15} aria-hidden="true" />
                </summary>
                <p className={styles.statusText}>
                  Granted for {preview.days} {preview.days === '1' ? 'day' : 'days'}.{' '}
                  {isReadOnly
                    ? 'Read access only.'
                    : preview.branchOnly
                      ? `Writes are limited to ${branch}.`
                      : 'Each branch keeps its own rules.'}
                </p>
                {!isRequest && (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setPreview({ ...preview, stage: 'confirm' })}
                  >
                    Edit or renew access
                  </button>
                )}
              </details>
            )}
            {stage === 'active' && scenario === 'completed' && (
              <details className={styles.advanced}>
                <summary>
                  <GitCommitHorizontal size={16} aria-hidden="true" /> Inspect sample version
                </summary>
                <p className={styles.statusText}>
                  Review #1 · Accepted by Codex on your behalf. Read back from the sample commit:{' '}
                  <code>owner = Sam</code>.
                </p>
              </details>
            )}
          </div>
          <div className={styles.footer}>
            {stage === 'confirm' && (
              <>
                <Link className={styles.secondary} href={backHref}>
                  Cancel
                </Link>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!loaded}
                  onClick={authorize}
                >
                  {needsPolicy ? 'Complete authorization' : 'Authorize and start'}{' '}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </>
            )}
            {stage === 'active' && (
              <>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => update({ ...preview, stage: 'revoked' })}
                >
                  Revoke access
                </button>
                {scenario === 'offline' || needsPolicy ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => update({ ...preview, scenario: 'personal' })}
                  >
                    {scenario === 'offline' ? 'Connect Codex' : 'Complete authorization'}{' '}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <Link className={styles.primary} href={backHref}>
                    {backLabel ?? 'Back to repository'} <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
            {stage === 'revoked' && (
              <>
                <Link className={styles.secondary} href={backHref}>
                  {backLabel ?? 'Back to repository'}
                </Link>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    update({
                      ...preview,
                      stage: 'confirm',
                      scenario: scenario === 'completed' ? 'personal' : scenario,
                    })
                  }
                >
                  Authorize again
                </button>
              </>
            )}
          </div>
        </article>
        <p className={styles.note}>
          <ShieldCheck aria-hidden="true" size={15} />{' '}
          {stage === 'revoked'
            ? 'Your repository history is preserved.'
            : 'You can revoke access in repository settings at any time.'}
        </p>
        <p className={styles.note}>
          <FlaskConical aria-hidden="true" size={14} /> Interactive demo. All permissions and
          outcomes are simulated.
        </p>
      </div>
    </section>
  );
}
