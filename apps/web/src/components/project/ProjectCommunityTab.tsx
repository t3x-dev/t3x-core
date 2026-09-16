import { Box, ChevronRight, FileText, Folder, GitBranch, Link2, List, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getProjectTabSegment } from '@/components/project/projectTabModel';
import styles from './ProjectCommunityTab.module.css';

interface ProjectCommunityTabProps {
  projectId: string;
}

interface CommunityDestination {
  description: string;
  href: string;
  icon: typeof Box;
  label: string;
  tone: 'conversation' | 'info' | 'commit';
}

export function ProjectCommunityTab({ projectId }: ProjectCommunityTabProps) {
  const projectPath = `/project/${encodeURIComponent(projectId)}`;
  const pullRequestsPath = `${projectPath}?tab=${getProjectTabSegment('reviews')}`;
  const destinations: CommunityDestination[] = [
    {
      description: 'Draft and discuss changes.',
      href: `${projectPath}?tab=workspaces`,
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
      href: `${projectPath}/history?branch=main&view=list`,
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
          <p>Human handoffs linked to your project, without changing structured State.</p>
        </div>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby="community-empty-title" className={styles.emptyState}>
          <div className={styles.emptyStateBody}>
            <Image
              alt="A handoff note connecting a person, a conversation, and versioned work"
              className={styles.illustration}
              height={270}
              priority
              src="/community-empty-state.png"
              width={450}
            />
            <h3 id="community-empty-title">Bring the right people into the work</h3>
            <p>
              Handoff notes will appear here when they are linked to real workspace or review
              objects.
            </p>
            <div className={styles.primaryActions}>
              <Link className={styles.primaryButton} href={`${projectPath}?tab=workspaces`}>
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

          <EmptySidebarCard
            description="Handoff notes will appear here when linked to real people and objects."
            icon={Users}
            title="Collaborators"
            value="No collaborators linked"
          />
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
