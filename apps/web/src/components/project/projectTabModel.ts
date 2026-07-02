export type ProjectTabId =
  | 'overview'
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
}

export const PROJECT_TABS: ProjectTabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'state', label: 'State' },
  { id: 'schemas', label: 'Schemas' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'community', label: 'Community' },
  { id: 'settings', label: 'Settings' },
];

const PROJECT_TAB_IDS = new Set<ProjectTabId>(PROJECT_TABS.map((tab) => tab.id));

export function parseProjectTab(value: string | null): ProjectTabId {
  if (value && PROJECT_TAB_IDS.has(value as ProjectTabId)) return value as ProjectTabId;
  return 'overview';
}
