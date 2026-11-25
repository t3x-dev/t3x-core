'use client';

import type { RepositoryIcon } from '@t3x-dev/api-client';
import {
  BookOpen,
  Boxes,
  Braces,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Compass,
  Database,
  FolderGit2,
  GitPullRequest,
  History,
  LayoutGrid,
  type LucideIcon,
  Mail,
  Plus,
  Settings,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { NavigationFeedback } from '@/components/layout/NavigationFeedback';
import { T3XMark } from '@/components/layout/T3XMark';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
  projectTabKeepsWorkspace,
} from '@/components/project/projectTabModel';
import { RepositoryMark } from '@/components/project/RepositoryIdentity';
import { Button } from '@/components/ui/button';
import { repositoryLocation } from '@/domain/project/repositoryLocation';
import { useInvitationInbox } from '@/hooks/accounts/usePendingInvitations';
import { prefetchRepositoryDirectoryPage } from '@/hooks/projects/repositoryDirectory';
import palette from '@/styles/management-palette.module.css';
import { markInteraction } from '@/utils/interactionTiming';
import { beginNavigationTiming } from '@/utils/navigationTiming';
import styles from './DiscoverHeader.module.css';

const tabIcons: Record<ProjectTabId, LucideIcon> = {
  state: Database,
  schemas: Braces,
  discover: Compass,
  browse: BookOpen,
  workspaces: Boxes,
  reviews: GitPullRequest,
  checks: CheckCircle2,
  history: History,
  community: LayoutGrid,
  settings: Settings,
};

export function DiscoverHeader({
  repoPath,
  settingsHref = '/settings',
  onSettingsNavigate,
  projectIdNavigation = false,
  branch,
  workspaceId,
  visibility,
  contextLabel,
  activeTab = 'schemas',
  owner,
  projectName,
  projectIdentity,
  newProjectHref,
  namespaceTab,
  exploreNavigation,
  repositoriesNavigation = false,
}: {
  exploreNavigation?: {
    view: 'discover' | 'browse';
    discoverHref: string;
    browseHref: string;
  };
  namespaceTab?: 'repositories' | 'settings';
  repoPath?: string;
  settingsHref?: string;
  onSettingsNavigate?: () => void;
  projectIdNavigation?: boolean;
  branch?: string | null;
  workspaceId?: string | null;
  visibility?: 'Private' | 'Unlisted' | 'Public';
  contextLabel?: 'Personal' | 'Organization' | 'Account';
  activeTab?: ProjectTabId;
  owner?: string;
  projectName?: string;
  projectIdentity?: { id: string; icon?: RepositoryIcon | null };
  newProjectHref?: string;
  repositoriesNavigation?: boolean;
}) {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const { invitations } = useInvitationInbox();
  const hasPendingInvitations = invitations.length > 0;
  const isExplore = !namespaceTab && !repoPath && !repositoriesNavigation;
  const exploreView = exploreNavigation?.view ?? 'discover';
  const discoverHref = exploreNavigation?.discoverHref ?? '/explore';
  const browseHref = exploreNavigation?.browseHref ?? '/explore/browse';
  const exploreLabel = exploreView === 'browse' ? 'Browse' : 'Discover';
  const ExploreIcon = exploreView === 'browse' ? BookOpen : Compass;
  const ownerHref = repositoriesNavigation
    ? '/repositories'
    : owner
      ? `/${encodeURIComponent(owner)}`
      : '/';
  const prefetchNamespace =
    owner && !repositoriesNavigation ? () => prefetchRepositoryDirectoryPage(owner) : undefined;
  const homeHref = authDisabled ? '/t3x-dev' : '/';
  const createLabel = newProjectHref === '/' ? 'Browse repositories' : 'New repository';
  const OwnerIcon =
    contextLabel === 'Organization'
      ? Building2
      : contextLabel === 'Personal' || contextLabel === 'Account'
        ? CircleUserRound
        : UsersRound;

  function tabHref(tab: ProjectTabId) {
    if (tab === 'settings') return settingsHref;
    if (!repoPath) return tab === 'schemas' ? '/explore' : '/';
    const params = new URLSearchParams();
    if (projectIdNavigation && tab !== 'state') params.set('tab', getProjectTabSegment(tab));
    if (branch) params.set('branch', branch);
    if (workspaceId && projectTabKeepsWorkspace(tab)) params.set('workspace', workspaceId);
    if (projectIdNavigation) {
      if (tab === 'checks' || tab === 'reviews' || tab === 'community') params.delete('branch');
      return `${repoPath}${params.size ? `?${params}` : ''}`;
    }
    return repositoryLocation(
      repoPath,
      tab === 'state' ? '' : `/${getProjectTabSegment(tab)}`,
      params.toString()
    );
  }

  return (
    <header
      className={`${palette.scope} ${styles.header}${isExplore ? ` ${styles.exploreHeader}` : ''}`}
    >
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <Link className={styles.brand} href={homeHref} aria-label="T3X home">
            <T3XMark />
            <span>T3X</span>
          </Link>
          <span className={styles.separator} aria-hidden="true">
            /
          </span>
          <div className={styles.context}>
            {isExplore ? (
              <span className={`${styles.owner} ${styles.currentContext}`}>
                <ExploreIcon aria-hidden="true" />
                <span>{exploreLabel}</span>
              </span>
            ) : (
              <Link
                className={`${styles.owner}${!projectName ? ` ${styles.currentContext}` : ''}`}
                href={ownerHref}
                onPointerEnter={projectName ? prefetchNamespace : undefined}
                onFocus={projectName ? prefetchNamespace : undefined}
                onNavigate={
                  projectName && prefetchNamespace
                    ? () => {
                        beginNavigationTiming('repositories');
                        prefetchNamespace();
                      }
                    : undefined
                }
              >
                {owner && !repositoriesNavigation ? (
                  <OwnerIcon aria-hidden="true" />
                ) : (
                  <FolderGit2 aria-hidden="true" />
                )}
                <span>{owner || 'Repositories'}</span>
              </Link>
            )}
            {projectName ? (
              <>
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
                <Link
                  href={repoPath ? repositoryLocation(repoPath, '', '') : '/'}
                  className={styles.repository}
                >
                  {projectIdentity && (
                    <RepositoryMark {...projectIdentity} className={styles.repositoryMark} />
                  )}
                  <h1>{projectName}</h1>
                </Link>
              </>
            ) : null}
            {contextLabel ? <span className={styles.contextBadge}>{contextLabel}</span> : null}
            {visibility ? <span className={styles.contextBadge}>{visibility}</span> : null}
          </div>
        </div>

        <div className={styles.utilities}>
          {newProjectHref ? (
            <Button asChild variant="outline" size="sm" className={styles.create}>
              <Link href={newProjectHref} aria-label={createLabel} title={createLabel}>
                {newProjectHref === '/' ? (
                  <FolderGit2 aria-hidden="true" />
                ) : (
                  <Plus aria-hidden="true" />
                )}
                <span className={styles.createLabel}>{createLabel}</span>
              </Link>
            </Button>
          ) : null}
          <nav aria-label="Global" className={styles.globalNav}>
            <Link
              href={discoverHref}
              aria-current={isExplore && exploreView === 'discover' ? 'page' : undefined}
            >
              Discover
              <NavigationFeedback />
            </Link>
            <Link
              href={browseHref}
              aria-current={isExplore && exploreView === 'browse' ? 'page' : undefined}
            >
              Browse
              <NavigationFeedback />
            </Link>
            <Link
              href="/repositories"
              onNavigate={() => beginNavigationTiming('repositories')}
              aria-current={repositoriesNavigation ? 'page' : undefined}
              onPointerEnter={
                repositoriesNavigation ? undefined : () => prefetchRepositoryDirectoryPage()
              }
              onFocus={repositoriesNavigation ? undefined : () => prefetchRepositoryDirectoryPage()}
              onPointerDown={
                repositoriesNavigation ? undefined : () => prefetchRepositoryDirectoryPage()
              }
            >
              Your repositories
              <NavigationFeedback />
            </Link>
          </nav>
          <div className={styles.actions}>
            {!authDisabled && (
              <Button asChild variant="ghost" size="icon-sm" className={styles.account}>
                <Link
                  href="/invitations"
                  onClick={() => markInteraction('invitations', 'click')}
                  aria-label={hasPendingInvitations ? 'Invitations, pending' : 'Invitations'}
                  title="Invitations"
                >
                  <Mail aria-hidden="true" />
                  <NavigationFeedback />
                  {hasPendingInvitations && (
                    <span className={styles.invitationDot} aria-hidden="true" />
                  )}
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="icon-sm" className={styles.account}>
              <Link href="/settings/profile" aria-label="Account settings" title="Account settings">
                <CircleUserRound aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {namespaceTab || repoPath ? (
        <nav
          className={styles.tabs}
          aria-label={namespaceTab ? 'Namespace navigation' : 'Project views'}
        >
          {namespaceTab
            ? [
                {
                  id: 'repositories',
                  label: 'Repositories',
                  href: ownerHref,
                  icon: FolderGit2,
                },
                { id: 'settings', label: 'Settings', href: settingsHref, icon: Settings },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    onPointerEnter={
                      tab.id === 'repositories' && namespaceTab !== 'repositories'
                        ? prefetchNamespace
                        : undefined
                    }
                    onFocus={
                      tab.id === 'repositories' && namespaceTab !== 'repositories'
                        ? prefetchNamespace
                        : undefined
                    }
                    onNavigate={
                      tab.id === 'repositories' && namespaceTab !== 'repositories'
                        ? () => {
                            beginNavigationTiming('repositories');
                            prefetchNamespace?.();
                          }
                        : undefined
                    }
                    scroll={false}
                    className={styles.tab}
                    aria-current={namespaceTab === tab.id ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    {tab.label}
                    <NavigationFeedback />
                  </Link>
                );
              })
            : PROJECT_TABS.map((tab) => {
                const Icon = tabIcons[tab.id];
                const selected =
                  tab.id === activeTab || (tab.id === 'discover' && activeTab === 'browse');
                return (
                  <Link
                    key={tab.id}
                    href={tabHref(tab.id)}
                    onNavigate={() => {
                      if (!selected) beginNavigationTiming(tab.id);
                      if (tab.id === 'settings' && !selected) onSettingsNavigate?.();
                    }}
                    scroll={false}
                    className={styles.tab}
                    aria-label={tab.label}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    {tab.label}
                    <NavigationFeedback />
                  </Link>
                );
              })}
        </nav>
      ) : null}
    </header>
  );
}
