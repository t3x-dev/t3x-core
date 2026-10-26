import { Suspense } from 'react';
import { ExploreExperience } from '@/components/explore/ExploreExperience';
export default function ExplorePage() {
  return (
    <Suspense fallback={<p>Loading Explore…</p>}>
      <ExploreExperience />
    </Suspense>
  );
}
