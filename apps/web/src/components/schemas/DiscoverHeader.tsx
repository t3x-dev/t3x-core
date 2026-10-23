'use client';

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
  Plus,
  Settings,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
  projectTabKeepsWorkspace,
} from '@/components/project/projectTabModel';
import { Button } from '@/components/ui/button';
import palette from '@/styles/management-palette.module.css';
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
  projectIdNavigation = false,
  branch,
  workspaceId,
  visibility,
  contextLabel,
  activeTab = 'schemas',
  owner,
  projectName,
  newProjectHref,
  namespaceTab,
  exploreNavigation,
}: {
  exploreNavigation?: {
    view: 'discover' | 'browse';
    discoverHref: string;
    browseHref: string;
  };
  namespaceTab?: 'repositories' | 'settings';
  repoPath?: string;
  settingsHref?: string;
  projectIdNavigation?: boolean;
  branch?: string | null;
  workspaceId?: string | null;
  visibility?: 'Private' | 'Unlisted' | 'Public';
  contextLabel?: 'Personal' | 'Organization' | 'Account';
  activeTab?: ProjectTabId;
  owner?: string;
  projectName?: string;
  newProjectHref?: string;
}) {
  const isExplore = !namespaceTab && !repoPath;
  const exploreView = exploreNavigation?.view ?? 'discover';
  const discoverHref = exploreNavigation?.discoverHref ?? '/explore?view=discover';
  const browseHref = exploreNavigation?.browseHref ?? '/explore?view=browse';
  const exploreLabel = exploreView === 'browse' ? 'Browse' : 'Discover';
  const ExploreIcon = exploreView === 'browse' ? BookOpen : Compass;
  const ownerHref = owner ? `/${encodeURIComponent(owner)}` : '/';
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
    const path =
      projectIdNavigation || tab === 'state'
        ? repoPath
        : `${repoPath}/${getProjectTabSegment(tab)}`;
    return params.size ? `${path}?${params}` : path;
  }

  return (
    <header
      className={`${palette.scope} ${styles.header}${isExplore ? ` ${styles.exploreHeader}` : ''}`}
    >
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <Link className={styles.brand} href="/" aria-label="T3X home">
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 26 26">
              <rect width="26" height="26" rx="7" fill="var(--text-primary)" />
              <path
                d="M7 8.5h12M13 8.5v10"
                stroke="var(--surface-card)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="19" cy="17.5" r="2.2" fill="var(--accent-commit)" />
            </svg>
            <span>T3X</span>
          </Link>
          <span className={styles.separator} aria-hidden="true">
            /
          </span>
          <div className={styles.context}>
            <Link
              className={`${styles.owner}${!projectName ? ` ${styles.currentContext}` : ''}`}
              href={isExplore ? (exploreView === 'browse' ? browseHref : discoverHref) : ownerHref}
            >
              {isExplore ? (
                <ExploreIcon aria-hidden="true" />
              ) : owner ? (
                <OwnerIcon aria-hidden="true" />
              ) : (
                <FolderGit2 aria-hidden="true" />
              )}
              <span>{isExplore ? exploreLabel : owner || 'Repositories'}</span>
            </Link>
            {projectName ? (
              <>
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
                <Link href={repoPath || '/'} className={styles.repository}>
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
            </Link>
            <Link
              href={browseHref}
              aria-current={isExplore && exploreView === 'browse' ? 'page' : undefined}
            >
              Browse
            </Link>
            <Link href="/">Your repositories</Link>
          </nav>
          <div className={styles.actions}>
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
                    scroll={false}
                    className={styles.tab}
                    aria-current={namespaceTab === tab.id ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    {tab.label}
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
                    scroll={false}
                    className={`${styles.tab}${tab.id === 'settings' ? ` ${styles.settingsTab}` : ''}`}
                    aria-label={tab.label}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <Icon aria-hidden="true" />
                    {tab.label}
                  </Link>
                );
              })}
        </nav>
      ) : null}
    </header>
  );
}
