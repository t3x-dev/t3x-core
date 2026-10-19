'use client';

import {
  BookOpen,
  Boxes,
  Braces,
  CircleUserRound,
  Database,
  FileText,
  FolderGit2,
  GitPullRequest,
  LayoutGrid,
  type LucideIcon,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { Button } from '@/components/ui/button';
import palette from '@/styles/management-palette.module.css';
import styles from './DiscoverHeader.module.css';

const tabIcons: Record<ProjectTabId, LucideIcon> = {
  state: Database,
  schemas: Braces,
  workspaces: Boxes,
  reviews: GitPullRequest,
  community: LayoutGrid,
  settings: Settings,
  outputs: FileText,
};

export function DiscoverHeader({
  repoPath,
  settingsHref = '/settings',
  projectIdNavigation = false,
  branch,
  workspaceId,
  visibility,
  activeTab = 'schemas',
  owner,
  projectName,
  newProjectHref,
  namespaceTab,
}: {
  namespaceTab?: 'repositories' | 'settings';
  repoPath?: string;
  settingsHref?: string;
  projectIdNavigation?: boolean;
  branch?: string | null;
  workspaceId?: string | null;
  visibility?: string;
  activeTab?: ProjectTabId;
  owner?: string;
  projectName?: string;
  newProjectHref?: string;
}) {
  const isCatalog = !namespaceTab && !repoPath;
  const ownerHref = owner ? `/${encodeURIComponent(owner)}` : '/';
  const createLabel = newProjectHref === '/' ? 'Browse projects' : 'Create new';

  function tabHref(tab: ProjectTabId) {
    if (tab === 'settings') return settingsHref;
    if (!repoPath) return tab === 'schemas' ? '/templates' : '/';
    const params = new URLSearchParams();
    if (projectIdNavigation && tab !== 'state') params.set('tab', getProjectTabSegment(tab));
    if (branch) params.set('branch', branch);
    if (workspaceId && (tab === 'schemas' || tab === 'workspaces'))
      params.set('workspace', workspaceId);
    const path =
      projectIdNavigation || tab === 'state'
        ? repoPath
        : `${repoPath}/${getProjectTabSegment(tab)}`;
    return params.size ? `${path}?${params}` : path;
  }

  return (
    <header className={`${palette.scope} ${styles.header}`}>
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <Link className={styles.brand} href="/" aria-label="Back to projects">
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
            <Link className={styles.owner} href={isCatalog ? '/templates' : ownerHref}>
              {isCatalog ? <BookOpen aria-hidden="true" /> : <FolderGit2 aria-hidden="true" />}
              <span>{isCatalog ? 'Templates' : owner || 'Projects'}</span>
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
            {visibility ? <span className={styles.visibility}>{visibility}</span> : null}
          </div>
        </div>

        <div className={styles.utilities}>
          <nav aria-label="Global" className={styles.globalNav}>
            <Link href="/templates" aria-current={isCatalog ? 'page' : undefined}>
              Explore
            </Link>
            <Link href="/">Your projects</Link>
          </nav>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.search}
              aria-label="Search commands"
              aria-keyshortcuts="Meta+K Control+K"
              title="Search commands (⌘K / Ctrl+K)"
              onClick={() =>
                document.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
                )
              }
            >
              <Search aria-hidden="true" />
              <span className={styles.searchLabel}>Search</span>
              <kbd className={styles.shortcut} aria-hidden="true">
                ⌘K
              </kbd>
            </Button>
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
                return (
                  <Link
                    key={tab.id}
                    href={tabHref(tab.id)}
                    scroll={false}
                    className={styles.tab}
                    aria-label={tab.label}
                    aria-current={tab.id === activeTab ? 'page' : undefined}
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
