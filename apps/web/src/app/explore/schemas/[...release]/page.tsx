import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';
import { exploreReleasePath } from '@/domain/project/exploreLocation';

export const metadata: Metadata = { title: 'Schema release · T3X' };

export default async function ExploreSchemaReleasePage({
  params,
}: {
  params: Promise<{ release: string[] }>;
}) {
  const { release } = await params;
  if (release.some((segment) => segment.includes('/'))) notFound();
  const canonicalName = release.slice(0, -1).join('/');
  const version = release.at(-1) ?? '';
  const pathname = exploreReleasePath(canonicalName, version);
  if (!pathname) notFound();
  return (
    <Suspense fallback={<p>Loading Explore…</p>}>
      <ExploreExperience releaseAddress={{ canonicalName, version, pathname }} />
    </Suspense>
  );
}
