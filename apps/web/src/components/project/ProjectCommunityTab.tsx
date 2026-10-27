'use client';

import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GitPullRequest,
  Layers,
  List,
  type LucideIcon,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { getProjectTabSegment } from '@/components/project/projectTabModel';
import { getProjectIdHistoryPath } from '@/domain/project/repoPath';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import { useProjectCollaboration } from '@/hooks/accounts/useProjectCollaboration';
import { useProjectCommunityActivity } from '@/hooks/project/useProjectCommunityActivity';
import { buildReturnTo } from '@/utils/navigationReturn';
import styles from './ProjectCommunityTab.module.css';

interface ProjectCommunityTabProps {
  branch?: string | null;
  projectId: string;
}

interface CommunityDestination {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}

export function ProjectCommunityTab({ projectId, branch }: ProjectCommunityTabProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'prs' | 'workspaces'>('all');
  const [pullRequestsExpanded, setPullRequestsExpanded] = useState(false);
  const [workspacesExpanded, setWorkspacesExpanded] = useState(false);
  const { guestsQuery, canManageGuests } = useProjectCollaboration(projectId);
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
      description: 'Prepare and revise changes.',
      href: workspacePath,
      icon: Layers,
      label: 'Workspaces',
    },
    {
      description: 'Review and merge branch changes.',
      href: pullRequestsPath,
      icon: GitPullRequest,
      label: 'Pull requests',
    },
    {
      description: 'Trace committed changes.',
      href: getProjectIdHistoryPath(projectId, {
        branch: branch?.trim(),
        view: 'list',
        returnTo: buildReturnTo(pathname, searchParams),
      }),
      icon: List,
      label: 'Commit history',
    },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.intro}>
        <h2>Community</h2>
        <p>Collaboration overview for this repository. Continue work in the linked pages.</p>
      </header>

      <nav aria-label="Community destinations" className={styles.destinationList}>
        {destinations.map((destination) => {
          const Icon = destination.icon;
          return (
            <Link
              className={styles.destination}
              aria-label={destination.label}
              href={destination.href}
              key={destination.label}
            >
              <Icon aria-hidden="true" className={styles.destinationIcon} />
              <span className={styles.destinationCopy}>
                <strong>{destination.label}</strong>
                <small>{destination.description}</small>
              </span>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </Link>
          );
        })}
      </nav>

      <div className={styles.layout}>
        <section
          aria-labelledby="community-objects-title"
          className={styles.objects}
          aria-busy={activityLoading}
        >
          <div className={styles.sectionHeading}>
            <h3 id="community-objects-title">Recent work</h3>
            <p className={styles.caption}>Pull requests and workspaces in this repository.</p>
          </div>
          <fieldset className={styles.filters} aria-label="Filter recent work">
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
            <output className={styles.message}>Loading recent work…</output>
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
            <p className={styles.message}>
              No pull requests or workspaces yet. Open Workspaces above to prepare a change.
            </p>
          ) : null}
          {filter !== 'workspaces' && pullRequests.length > 0 ? (
            <>
              <h4 className={styles.groupHeading}>
                Pull requests <span>{pullRequests.length}</span>
              </h4>
              <ul id="community-pull-requests" className={styles.objectList}>
                {(pullRequestsExpanded ? pullRequests : pullRequests.slice(0, 3)).map((request) => (
                  <li className={styles.objectRow} key={request.id}>
                    <span className={styles.objectIcon}>
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
                    <span className={styles.objectIcon}>
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
        </section>

        <section aria-labelledby="community-collaborators-title" className={styles.collaborators}>
          <div className={styles.sectionHeading}>
            <div className={styles.headingRow}>
              <h3 id="community-collaborators-title">Collaborators</h3>
              {canManageGuests ? (
                <Link className={styles.openObject} href={`${projectPath}/settings#access`}>
                  Manage access
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <p className={styles.caption}>Visible namespace members and repository guests.</p>
          </div>
          {guestsQuery.error ? (
            <p className={styles.message} role="alert">
              Project collaborators unavailable or access denied.
            </p>
          ) : null}
          {membersQuery.error ? (
            <p className={styles.message} role="alert">
              Namespace members unavailable or access denied.
            </p>
          ) : null}
          {guestsQuery.isLoading || membersQuery.isLoading ? (
            <output className={styles.message}>Loading collaborators…</output>
          ) : null}
          {!guestsQuery.isLoading &&
          !membersQuery.isLoading &&
          collaborators.size === 0 &&
          !guestsQuery.error &&
          !membersQuery.error ? (
            <p className={styles.message}>No collaborators visible.</p>
          ) : null}
          {collaborators.size > 0 ? (
            <ul className={styles.collaboratorList}>
              {[...collaborators.entries()].map(([id, person]) => (
                <li className={styles.collaboratorRow} key={id}>
                  <Users aria-hidden="true" />
                  <div className={styles.objectCopy}>
                    <strong>{person.name}</strong>
                    <p>{person.scopes.join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="community-future-title" className={styles.future}>
          <h3 id="community-future-title">More collaboration tools</h3>
          <p>Handoff notes and shared references are not available yet.</p>
        </section>
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
