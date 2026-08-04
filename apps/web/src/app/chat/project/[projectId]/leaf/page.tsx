import { redirect } from 'next/navigation';

type LegacyLeafSearchParams = Record<string, string | string[] | undefined>;

export function buildRepositoryOutputsRedirect(
  projectId: string,
  searchParams: LegacyLeafSearchParams = {}
): string {
  const params = new URLSearchParams({ tab: 'outputs' });

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab' || key === 'leaf' || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.append(key, value);
    }
  }

  return `/project/${encodeURIComponent(projectId)}?${params.toString()}`;
}

export default async function LegacyProjectLeafIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<LegacyLeafSearchParams>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  redirect(buildRepositoryOutputsRedirect(projectId, query));
}
