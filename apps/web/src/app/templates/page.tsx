import Link from 'next/link';
import { Suspense } from 'react';
import { ExploreDiscoverySurface } from '@/components/schemas/ExploreDiscoverySurface';

export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <div className="h-full overflow-auto">
        <nav className="px-6 pt-4" aria-label="Template archive">
          <Link href="/templates/archive">Legacy prompt archive</Link>
        </nav>
        <ExploreDiscoverySurface />
      </div>
    </Suspense>
  );
}
