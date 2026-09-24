import { Suspense } from 'react';
import { ExploreDiscoverySurface } from '@/components/schemas/ExploreDiscoverySurface';

export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <ExploreDiscoverySurface />
    </Suspense>
  );
}
