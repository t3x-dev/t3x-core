import { redirect } from 'next/navigation';

type LegacyChatSearchParams = Record<string, string | string[] | undefined>;

export function buildLegacyChatLandingRedirect(searchParams: LegacyChatSearchParams = {}): string {
  const projectId = searchParams.projectId;
  const resolvedProjectId = Array.isArray(projectId) ? projectId[0] : projectId;

  if (resolvedProjectId?.trim()) {
    const params = new URLSearchParams();
    const branch = searchParams.branch;
    const resolvedBranch = Array.isArray(branch) ? branch[0] : branch;
    if (resolvedBranch?.trim()) params.set('branch', resolvedBranch);

    const query = params.toString();
    return `/project/${encodeURIComponent(resolvedProjectId)}${query ? `?${query}` : ''}`;
  }

  return '/';
}

export default async function LegacyChatLandingPage({
  searchParams,
}: {
  searchParams: Promise<LegacyChatSearchParams>;
}) {
  redirect(buildLegacyChatLandingRedirect(await searchParams));
}
