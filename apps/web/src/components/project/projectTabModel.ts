export type ProjectTabId =
  | 'state'
  | 'schemas'
  | 'workspaces'
  | 'reviews'
  | 'outputs'
  | 'community'
  | 'settings';

export interface ProjectTabDefinition {
  id: ProjectTabId;
  label: string;
  segment?: string;
}

export const PROJECT_TABS: ProjectTabDefinition[] = [
  { id: 'state', label: 'State' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'reviews', label: 'Pull requests', segment: 'pull-requests' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'community', label: 'Community' },
  { id: 'settings', label: 'Settings' },
];

const PROJECT_TAB_BY_ID = new Map(PROJECT_TABS.map((tab) => [tab.id, tab]));
const PROJECT_TAB_SEGMENTS = new Set(PROJECT_TABS.map((tab) => tab.segment ?? tab.id));
const PROJECT_TAB_ID_BY_SEGMENT = new Map<string, ProjectTabId>(
  PROJECT_TABS.map((tab) => [tab.segment ?? tab.id, tab.id])
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
