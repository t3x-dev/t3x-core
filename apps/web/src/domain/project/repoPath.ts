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

export function getProjectRepoPath(project: { id?: string; name: string }): string {
  return `/${DEFAULT_OWNER_SLUG}/${toRepoSlug(project.name, project.id)}`;
}
