'use client';

import { useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { Button } from '@/components/ui/button';
import { useStateOverview } from '@/hooks/commits/useStateOverview';

export function StateReadmeDisclosure(props: { projectId: string; commitDigest: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-4 py-2 text-xs text-[var(--text-secondary)]">
        README · Author
      </summary>
      {open ? <RevisionReadme {...props} /> : null}
    </details>
  );
}

function RevisionReadme({ projectId, commitDigest }: { projectId: string; commitDigest: string }) {
  const { data, error, loading, retry } = useStateOverview(projectId, commitDigest);
  return (
    <section className="max-h-[40vh] overflow-auto px-4 pb-4" aria-label="Revision README">
      <p className="mb-2 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
        {commitDigest} · Read-only
      </p>
      {loading ? (
        <output className="text-sm">Loading README…</output>
      ) : error || !data ? (
        <div role="alert" className="text-sm">
          <p>{error ?? 'README unavailable'}</p>
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : (
        <StateAuthorReadme author={data.author?.document} />
      )}
    </section>
  );
}
