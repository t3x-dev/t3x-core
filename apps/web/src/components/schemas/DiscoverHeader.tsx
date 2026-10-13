'use client';

import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { useProjectStore } from '@/store/projectStore';
import { cx, ReferenceIcon } from './DiscoverReference';

const tabIcons: Record<ProjectTabId, string> = {
  state: 'db',
  schemas: 'braces',
  workspaces: 'layers',
  reviews: 'pr',
  community: 'grid',
  settings: 'settings',
  outputs: 'file',
};

export function DiscoverHeader({
  repoPath,
  settingsHref = '/settings',
  projectIdNavigation = false,
  branch,
  workspaceId,
  visibility = 'Private',
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
  const projects = useProjectStore((state) => state.projects);
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
    <header className={cx('surface hdr')}>
      <div className={cx('r1 nw')}>
        <Link className={cx('brand')} href="/" aria-label="Back to projects">
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26">
            <rect width="26" height="26" rx="7" fill="#111318" />
            <path d="M7 8.5h12M13 8.5v10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="19" cy="17.5" r="2.2" fill="#6b8aff" />
          </svg>
          <span className={cx('wm')}>T3X</span>
        </Link>
        <span className={cx('sl')} aria-hidden="true">
          <svg width="12" height="22" viewBox="0 0 12 22">
            <path d="M9 2 3 20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <Link className={cx('ctx')} href={owner ? `/${encodeURIComponent(owner)}` : '/'}>
          <span className={cx('av chive')} style={{ width: 22, height: 22 }}>
            P
          </span>
          <span className={cx('n s')}>{owner || 'Projects'}</span>
          {!owner && <span className={cx('tx3 small')}>{projects.length}</span>}
          <ReferenceIcon name="updown" size={13} className={cx('tx3')} />
        </Link>
        {projectName ? (
          <>
            <span className={cx('sl')} aria-hidden="true">
              /
            </span>
            <Link href={repoPath || '/'} className={cx('ctx')} style={{ fontWeight: 550 }}>
              {projectName}
              <ReferenceIcon name="updown" size={13} className={cx('tx3')} />
            </Link>
          </>
        ) : null}
        <span className={cx('tagp')} style={{ marginLeft: 6 }}>
          <ReferenceIcon name="shield" size={10} />
          {visibility}
        </span>
        <div className={cx('grow')} />
        <nav aria-label="Global" className={cx('row')}>
          <Link className={cx('rl')} href="/templates">
            Explore
          </Link>
          <Link className={cx('rl')} href="/">
            Your projects
          </Link>
        </nav>
        <button
          type="button"
          className={cx('gs')}
          onClick={() =>
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
            )
          }
        >
          <ReferenceIcon name="search" />
          <span className={cx('grow')}>Search</span>
          <span className={cx('kbd')}>⌘K</span>
        </button>
        {newProjectHref ? (
          <Link href={newProjectHref} className={cx('btn')} style={{ height: 32, borderRadius: 8 }}>
            <ReferenceIcon name="plus" />
            {newProjectHref === '/' ? 'Browse projects' : 'Create new'}
          </Link>
        ) : null}
        <span className={cx('ib')} aria-label="Notifications preview">
          <ReferenceIcon name="bell" size={17} />
          {!repoPath ? <span className={cx('dt')} /> : null}
        </span>
        <Link
          className={cx('me')}
          href="/settings/provider-credentials"
          aria-label="Account settings"
        >
          P
        </Link>
      </div>
      <nav
        className={cx('r2 nw')}
        aria-label={namespaceTab ? 'Namespace navigation' : 'Project views'}
      >
        {namespaceTab
          ? [
              {
                id: 'repositories',
                label: 'Repositories',
                href: `/${encodeURIComponent(owner || '')}`,
                icon: 'layers',
              },
              { id: 'settings', label: 'Settings', href: settingsHref, icon: 'settings' },
            ].map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                scroll={false}
                className={cx(`t${namespaceTab === tab.id ? ' on' : ''}`)}
                aria-current={namespaceTab === tab.id ? 'page' : undefined}
              >
                <span>
                  <ReferenceIcon name={tab.icon} size={15} />
                  {tab.label}
                </span>
              </Link>
            ))
          : PROJECT_TABS.map((tab) => (
              <Link
                key={tab.id}
                href={tabHref(tab.id)}
                scroll={false}
                className={cx(`t${tab.id === activeTab ? ' on' : ''}`)}
                aria-label={tab.label}
                aria-current={tab.id === activeTab ? 'page' : undefined}
              >
                <span>
                  <ReferenceIcon name={tabIcons[tab.id]} size={15} />
                  {tab.id === 'reviews' ? 'PRs' : tab.label}
                  {!repoPath && (tab.id === 'workspaces' || tab.id === 'reviews') ? (
                    <span className={cx('c')}>{tab.id === 'workspaces' ? 2 : 1}</span>
                  ) : null}
                </span>
              </Link>
            ))}
      </nav>
    </header>
  );
}
