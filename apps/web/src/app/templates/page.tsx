import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';

export default function ExplorePage() {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--surface-card)]">
      <DiscoverHeader />
      <main aria-label="Explore" className="min-h-0 flex-1" />
    </div>
  );
}
