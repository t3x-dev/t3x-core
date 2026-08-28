export const DEFAULT_OWNER_SLUG = 't3x-dev';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stripGeneratedNumericSuffix(slug: string): string {
  return slug.replace(/-\d{10,}$/, '');
}

export function toRepoSlug(name: string, fallbackId?: string): string {
  const nameSlug = stripGeneratedNumericSuffix(slugify(name));
  if (nameSlug) return nameSlug;

  const fallbackSlug = fallbackId ? slugify(fallbackId) : '';
  return fallbackSlug ? `repo-${fallbackSlug}` : 'repo';
}

export function getProjectRepoPath(
  project: { id?: string; name: string },
  ownerSlug = DEFAULT_OWNER_SLUG
): string {
  return `/${ownerSlug}/${toRepoSlug(project.name, project.id)}`;
}

/** Project-id entry points resolve to the canonical owner/repository URL in the route layer. */
export function getProjectIdRepoPath(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}`;
}

export function getProjectIdCanvasPath(projectId: string): string {
  return `${getProjectIdRepoPath(projectId)}?view=canvas`;
}

export function getProjectIdCanvasCommitPath(projectId: string, commitHash: string): string {
  const params = new URLSearchParams({ view: 'canvas', commit: commitHash });
  return `${getProjectIdRepoPath(projectId)}?${params.toString()}`;
}

export function getProjectIdDiffPath(
  projectId: string,
  baseHash: string,
  targetHash: string
): string {
  const params = new URLSearchParams({ base: baseHash, target: targetHash });
  return `${getProjectIdRepoPath(projectId)}/diff?${params.toString()}`;
}

export function getProjectIdOutputsPath(projectId: string, leafId?: string): string {
  const params = new URLSearchParams({ tab: 'outputs' });
  if (leafId) params.set('leaf', leafId);
  return `${getProjectIdRepoPath(projectId)}?${params.toString()}`;
}

export function getProjectOutputsPath(
  project: { id?: string; name: string },
  leafId?: string
): string {
  const path = `${getProjectRepoPath(project)}/outputs`;
  return leafId ? `${path}?leaf=${encodeURIComponent(leafId)}` : path;
}
