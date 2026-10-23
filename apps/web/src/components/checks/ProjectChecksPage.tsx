'use client';

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  CHECK_KIND_LABELS,
  type CheckRecord,
  checkRecordView,
  checksHref,
  checksReturnTo,
  decodeCheckRecordId,
  object,
  textValue,
} from '@/domain/project/checks';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';
import { useProjectChecks } from '@/hooks/projects/useProjectChecks';
import styles from './ProjectChecksPage.module.css';

export function ProjectChecksPage({
  projectId,
  recordId: routeRecordId,
}: {
  projectId: string;
  recordId?: string;
}) {
  const recordId = decodeCheckRecordId(routeRecordId);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const router = useRouter();
  const params = new URLSearchParams(query);
  const { current, refresh } = useProjectChecks(projectId, recordId, query);
  const scoped = ['kind', 'workspace', 'pr', 'commit', 'cursor', 'q'].some((key) =>
    params.has(key)
  );
  const returnTo = checksReturnTo(params.get('returnTo'), projectId, pathname);
  const listParams = new URLSearchParams(query);
  listParams.delete('check');
  const listHref = `${getProjectIdRepoPath(projectId)}/checks${listParams.size ? `?${listParams}` : ''}`;
  const sourceHref = recordId ? (returnTo ?? listHref) : returnTo;
  function filter(name: string, value: string) {
    const next = new URLSearchParams(query);
    next.delete('cursor');
    if (value) next.set(name, value);
    else next.delete(name);
    router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          {sourceHref ? (
            <Link className={styles.back} href={sourceHref}>
              <ArrowLeft size={15} /> {returnTo ? 'Back to source' : 'Checks'}
            </Link>
          ) : null}
          <h1>{recordId ? 'Check details' : 'Checks'}</h1>
          <p>
            {recordId
              ? 'Results and evidence for the selected record.'
              : 'Review evidence, validation runs, and current pull request checks.'}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={!current} onClick={() => refresh()}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </header>
      {!recordId ? (
        <div className={styles.toolbar}>
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              filter('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
            }}
          >
            <input
              key={params.get('q') ?? ''}
              name="q"
              type="search"
              aria-label="Search check records"
              placeholder="Search names, Workspace, PR or record IDs…"
              defaultValue={params.get('q') ?? ''}
              maxLength={200}
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <label>
            Record type
            <select
              value={params.get('kind') ?? ''}
              onChange={(e) => filter('kind', e.target.value)}
            >
              <option value="">All records</option>
              {Object.entries(CHECK_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {['workspace', 'pr', 'commit'].map((name) =>
            params.get(name) ? (
              <button
                key={name}
                className={styles.scope}
                onClick={() => filter(name, '')}
                type="button"
              >
                {name}: {params.get(name)} ×<span className="sr-only"> Clear {name} filter</span>
              </button>
            ) : null
          )}
          <Link href={`${getProjectIdRepoPath(projectId)}?tab=workspaces`}>
            Open Workspaces <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}
      {!current ? (
        <output className={styles.empty}>Loading checks…</output>
      ) : current.error ? (
        <div role="alert" className={styles.empty}>
          <h2>Checks unavailable</h2>
          <p>{current.error}</p>
          <Button variant="outline" onClick={() => refresh()}>
            Try again
          </Button>
        </div>
      ) : recordId && current.records[0] ? (
        <CheckDetails
          record={current.records[0]}
          projectId={projectId}
          selectedCheck={params.get('check')}
          onSelect={(id) => {
            const next = new URLSearchParams(query);
            next.set('check', id);
            router.replace(`${pathname}?${next}`, { scroll: false });
          }}
        />
      ) : current.records.length ? (
        <>
          <section className={styles.list} aria-label="Check records">
            {current.records.map((record) => {
              const view = checkRecordView(record);
              return (
                <Link
                  className={styles.row}
                  key={record.id}
                  href={checksHref(projectId, {
                    recordId: record.id,
                    returnTo: `${pathname}${query ? `?${query}` : ''}`,
                  })}
                >
                  <Status status={view.status} />
                  <div className={styles.rowMain}>
                    <strong>{view.title}</strong>
                    <span>{view.target}</span>
                  </div>
                  <div className={styles.rowMeta}>
                    <span>{CHECK_KIND_LABELS[record.kind]}</span>
                    <time dateTime={record.created_at}>{formatDate(record.created_at)}</time>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              );
            })}
          </section>
          <nav className={styles.pagination} aria-label="Checks pagination">
            {params.has('cursor') ? (
              <Button variant="outline" size="sm" onClick={() => filter('cursor', '')}>
                Newest records
              </Button>
            ) : (
              <span />
            )}
            {current.next ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => filter('cursor', current.next ?? '')}
              >
                Older records <ArrowRight size={14} />
              </Button>
            ) : null}
          </nav>
        </>
      ) : (
        <div className={styles.empty}>
          <h2>{scoped ? 'No checks match this scope' : 'No check records yet'}</h2>
          <p>
            Prepare a review in a Workspace or run checks from a pull request to record evidence.
          </p>
          <Link href={`${getProjectIdRepoPath(projectId)}?tab=workspaces`}>Open Workspaces</Link>
        </div>
      )}
    </div>
  );
}

function CheckDetails({
  record,
  projectId,
  selectedCheck,
  onSelect,
}: {
  record: CheckRecord;
  projectId: string;
  selectedCheck: string | null;
  onSelect: (id: string) => void;
}) {
  const view = checkRecordView(record);
  const p = record.payload;
  const selected =
    view.items.find((item) => item.id === selectedCheck) ??
    view.items.find((item) => !['passed', 'skipped'].includes(item.status)) ??
    view.items[0];
  const base = getProjectIdRepoPath(projectId);
  const snapshot = object(p.snapshot);
  const precondition = object(object(snapshot.review).precondition);
  const metadata =
    record.kind === 'review'
      ? {
          Snapshot: p.snapshot_id,
          Transition: p.transition_id,
          Revision: precondition.workspaceRevision,
          'Base head': precondition.refHead,
          'Review digest': p.review_digest,
          'Policy digest': precondition.policyDigest,
          Decision: object(object(snapshot.transition).decision).outcome,
          'Previous snapshot': p.supersedes_snapshot_id,
        }
      : record.kind === 'pull-request'
        ? {
            'Source head': p.source_commit_hash,
            'Target head': p.target_base_commit_hash,
            'PR status': p.status,
          }
        : {
            Subject: p.subject_hash ?? p.commit_hash,
            Input: p.input_hash,
            Workflow: p.workflow_hash,
            Validator: p.validator_hash ?? p.validator_version,
            Environment: p.environment_hash,
            Schema: p.schema_hash,
          };
  const workspaceQuery = new URLSearchParams({ tab: 'workspaces', workspace: view.workspace });
  if (view.branch) workspaceQuery.set('branch', view.branch);
  return (
    <>
      <section className={styles.summary} aria-label="Checked target">
        <div className={styles.title}>
          <Status status={view.status} />
          <h2>{view.title}</h2>
          <span className={styles.kind}>{CHECK_KIND_LABELS[record.kind]}</span>
        </div>
        <p>{view.notice}</p>
        <div className={styles.identifier}>
          <code>{record.id}</code>
          <time dateTime={record.created_at}>
            {record.kind === 'pull-request' ? 'Updated ' : 'Recorded '}
            {formatDate(record.created_at)}
          </time>
        </div>
        <div className={styles.actions}>
          {view.snapshot ? (
            <Link
              href={workspaceReviewHref(projectId, view.workspace, {
                snapshotId: view.snapshot,
                branch: view.branch,
              })}
            >
              Open Review snapshot <ArrowRight size={14} />
            </Link>
          ) : null}
          {view.workspace ? (
            <Link href={`${base}?${workspaceQuery}`}>
              Open current Workspace <ArrowRight size={14} />
            </Link>
          ) : null}
          {record.kind === 'pull-request' ? (
            <Link href={`${base}?tab=pull-requests&pr=${p.number}&prTab=checks`}>
              Open PR checks <ArrowRight size={14} />
            </Link>
          ) : null}
          {view.commit ? (
            <Link href={checksHref(projectId, { commit: view.commit })}>
              Commit checks <ArrowRight size={14} />
            </Link>
          ) : null}
          {view.workspace ? (
            <Link href={checksHref(projectId, { workspace: view.workspace })}>
              Workspace check history <ArrowRight size={14} />
            </Link>
          ) : null}
          {view.commit ? (
            <Link href={`${base}?${new URLSearchParams({ commit: view.commit })}`}>
              View checked commit <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
        <details>
          <summary>Checked version and evidence identifiers</summary>
          <dl className={styles.metadata}>
            {Object.entries(metadata)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{textValue(value)}</dd>
                </div>
              ))}
          </dl>
        </details>
      </section>
      <div className={styles.workbench}>
        <nav className={styles.items} aria-label="Checks in this record">
          {view.items.map((item) => (
            <button
              aria-current={item.id === selected?.id ? 'true' : undefined}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span>{item.title}</span>
              <Status status={item.status} />
            </button>
          ))}
        </nav>
        <section className={styles.detail} aria-label="Selected check">
          {selected ? (
            <>
              <div className={styles.title}>
                <h2>{selected.title}</h2>
                <Status status={selected.status} />
              </div>
              <p>{selected.summary}</p>
              {selected.findings.length ? (
                <section>
                  <h3>Findings ({selected.findings.length})</h3>
                  {selected.findings.map((finding, index) => (
                    <div
                      className={styles.finding}
                      key={`${finding.code}:${finding.path}:${index}`}
                    >
                      <strong>{finding.code}</strong>
                      <code>{finding.path}</code>
                      <p>{finding.message}</p>
                    </div>
                  ))}
                  {view.workspace ? (
                    <p>
                      These paths belong to the recorded input. Open the current Workspace to make
                      changes.
                    </p>
                  ) : null}
                </section>
              ) : null}
              {selected.log ? (
                <section>
                  <h3>Log excerpt</h3>
                  <pre>{selected.log}</pre>
                  {selected.truncated ? <p>The stored log is truncated.</p> : null}
                </section>
              ) : null}
              {selected.evidence !== undefined ? (
                <details>
                  <summary>Recorded evidence</summary>
                  <pre>{JSON.stringify(selected.evidence, null, 2)}</pre>
                </details>
              ) : null}
            </>
          ) : (
            <p>No check results have been recorded for this PR. Open the PR to run its checks.</p>
          )}
        </section>
      </div>
      {record.kind === 'review' ? (
        <details>
          <summary>Recorded review, decision and object references</summary>
          {textValue(p.supersedes_snapshot_id) ? (
            <Link
              href={checksHref(projectId, {
                recordId: `review:${textValue(p.supersedes_snapshot_id)}`,
              })}
            >
              View previous snapshot
            </Link>
          ) : null}
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--stroke-divider)] p-3 text-xs">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </details>
      ) : null}
    </>
  );
}

function Status({ status }: { status: string }) {
  const passed = status === 'passed';
  const failed = ['failed', 'blocked', 'timed_out', 'environment_required'].includes(status);
  const Icon = passed ? CheckCircle2 : failed ? XCircle : CircleDashed;
  return (
    <span className={`${styles.status} ${passed ? styles.passed : failed ? styles.failed : ''}`}>
      <Icon size={15} aria-hidden="true" />
      {status.replaceAll('_', ' ') || 'Unknown'}
    </span>
  );
}
function formatDate(value: string) {
  return Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Time not recorded';
}
