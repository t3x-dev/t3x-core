'use client';

import { Box, ChevronRight, FileText, Folder, GitBranch, Link2, List, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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
      icon: Box,
      label: 'Workspaces',
      tone: 'conversation',
    },
    {
      description: 'Review branch changes.',
      href: pullRequestsPath,
      icon: GitBranch,
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
        <Image
          alt=""
          aria-hidden="true"
          className={styles.brandMark}
          height={48}
          priority
          src="/community-logo.png"
          width={48}
        />
        <div>
          <h2>Project community</h2>
          <p>People and recent project objects, linked to their original workflows.</p>
        </div>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby="community-empty-title" className={styles.emptyState}>
          <div className={styles.emptyStateBody}>
            {pullRequests.length === 0 && workspaces.length === 0 ? (
              <Image
                alt=""
                aria-hidden="true"
                className={styles.illustration}
                height={270}
                priority
                src="/community-empty-state.png"
                width={450}
              />
            ) : null}
            <h3 id="community-empty-title">Recent project objects</h3>
            <p>
              Workspace and pull request records are shown here. Handoff notes are not supported
              yet.
            </p>
            {activityLoading ? <output>Loading project objects…</output> : null}
            {activityError ? <p role="alert">{activityError}</p> : null}
            {!activityLoading && pullRequests.length === 0 && workspaces.length === 0 ? (
              <p>No recent objects available.</p>
            ) : null}
            <ul className="my-5 w-full space-y-2">
              {pullRequests.slice(0, 6).map((request) => (
                <li
                  className="rounded-lg border border-[var(--stroke-default)] p-3 text-sm"
                  key={request.id}
                >
                  <strong>
                    Pull request #{request.number}: {request.title}
                  </strong>
                  <span className="ml-2 text-[var(--text-tertiary)]">
                    {new Date(request.updated_at).toLocaleString()}
                  </span>
                  <Link
                    className="ml-2 text-[var(--accent-commit)]"
                    href={`${pullRequestsPath}&pr=${request.number}`}
                  >
                    Open pull request
                  </Link>
                </li>
              ))}
              {workspaces.slice(0, 6).map((workspace) => (
                <li
                  className="rounded-lg border border-[var(--stroke-default)] p-3 text-sm"
                  key={workspace.id}
                >
                  <strong>Workspace: {workspace.title}</strong>
                  <span className="ml-2 text-[var(--text-tertiary)]">{workspace.updatedAt}</span>
                  <Link
                    className="ml-2 text-[var(--accent-commit)]"
                    href={`${projectPath}?${new URLSearchParams({ tab: 'workspaces', branch: workspace.targetBranch, workspace: workspace.id }).toString()}`}
                  >
                    Open workspace
                  </Link>
                </li>
              ))}
            </ul>
            <div className={styles.primaryActions}>
              <Link className={styles.primaryButton} href={workspacePath}>
                <Folder aria-hidden="true" />
                Open workspaces
              </Link>
              <Link className={styles.secondaryButton} href={pullRequestsPath}>
                <GitBranch aria-hidden="true" />
                View pull requests
              </Link>
            </div>
          </div>

          <div className={styles.evidenceNote}>
            <span>
              <FileText aria-hidden="true" />
            </span>
            <p>Source evidence and decisions stay with the linked object.</p>
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className={styles.sidebarCard}>
            <h3>Where to go</h3>
            <p className={styles.sidebarDescription}>
              Continue the conversation where the work happens.
            </p>
            <nav aria-label="Community destinations" className={styles.destinationList}>
              {destinations.map((destination) => {
                const Icon = destination.icon;
                return (
                  <Link
                    aria-label={destination.label}
                    className={styles.destination}
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
              <Users aria-hidden="true" />
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
              <p>No collaborators visible.</p>
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
            description="Related tools and references will appear here when linked to this project."
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
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
      </div>
      <div className={styles.sidebarEmpty}>
        <strong>{value}</strong>
        <p>{description}</p>
      </div>
    </section>
  );
}
