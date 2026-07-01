const RECENT_PROJECTS_STORAGE_KEY = 't3x:recent-projects';
const MAX_RECENT_PROJECTS = 12;

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function normalizeProjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function readRecentProjectIds(storage = getLocalStorage()): string[] {
  if (!storage) return [];

  try {
    return normalizeProjectIds(JSON.parse(storage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function recordRecentProjectOpen(projectId: string, storage = getLocalStorage()): string[] {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId || !storage) return readRecentProjectIds(storage);

  const nextProjectIds = [
    normalizedProjectId,
    ...readRecentProjectIds(storage).filter((id) => id !== normalizedProjectId),
  ].slice(0, MAX_RECENT_PROJECTS);

  try {
    storage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(nextProjectIds));
  } catch {
    // Storage can fail in restricted browser modes; recent projects are a convenience only.
  }

  return nextProjectIds;
}

export function orderProjectsByRecentOpen<T extends { id: string }>(
  projects: T[],
  recentProjectIds: string[]
): T[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return recentProjectIds.flatMap((projectId) => {
    const project = projectById.get(projectId);
    return project ? [project] : [];
  });
}
