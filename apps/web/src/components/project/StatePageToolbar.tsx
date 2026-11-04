'use client';

import { Eye, GitCommit, Pencil, TableProperties } from 'lucide-react';
import Link from 'next/link';
import { commitTitle, relativeTime, shortHash } from '@/domain/format/formatters';
import type { ApiCommit } from '@/types/api';
import type { ProjectSnapshotView } from './ProjectStateTab';
import { StateBranchControls } from './StateBranchControls';
import { StateHistoryMenu } from './StateHistoryMenu';
import inspectionStyles from './StateInspection.module.css';
import overviewStyles from './StateOverviewView.module.css';
import frameStyles from './StatePageFrame.module.css';

export function StatePageToolbar({
  activeView,
  branch,
  branchOptions,
  canvasHref,
  headCommit,
  headCommitHash,
  historyHref,
  onBranchChange,
  onCreateBranch,
  onViewChange,
  workspaceHref,
  historical,
}: {
  historical: boolean;
  activeView: ProjectSnapshotView;
  branch: string;
  branchOptions: string[];
  canvasHref: string;
  headCommit: ApiCommit | null;
  headCommitHash: string | null;
  historyHref: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, fromBranch: string) => Promise<void>;
  onViewChange: (view: ProjectSnapshotView) => void;
  workspaceHref: string;
}) {
  return (
    <div className={`${inspectionStyles.surface} ${frameStyles.toolbarViewport}`}>
      <div className={frameStyles.bounds}>
        <div className={inspectionStyles.sub2}>
          <div className={overviewStyles.toolbar} style={{ margin: 0, minHeight: 32 }}>
            <div className={overviewStyles.viewTabs} role="tablist" aria-label="State views">
              {(
                [
                  { id: 'overview', label: 'Overview', icon: Eye },
                  { id: 'structure', label: 'Structure', icon: TableProperties },
                ] as const
              ).map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    type="button"
                    role="tab"
                    aria-selected={
                      view.id === 'overview' ? activeView === 'overview' : activeView !== 'overview'
                    }
                    onClick={() => onViewChange(view.id)}
                  >
                    <Icon aria-hidden="true" />
                    {view.label}
                  </button>
                );
              })}
            </div>
            <StateBranchControls
              branch={branch}
              branchOptions={branchOptions}
              headCommitHash={headCommitHash}
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
            <StateHistoryMenu href={historyHref} canvasHref={canvasHref} />
            <Link href={workspaceHref} className={overviewStyles.primary}>
              <Pencil />
              Propose change
            </Link>
          </div>
        </div>
        {headCommit && activeView !== 'overview' ? (
          <div className={inspectionStyles.commitSummary}>
            <GitCommit aria-hidden="true" />
            <Link href={`${historyHref}&commit=${encodeURIComponent(headCommit.hash)}`}>
              {commitTitle(headCommit.message)}
            </Link>
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
