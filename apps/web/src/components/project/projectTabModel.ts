import { getSchemaProjectTab } from '@/domain/project/repositoryLocation';

export type ProjectTabId =
  | 'state'
  | 'schemas'
  | 'discover'
  | 'browse'
  | 'workspaces'
  | 'reviews'
  | 'history'
  | 'community'
  | 'settings';

export interface ProjectTabDefinition {
  id: ProjectTabId;
  label: string;
  segment?: string;
}

export const PROJECT_TABS: ProjectTabDefinition[] = [
  { id: 'state', label: 'State' },
  { id: 'discover', label: 'Discover' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'reviews', label: 'Pull requests', segment: 'pull-requests' },
  { id: 'community', label: 'Community' },
  { id: 'settings', label: 'Settings' },
];

// Browse is reached within Discover; History is reached within State.
const ROUTABLE_PROJECT_TABS: ProjectTabDefinition[] = [
  ...PROJECT_TABS,
  { id: 'history', label: 'History' },
  { id: 'browse', label: 'Browse' },
];
const PROJECT_TAB_BY_ID = new Map(ROUTABLE_PROJECT_TABS.map((tab) => [tab.id, tab]));
const PROJECT_TAB_SEGMENTS = new Set(ROUTABLE_PROJECT_TABS.map((tab) => tab.segment ?? tab.id));
const PROJECT_TAB_ID_BY_SEGMENT = new Map<string, ProjectTabId>(
  ROUTABLE_PROJECT_TABS.map((tab) => [tab.segment ?? tab.id, tab.id])
);

export function getProjectTabSegment(tabId: ProjectTabId): string {
  return PROJECT_TAB_BY_ID.get(tabId)?.segment ?? tabId;
}

export function isProjectTabSegment(value: string | null): boolean {
  return Boolean(value && PROJECT_TAB_SEGMENTS.has(value));
}

export function parseProjectTab(value: string | null): ProjectTabId {
  if (value) return PROJECT_TAB_ID_BY_SEGMENT.get(value) ?? 'state';
  return 'state';
}

/** Keep historical Schema catalog links on their promoted project view. */
export function resolveProjectTab(tab: ProjectTabId, schemaView: string | null): ProjectTabId {
  return tab === 'schemas' ? getSchemaProjectTab(schemaView) : tab;
}

export function projectTabKeepsWorkspace(tab: ProjectTabId): boolean {
  return tab === 'schemas' || tab === 'discover' || tab === 'browse' || tab === 'workspaces';
}

/** Resolve the page within a repository, including detail routes owned by a tab. */
export function resolveProjectRouteTab(
  view: string | null,
  searchParams: URLSearchParams
): ProjectTabId {
  if (view === 'history' || view === 'diff') return 'history';
  if (view === 'changes') return 'workspaces';
  return resolveProjectTab(
    parseProjectTab(view || searchParams.get('tab')),
    searchParams.get('schemaView')
  );
}
