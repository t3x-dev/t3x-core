'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
export function StudioCandidateList({ projectId }: { projectId: string }) {
  const studio = useStudioCandidates(projectId);
  const [error, setError] = useState<string>();
  return (
    <section
      aria-label="Saved Studio candidates"
      className="border-b border-[var(--stroke-divider)] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your candidates</h2>
        <span className="text-xs text-[var(--text-secondary)]">{studio.items.length} saved</span>
      </div>
      {studio.loading ? <output>Loading candidates…</output> : null}
      {error || studio.error ? <p role="alert">{error ?? studio.error}</p> : null}
      {!studio.loading && !studio.items.length ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Add definitions from Discover or Browse to explore them here.
        </p>
      ) : null}
      <div className="flex gap-3 overflow-x-auto">
        {studio.items.map((item) => (
          <article
            key={item.id}
            className="min-w-64 max-w-sm shrink-0 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
          >
            <h3 className="text-sm font-medium">{item.title ?? 'Unavailable source'}</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {item.source?.canonicalName} {item.source?.version}
            </p>
            {item.reason ? <p className="mt-2 text-xs">{item.reason}</p> : null}
            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              disabled={studio.pending}
              onClick={() => {
                setError(undefined);
                void studio.remove(item.id).catch((cause) => setError(cause.message));
              }}
            >
              Remove candidate
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
