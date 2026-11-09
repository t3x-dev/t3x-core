import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';

export const metadata: Metadata = { title: 'Explore · T3X' };

export default function ExplorePage() {
  return (
    <Suspense fallback={<p>Loading Explore…</p>}>
      <ExploreExperience />
    </Suspense>
  );
}
