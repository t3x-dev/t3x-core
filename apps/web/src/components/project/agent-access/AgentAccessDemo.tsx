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
import { useEffect, useRef, useState } from 'react';
import styles from './AgentAccessDemo.module.css';

const scenarios = {
  personal: 'Personal repository',
  protected: 'Independent review required',
  empty: 'Empty repository',
  offline: 'Client not connected',
  readonly: 'Read-only MCP service',
  policy: 'Existing grant missing a branch policy',
  completed: 'First commit returned',
} as const;
type Scenario = keyof typeof scenarios;
type Mode = 'commit' | 'prepare' | 'read';
type Preview = {
  scenario: Scenario;
  stage: 'confirm' | 'active' | 'revoked';
  mode: Mode;
  branchOnly: boolean;
  days: string;
};

const initial: Preview = {
  scenario: 'personal',
  stage: 'confirm',
  mode: 'commit',
  branchOnly: false,
  days: '7',
};

// Only simulated UI choices survive client navigation. A reload starts a fresh preview.
const previews = new Map<string, Preview>();

function branchOutcome({ scenario, mode }: Preview) {
  if (mode === 'read' || scenario === 'readonly') return 'Read content and history only.';
  if (scenario === 'protected') return 'An independent reviewer must approve each change.';
  if (scenario === 'empty') return 'Choose a data structure before the first content commit.';
  if (mode === 'prepare') return 'Codex prepares changes for your review.';
  if (scenario === 'policy') return 'A branch policy is needed to create a fixed Review.';
  return 'Codex can commit its changes after checks pass.';
}

function grantResult(preview: Preview, branch: string) {
  if (preview.scenario === 'offline')
    return {
      title: 'Waiting for Codex to connect',
      detail: 'Access is authorized. Connect the client to start using this repository.',
    };
  if (preview.scenario === 'policy')
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

export function AgentAccessDemo({
  repository,
  branch,
  backHref,
}: {
  repository: string;
  branch: string;
  backHref: string;
}) {
  const previewKey = JSON.stringify([repository, branch]);
  const [preview, setPreview] = useState(initial);
  const demoControls = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setPreview(previews.get(previewKey) ?? initial);
  }, [previewKey]);

  function update(next: Preview) {
    previews.set(previewKey, next);
    setPreview(next);
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
  const title =
    stage === 'confirm'
      ? `Let Codex work on ${name}?`
      : stage === 'revoked'
        ? 'Codex access revoked'
        : result.title;
  const detail =
    stage === 'confirm'
      ? isReadOnly
        ? 'Codex can look up content and inspect committed versions on your behalf.'
        : preview.branchOnly
          ? `Codex can read this repository, edit content on ${branch} and run its checks.`
          : 'Codex can organize sources and edit content across this repository. Each branch keeps its review rules.'
      : stage === 'revoked'
        ? 'Codex can no longer use this grant. You can continue working with the saved drafts and commits.'
        : result.detail;

  return (
    <section aria-label="Repository agent access" className={styles.page}>
      <div className={styles.topbar}>
        <Link className={styles.back} href={backHref}>
          <ArrowLeft size={16} aria-hidden="true" />
          {repository}
        </Link>
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
      </div>
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
                      onChange={(e) => update({ ...preview, days: e.target.value })}
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
                        update({ ...preview, branchOnly: e.target.value === 'current' })
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
                      onChange={(e) => update({ ...preview, mode: e.target.value as Mode })}
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
                  onClick={() => update({ ...preview, stage: 'active' })}
                >
                  Authorize and start <ArrowRight size={16} aria-hidden="true" />
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
                {scenario === 'offline' || scenario === 'policy' ? (
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
                    Back to repository <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
            {stage === 'revoked' && (
              <>
                <Link className={styles.secondary} href={backHref}>
                  Back to repository
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
