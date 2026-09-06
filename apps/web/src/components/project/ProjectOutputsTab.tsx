'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LegacyLeafReader } from '@/components/leaf/LegacyLeafReader';
import { Button } from '@/components/ui/button';
import { useProjectOutputsData } from '@/hooks/leaves/useProjectOutputsData';

export function ProjectOutputsTab({ projectId }: { projectId: string }) {
  const data = useProjectOutputsData(projectId);
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get('leaf');
  const selected = requested ? data.leaves.find((leaf) => leaf.id === requested) : data.leaves[0];
  if (data.loading) return <output className="p-6">Loading legacy Leaves…</output>;
  if (data.error)
    return (
      <div role="alert" className="p-6">
        {data.error} <Button onClick={() => void data.refresh()}>Retry outputs</Button>
      </div>
    );
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b p-3">
        <h2 className="text-sm font-semibold">Legacy outputs</h2>
        <span className="text-xs text-[var(--text-secondary)]">
          Read-only archive · Use State or Commit Export for new deliveries.
        </span>
        {data.leaves.length ? (
          <select
            aria-label="Saved Leaf"
            className="ml-auto max-w-full rounded border bg-[var(--surface-panel)] p-2 text-sm"
            value={selected?.id ?? ''}
            onChange={(event) => {
              const params = new URLSearchParams(search.toString());
              params.set('leaf', event.target.value);
              router.replace(`${pathname}?${params.toString()}`);
            }}
          >
            {!selected ? <option value="">Select a saved Leaf</option> : null}
            {data.leaves.map((leaf) => (
              <option value={leaf.id} key={leaf.id}>
                {leaf.title || leaf.id}
              </option>
            ))}
          </select>
        ) : null}
      </header>
      {requested && !selected ? (
        <p role="alert" className="p-6">
          Requested Leaf is unavailable in this project.
        </p>
      ) : selected ? (
        <LegacyLeafReader
          key={`${projectId}:${selected.id}`}
          projectId={projectId}
          leafId={selected.id}
        />
      ) : (
        <p className="p-6 text-sm">No legacy Leaves saved.</p>
      )}
    </section>
  );
}
