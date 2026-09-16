import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function LegacyProjectSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  void children;
  const { projectId } = await params;
  redirect(`/settings?project=${encodeURIComponent(projectId)}`);
}
