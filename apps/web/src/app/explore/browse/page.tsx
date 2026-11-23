import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';
import Loading from './loading';

export const metadata: Metadata = { title: 'Browse · Explore · T3X' };

export default function BrowsePage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExploreExperience pageView="browse" />
    </Suspense>
  );
}
