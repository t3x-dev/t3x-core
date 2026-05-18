'use client';

/**
 * CommitOperationsSidebar — audit context for a committed snapshot.
 *
 * The commit detail page keeps creation actions in the tree index and uses this
 * right rail for provenance, source evidence, operation count, and hash chain.
 */

import { Copy, FileText, GitCommit, Leaf as LeafIcon, MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { shortHash } from '@/domain/format/formatters';
import type { ApiCommit } from '@/types/api';

interface CommitOperationsSidebarProps {
  projectId: string;
  commit: ApiCommit;
}

type SourceRef = NonNullable<ApiCommit['sources']>[number];

function SourceIcon({ type }: { type: string }) {
  if (type === 'conversation') {
    return <MessageSquare size={12} className="shrink-0 text-[var(--accent-conversation)]" />;
  }
  if (type === 'leaf') {
    return <LeafIcon size={12} className="shrink-0 text-[var(--accent-leaf)]" />;
  }
  return <FileText size={12} className="shrink-0 text-[var(--text-tertiary)]" />;
}

function sourceHref(projectId: string, source: SourceRef): string | null {
  if (source.type === 'conversation') return `/chat/${source.id}`;
  if (source.type === 'leaf') return `/project/${projectId}/leaf/${source.id}`;
  return null;
}

function AuditCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--fx-shadow-sm)]">
      <div className="p-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {title}
        </h3>
        <div className="mt-2 text-[11px] leading-5 text-[var(--text-tertiary)]">{children}</div>
      </div>
    </section>
  );
}

function HashPill({ label, hash }: { label: string; hash: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-2 py-1">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <span className="min-w-0 flex items-center gap-1">
        <span className="truncate font-mono text-[11px] font-semibold text-[var(--accent-commit)]">
          {shortHash(hash)}
        </span>
        <button
          type="button"
          className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          title={`Copy ${label} hash`}
          onClick={() => void navigator.clipboard?.writeText(hash)}
        >
          <Copy size={10} />
        </button>
      </span>
    </div>
  );
}

function SourceRow({ projectId, source }: { projectId: string; source: SourceRef }) {
  const href = sourceHref(projectId, source);
  const content = (
    <>
      <SourceIcon type={source.type} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
          {source.title || source.id}
        </div>
        <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          {source.type} · {source.id}
        </div>
      </div>
    </>
  );

  if (!href) {
    return <div className="flex items-start gap-2 rounded-md py-1">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="flex items-start gap-2 rounded-md py-1 transition-colors hover:bg-[var(--hover-bg)]"
    >
      {content}
    </Link>
  );
}

function formatMethod(method: string | undefined): string {
  if (!method) return 'not recorded';
  return method.replaceAll('_', ' ');
}

export function CommitOperationsSidebar({ projectId, commit }: CommitOperationsSidebarProps) {
  const sources = commit.sources ?? [];
  const yopsCount = commit.yops_log_ids?.length ?? 0;
  const operationSources = [
    yopsCount > 0 ? `${yopsCount} committed op${yopsCount === 1 ? '' : 's'}` : '0 committed ops',
    commit.provenance?.model ? commit.provenance.model : null,
  ].filter(Boolean);

  return (
    <aside className="hidden w-[276px] shrink-0 overflow-y-auto border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:block">
      <div className="flex min-h-[38px] items-center justify-between border-b border-[var(--stroke-divider)] px-3">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Commit Audit</span>
        <span className="rounded-full border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
          {shortHash(commit.hash)}
        </span>
      </div>

      <div className="space-y-3 p-3">
        <AuditCard title="Evidence">
          {sources.length > 0 ? (
            <div className="space-y-1">
              {sources.map((source) => (
                <SourceRow
                  key={`${source.type}-${source.id}`}
                  projectId={projectId}
                  source={source}
                />
              ))}
            </div>
          ) : (
            <p className="italic">No source references captured.</p>
          )}
        </AuditCard>

        <AuditCard title="YOps Operations">
          <div className="space-y-1">
            <p>{operationSources.join(' · ')}</p>
            <p>
              <span className="text-[var(--text-tertiary)]">method: </span>
              <span className="font-medium text-[var(--text-secondary)]">
                {formatMethod(commit.provenance?.method)}
              </span>
            </p>
          </div>
        </AuditCard>

        <AuditCard title="Hash Chain">
          <div className="space-y-1.5">
            {commit.parents.length > 0 ? (
              commit.parents.map((parent) => (
                <HashPill key={parent} label="parent" hash={parent} />
              ))
            ) : (
              <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-2 py-1 font-mono text-[11px] text-[var(--text-tertiary)]">
                parent: root
              </div>
            )}
            <HashPill label="hash" hash={commit.hash} />
          </div>
        </AuditCard>

        <AuditCard title="Snapshot">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5">
              <GitCommit size={11} className="text-[var(--accent-commit)]" />
              {commit.content.trees.length} tree{commit.content.trees.length === 1 ? '' : 's'} ·{' '}
              {commit.content.relations.length} relation
              {commit.content.relations.length === 1 ? '' : 's'}
            </p>
            <p className="flex items-center gap-1.5">
              <Sparkles size={11} className="text-[var(--accent-branch)]" />
              {commit.schema}
            </p>
          </div>
        </AuditCard>
      </div>
    </aside>
  );
}
