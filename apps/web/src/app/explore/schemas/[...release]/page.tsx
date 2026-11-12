import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';
import { exploreReleasePath } from '@/domain/project/exploreLocation';

type ReleasePageProps = { params: Promise<{ release: string[] }> };

async function readReleaseAddress(params: ReleasePageProps['params']) {
  const { release } = await params;
  if (release.some((segment) => segment.includes('/'))) notFound();
  const canonicalName = release.slice(0, -1).join('/');
  const version = release.at(-1) ?? '';
  const pathname = exploreReleasePath(canonicalName, version);
  if (!pathname) notFound();
  return { canonicalName, version, pathname };
}

export async function generateMetadata({ params }: ReleasePageProps): Promise<Metadata> {
  const { canonicalName, version } = await readReleaseAddress(params);
  return { title: `${canonicalName} ${version} · Schema release · T3X` };
}

export default async function ExploreSchemaReleasePage({ params }: ReleasePageProps) {
  const address = await readReleaseAddress(params);
  return (
    <Suspense fallback={<p>Loading Explore…</p>}>
      <ExploreExperience releaseAddress={address} />
    </Suspense>
  );
}
