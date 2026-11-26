'use client';

import type { RepositoryIcon } from '@t3x-dev/api-client';
import { Eye, GitCommit, History, Pencil, TableProperties } from 'lucide-react';
import Link from 'next/link';
import { AgentAccessLink } from '@/components/project/agent-access/AgentAccessLink';
import { StateExportButton } from '@/components/shared/StateExportButton';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { shortHash } from '@/domain/format/formatters';
import { historyCommitHref } from '@/domain/project/objectLocation';
import type { ApiCommit } from '@/types/api';
import { RepositoryMark } from './RepositoryIdentity';
import { StateBranchControls } from './StateBranchControls';
import inspectionStyles from './StateInspection.module.css';
import overviewStyles from './StateOverviewView.module.css';
import frameStyles from './StatePageFrame.module.css';

export function StatePageToolbar({
  projectId,
  projectName,
  repositoryIcon,
  branch,
  branchOptions,
  headCommit,
  headCommitHash,
  sourceCommitHash,
  historyHref,
  agentAccessHref,
  onBranchChange,
  onCreateBranch,
  workspaceHref,
  historical,
  canProposeChanges,
  canManageAgentAccess,
}: {
  projectId: string;
  projectName: string;
  repositoryIcon?: RepositoryIcon | null;
  historical: boolean;
  branch: string;
  branchOptions: string[];
  headCommit: ApiCommit | null;
  headCommitHash: string | null;
  sourceCommitHash?: string;
  historyHref: string;
  agentAccessHref: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, fromBranch: string) => Promise<void>;
  workspaceHref: string;
  canProposeChanges: boolean;
  canManageAgentAccess: boolean;
}) {
  const commitHref = headCommit ? historyCommitHref(historyHref, headCommit) : historyHref;
  return (
    <header className={`${inspectionStyles.surface} ${frameStyles.toolbarViewport}`}>
      <div className={frameStyles.bounds}>
        <h1 className={inspectionStyles.repositoryTitle}>
          <RepositoryMark id={projectId} icon={repositoryIcon} />
          <span>{projectName}</span>
        </h1>
        <div className={inspectionStyles.sub2}>
          <div className={inspectionStyles.headerContext}>
            <StateBranchControls
              branch={branch}
              branchOptions={branchOptions}
              headCommitHash={headCommitHash}
              sourceCommitHash={sourceCommitHash}
              onBranchChange={onBranchChange}
              onCreateBranch={canProposeChanges ? onCreateBranch : undefined}
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
          <div className={`${overviewStyles.actions} ${inspectionStyles.headerActions}`}>
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
            {canManageAgentAccess && <AgentAccessLink href={agentAccessHref} />}
            {canProposeChanges ? (
              <Link href={workspaceHref} className={overviewStyles.primary}>
                <Pencil aria-hidden="true" />
                Propose change
              </Link>
            ) : (
              <span className={overviewStyles.sidebarHint}>Read-only access</span>
            )}
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
      </div>
    </header>
  );
}
