import { redirect } from 'next/navigation';

type LegacyCanvasSearchParams = Record<string, string | string[] | undefined>;

export function buildStateCanvasRedirect(
  projectId: string,
  searchParams: LegacyCanvasSearchParams = {}
): string {
  const params = new URLSearchParams({ view: 'canvas' });

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'view' || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.append(key, value);
    }
  }

  return `/project/${encodeURIComponent(projectId)}?${params.toString()}`;
}

export default async function ChatProjectCanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<LegacyCanvasSearchParams>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  redirect(buildStateCanvasRedirect(projectId, query));
}
