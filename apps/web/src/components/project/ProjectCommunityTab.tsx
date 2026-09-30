'use client';

import {
  ArrowRight,
  type Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GitBranch,
  GitPullRequest,
  Grid2X2,
  Info,
  Layers,
  Link2,
  List,
  type Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { getProjectTabSegment } from '@/components/project/projectTabModel';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import { useProjectCollaboration } from '@/hooks/accounts/useProjectCollaboration';
import { useProjectCommunityActivity } from '@/hooks/project/useProjectCommunityActivity';
import styles from './ProjectCommunityTab.module.css';

interface ProjectCommunityTabProps {
  branch?: string | null;
  projectId: string;
}

interface CommunityDestination {
  description: string;
  href: string;
  icon: typeof Box;
  label: string;
  tone: 'conversation' | 'info' | 'commit';
}

export function ProjectCommunityTab({ projectId, branch }: ProjectCommunityTabProps) {
  const [filter, setFilter] = useState<'all' | 'prs' | 'workspaces'>('all');
  const [pullRequestsExpanded, setPullRequestsExpanded] = useState(false);
  const [workspacesExpanded, setWorkspacesExpanded] = useState(false);
  const { guestsQuery } = useProjectCollaboration(projectId);
  const namespaceId = guestsQuery.data?.namespace_id ?? null;
  const { membersQuery } = useNamespaceCollaboration({
    namespaceId,
    canReadMembers: !!namespaceId,
    canManageInvitations: false,
  });
  const { pullRequests, workspaces, activityError, activityLoading } =
    useProjectCommunityActivity(projectId);

  const collaborators = new Map<string, { name: string; scopes: string[] }>();
  for (const member of membersQuery.data?.members ?? []) {
    if (member.status !== 'active') continue;
    collaborators.set(`${member.principal.kind}:${member.principal.principal_id}`, {
      name: member.principal.display_name ?? member.principal.principal_id,
      scopes: [`Namespace · ${member.role}`],
    });
  }
  for (const guest of guestsQuery.data?.guests ?? []) {
    if (guest.status !== 'active') continue;
    const key = `${guest.principal.kind}:${guest.principal.principal_id}`;
    const existing = collaborators.get(key);
    if (existing) existing.scopes.push(`Project guest · ${guest.role}`);
    else
      collaborators.set(key, {
        name: guest.principal.display_name ?? guest.principal.principal_id,
        scopes: [`Project guest · ${guest.role}`],
      });
  }
  const projectPath = `/project/${encodeURIComponent(projectId)}`;
  const pullRequestsPath = `${projectPath}?tab=${getProjectTabSegment('reviews')}`;
  const focusedBranch = branch?.trim() || 'main';
  const workspacePath = branch?.trim()
    ? `${projectPath}?${new URLSearchParams({ tab: 'workspaces', branch: focusedBranch }).toString()}`
    : `${projectPath}?tab=workspaces`;
  const destinations: CommunityDestination[] = [
    {
      description: 'Draft and discuss changes.',
      href: workspacePath,
      icon: Layers,
      label: 'Workspaces',
      tone: 'conversation',
    },
    {
      description: 'Review branch changes.',
      href: pullRequestsPath,
      icon: GitPullRequest,
      label: 'Pull requests',
      tone: 'info',
    },
    {
      description: 'Inspect accepted changes.',
      href: `${projectPath}/history?${new URLSearchParams({ branch: focusedBranch, view: 'list' }).toString()}`,
      icon: List,
      label: 'Commit history',
      tone: 'commit',
    },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.intro}>
        <span className={styles.brandMark} aria-hidden="true">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="10" stroke="#f0803c" strokeWidth="2.6" />
            <circle cx="14" cy="14" r="4.6" stroke="#ff5b4d" strokeWidth="2.6" />
          </svg>
        </span>
        <div className={styles.introCopy}>
          <h2>Project community</h2>
          <p>People and recent project objects, linked to their original workflows.</p>
        </div>
        <div className={styles.primaryActions}>
          <Link className={styles.secondaryButton} href={pullRequestsPath}>
            <GitBranch aria-hidden="true" />
            View pull requests
          </Link>
          <Link className={styles.primaryButton} href={workspacePath}>
            <Layers aria-hidden="true" />
            Open workspaces
          </Link>
        </div>
      </header>

      <div className={styles.layout}>
        <section
          aria-labelledby="community-objects-title"
          className={styles.objects}
          aria-busy={activityLoading}
        >
          <h3 id="community-objects-title">Recent project objects</h3>
          <p className={styles.caption}>Workspace and pull request records are shown here.</p>
          <fieldset className={styles.filters} aria-label="Filter project objects">
            {(
              [
                ['all', 'All', pullRequests.length + workspaces.length],
                ['prs', 'Pull requests', pullRequests.length],
                ['workspaces', 'Workspaces', workspaces.length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label} <span>{activityLoading ? '…' : count}</span>
              </button>
            ))}
          </fieldset>
          {activityLoading ? (
            <output className={styles.message}>Loading project objects…</output>
          ) : null}
          {activityError ? (
            <p className={styles.message} role="alert">
              {activityError}
            </p>
          ) : null}
          {!activityLoading &&
          !activityError &&
          pullRequests.length === 0 &&
          workspaces.length === 0 ? (
            <p className={styles.message}>No recent objects available.</p>
          ) : null}
          {filter !== 'workspaces' && pullRequests.length > 0 ? (
            <>
              <h4 className={styles.groupHeading}>
                Pull requests <span>{pullRequests.length}</span>
              </h4>
              <ul id="community-pull-requests" className={styles.objectList}>
                {(pullRequestsExpanded ? pullRequests : pullRequests.slice(0, 3)).map((request) => (
                  <li className={styles.objectRow} key={request.id}>
                    <span className={styles.objectIcon} data-tone="info">
                      <GitPullRequest aria-hidden="true" />
                    </span>
                    <div className={styles.objectCopy}>
                      <strong>
                        <span className={styles.number}>#{request.number}</span>
                        {request.title}
                      </strong>
                      <p>Pull request · {formatActivityDate(request.updated_at)}</p>
                    </div>
                    <Link
                      className={styles.openObject}
                      href={`${pullRequestsPath}&pr=${request.number}`}
                    >
                      Open pull request
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              {pullRequests.length > 3 ? (
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={pullRequestsExpanded}
                  aria-controls="community-pull-requests"
                  onClick={() => setPullRequestsExpanded((expanded) => !expanded)}
                >
                  {pullRequestsExpanded ? 'Show less' : `Show more (${pullRequests.length - 3})`}
                  {pullRequestsExpanded ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </>
          ) : null}
          {filter !== 'prs' && workspaces.length > 0 ? (
            <>
              <h4 className={styles.groupHeading}>
                Workspaces <span>{workspaces.length}</span>
              </h4>
              <ul id="community-workspaces" className={styles.objectList}>
                {(workspacesExpanded ? workspaces : workspaces.slice(0, 3)).map((workspace) => (
                  <li className={styles.objectRow} key={workspace.id}>
                    <span className={styles.objectIcon} data-tone="conversation">
                      <Layers aria-hidden="true" />
                    </span>
                    <div className={styles.objectCopy}>
                      <strong>{workspace.title}</strong>
                      <p>Workspace · {formatActivityDate(workspace.updatedAt)}</p>
                    </div>
                    <Link
                      className={styles.openObject}
                      href={`${projectPath}?${new URLSearchParams({ tab: 'workspaces', branch: workspace.targetBranch, workspace: workspace.id }).toString()}`}
                    >
                      Open workspace
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              {workspaces.length > 3 ? (
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={workspacesExpanded}
                  aria-controls="community-workspaces"
                  onClick={() => setWorkspacesExpanded((expanded) => !expanded)}
                >
                  {workspacesExpanded ? 'Show less' : `Show more (${workspaces.length - 3})`}
                  {workspacesExpanded ? (
                    <ChevronUp aria-hidden="true" />
                  ) : (
                    <ChevronDown aria-hidden="true" />
                  )}
                </button>
              ) : null}
            </>
          ) : null}
          {!activityLoading &&
          !activityError &&
          filter !== 'all' &&
          (filter === 'prs' ? pullRequests.length : workspaces.length) === 0 &&
          pullRequests.length + workspaces.length > 0 ? (
            <p className={styles.message}>
              No {filter === 'prs' ? 'pull requests' : 'workspaces'} available.
            </p>
          ) : null}
          <div className={styles.evidenceNote}>
            <Info aria-hidden="true" />
            <p>Handoff notes are not supported yet.</p>
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className={styles.sidebarCard}>
            <h3>Where to go</h3>
            <nav aria-label="Community destinations" className={styles.destinationList}>
              {destinations.map((destination) => {
                const Icon = destination.icon;
                return (
                  <Link
                    className={styles.destination}
                    aria-label={destination.label}
                    data-tone={destination.tone}
                    href={destination.href}
                    key={destination.label}
                  >
                    <span className={styles.destinationIcon}>
                      <Icon aria-hidden="true" />
                    </span>
                    <span className={styles.destinationCopy}>
                      <strong>{destination.label}</strong>
                      <small>{destination.description}</small>
                    </span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} />
                  </Link>
                );
              })}
            </nav>
          </section>

          <section className={styles.sidebarCard}>
            <div className={styles.sidebarHeading}>
              <h3>Collaborators</h3>
            </div>
            {guestsQuery.error ? (
              <p role="alert">Project collaborators unavailable or access denied.</p>
            ) : null}
            {membersQuery.error ? (
              <p role="alert">Namespace members unavailable or access denied.</p>
            ) : null}
            {guestsQuery.isLoading || membersQuery.isLoading ? <p>Loading collaborators…</p> : null}
            {!guestsQuery.isLoading &&
            !membersQuery.isLoading &&
            collaborators.size === 0 &&
            !guestsQuery.error &&
            !membersQuery.error ? (
              <div className={styles.sidebarEmpty}>
                <span className={styles.emptyIcon}>
                  <Grid2X2 aria-hidden="true" />
                </span>
                <strong>No collaborators visible.</strong>
              </div>
            ) : null}
            {[...collaborators.entries()].map(([id, person]) => (
              <p className="mt-3 text-sm" key={id}>
                <strong>{person.name}</strong>
                <small className="block text-[var(--text-tertiary)]">
                  {person.scopes.join(' · ')}
                </small>
              </p>
            ))}
          </section>
          <EmptySidebarCard
            description="Related tools and references will appear here when linked."
            icon={Link2}
            title="External context"
            value="No links connected"
          />
        </aside>
      </div>
    </section>
  );
}

function EmptySidebarCard({
  description,
  icon: Icon,
  title,
  value,
}: {
  description: string;
  icon: typeof Users;
  title: string;
  value: string;
}) {
  return (
    <section className={styles.sidebarCard}>
      <div className={styles.sidebarHeading}>
        <h3>{title}</h3>
      </div>
      <div className={styles.sidebarEmpty}>
        <span className={styles.emptyIcon}>
          <Icon aria-hidden="true" />
        </span>
        <strong>{value}</strong>
        <p>{description}</p>
      </div>
    </section>
  );
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}
