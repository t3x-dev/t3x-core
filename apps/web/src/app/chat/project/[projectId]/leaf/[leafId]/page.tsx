import { redirect } from 'next/navigation';

type LegacyLeafDetailSearchParams = Record<string, string | string[] | undefined>;

export function buildRepositoryLeafRedirect(
  projectId: string,
  leafId: string,
  searchParams: LegacyLeafDetailSearchParams = {}
): string {
  const params = new URLSearchParams({ tab: 'outputs', leaf: leafId });

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

export default async function LegacyProjectLeafDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; leafId: string }>;
  searchParams: Promise<LegacyLeafDetailSearchParams>;
}) {
  const [{ projectId, leafId }, query] = await Promise.all([params, searchParams]);
  redirect(buildRepositoryLeafRedirect(projectId, leafId, query));
}
