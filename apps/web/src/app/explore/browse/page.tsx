import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';

export const metadata: Metadata = { title: 'Browse · Explore · T3X' };

export default function BrowsePage() {
  return (
    <Suspense fallback={<p>Loading Explore…</p>}>
      <ExploreExperience pageView="browse" />
    </Suspense>
  );
}
