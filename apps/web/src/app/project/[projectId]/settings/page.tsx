import { redirect } from 'next/navigation';

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { projectId } = await params;
  const { returnTo } = await searchParams;
  const query = new URLSearchParams({ project: projectId });
  if (returnTo) query.set('returnTo', returnTo);
  redirect(`/settings?${query.toString()}`);
}
