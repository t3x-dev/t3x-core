'use client';

import { Eye, GitCommit, History, Pencil, TableProperties } from 'lucide-react';
import Link from 'next/link';
import { StateExportButton } from '@/components/shared/StateExportButton';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { commitTitle, relativeTime, shortHash } from '@/domain/format/formatters';
import type { ApiCommit } from '@/types/api';
import type { ProjectSnapshotView } from './ProjectStateTab';
import { StateBranchControls } from './StateBranchControls';
import inspectionStyles from './StateInspection.module.css';
import overviewStyles from './StateOverviewView.module.css';
import frameStyles from './StatePageFrame.module.css';

export function StatePageToolbar({
  activeView,
  branch,
  branchOptions,
  headCommit,
  headCommitHash,
  sourceCommitHash,
  historyHref,
  onBranchChange,
  onCreateBranch,
  workspaceHref,
  historical,
}: {
  historical: boolean;
  activeView: ProjectSnapshotView;
  branch: string;
  branchOptions: string[];
  headCommit: ApiCommit | null;
  headCommitHash: string | null;
  sourceCommitHash?: string;
  historyHref: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, fromBranch: string) => Promise<void>;
  workspaceHref: string;
}) {
  const commitHref = headCommit
    ? `${historyHref}&commit=${encodeURIComponent(headCommit.hash)}`
    : historyHref;
  return (
    <div className={`${inspectionStyles.surface} ${frameStyles.toolbarViewport}`}>
      <div className={frameStyles.bounds}>
        <div className={inspectionStyles.sub2}>
          <div className={overviewStyles.toolbar} style={{ margin: 0, minHeight: 32 }}>
            <StateBranchControls
              branch={branch}
              branchOptions={branchOptions}
              headCommitHash={headCommitHash}
              sourceCommitHash={sourceCommitHash}
              onBranchChange={onBranchChange}
              onCreateBranch={onCreateBranch}
              showCreate={false}
            />
            {headCommit ? (
              <span className={inspectionStyles.revisionContext}>
                <GitCommit aria-hidden="true" />
                <code>{shortHash(headCommit.hash)}</code>
                <span>{historical ? 'Historical version' : 'Committed'} · Read-only</span>
              </span>
            ) : null}
          </div>
          <div className={overviewStyles.actions}>
            {headCommit ? (
              <StateExportButton
                key={headCommit.hash}
                projectId={headCommit.project_id}
                commitDigest={headCommit.hash}
              />
            ) : null}
            <Link href={historical ? commitHref : historyHref}>
              <History aria-hidden="true" /> History
            </Link>
            <Link href={workspaceHref} className={overviewStyles.primary}>
              <Pencil />
              Propose change
            </Link>
          </div>
        </div>
        <div className={inspectionStyles.viewNavigation}>
          <TabsList aria-label="State views" className={overviewStyles.viewTabs}>
            {(
              [
                { id: 'overview', label: 'Overview', icon: Eye },
                { id: 'structure', label: 'Structure', icon: TableProperties },
              ] as const
            ).map((view) => {
              const Icon = view.icon;
              return (
                <TabsTrigger key={view.id} value={view.id}>
                  <Icon aria-hidden="true" />
                  {view.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        {headCommit && activeView !== 'overview' ? (
          <div className={inspectionStyles.commitSummary}>
            <GitCommit aria-hidden="true" />
            <Link href={commitHref}>{commitTitle(headCommit.message)}</Link>
            <span>
              {headCommit.author?.name ||
                headCommit.author?.id ||
                headCommit.author?.type ||
                'Author not recorded'}
            </span>
            <time dateTime={headCommit.committed_at}>{relativeTime(headCommit.committed_at)}</time>
          </div>
        ) : null}
      </div>
    </div>
  );
}
