import { Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkspaceDelivery } from '@/hooks/workspaces/useWorkspaceDelivery';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export function OutputTargetsTab({ candidate }: { candidate: WorkspaceCandidate }) {
  return (
    <WorkspaceDeliveryPanel key={`${candidate.projectId}:${candidate.id}`} candidate={candidate} />
  );
}
function WorkspaceDeliveryPanel({ candidate }: { candidate: WorkspaceCandidate }) {
  const { data, pending, error, notice, deliver, refresh } = useWorkspaceDelivery(
    candidate.projectId,
    candidate.id,
    candidate.revision
  );
  const [selectedId, setSelectedId] = useState('t3x:committed-state');
  const [format, setFormat] = useState<'json' | 'yaml'>('yaml');
  const selected = data?.targets.find((target) => target.id === selectedId) ?? data?.targets[0];
  const effectiveFormat = selected?.configurable ? format : selected?.format;
  return (
    <section
      aria-label="Workspace delivery"
      className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"
    >
      <aside className="rounded-md border border-[var(--stroke-divider)] p-3">
        <h3 className="mb-3 text-sm font-semibold">Delivery targets</h3>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={refresh}>
          Refresh
        </Button>
        {data?.targets.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={pending}
            aria-current={selected?.id === target.id ? 'true' : undefined}
            onClick={() => setSelectedId(target.id)}
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
              selected?.id === target.id
                ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'
            )}
          >
            <FileText className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{target.title}</span>
            {target.mode === 'legacy' && <Badge variant="pending">Legacy</Badge>}
          </button>
        ))}
      </aside>
      <div className="min-w-0 space-y-4">
        <div className="rounded-md border border-[var(--stroke-divider)] p-4">
          <h3 className="text-base font-semibold">{selected?.title ?? 'Delivery'}</h3>
          {!data && !error && <p className="mt-3 text-sm">Loading delivery targets…</p>}
          {selected?.mode === 'legacy' ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {selected.reason} Select Committed State to download YAML or JSON.
            </p>
          ) : (
            data && (
              <>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Complete committed State · file download
                </p>
                <p className="mt-3 break-all font-mono text-xs">
                  {data.commitDigest ?? 'Commit this workspace before preparing a delivery.'}
                </p>
                {selected?.configurable && (
                  <label className="mt-4 flex items-center gap-3 text-sm">
                    Format
                    <select
                      aria-label="Delivery format"
                      disabled={pending}
                      className="rounded-md border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 py-1.5"
                      value={format}
                      onChange={(event) => setFormat(event.target.value as 'json' | 'yaml')}
                    >
                      <option value="yaml">YAML</option>
                      <option value="json">JSON</option>
                    </select>
                  </label>
                )}
                <Button
                  className="mt-4"
                  type="button"
                  disabled={
                    pending ||
                    !data.commitDigest ||
                    (effectiveFormat !== 'json' && effectiveFormat !== 'yaml')
                  }
                  onClick={() =>
                    selected &&
                    (effectiveFormat === 'yaml' || effectiveFormat === 'json') &&
                    deliver(selected.id, effectiveFormat)
                  }
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {pending ? 'Preparing…' : 'Download State'}
                </Button>
              </>
            )
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--status-error)]">
              {error}
            </p>
          )}
          {notice && <output className="mt-3 block text-sm">{notice}</output>}
        </div>
        <div className="rounded-md border border-[var(--stroke-divider)] p-4">
          <h3 className="text-sm font-semibold">Delivery history</h3>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Files prepared here. Browser save completion is not observable.
          </p>
          {data?.receipts.length === 0 && (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No deliveries yet.</p>
          )}
          <ul className="mt-3 divide-y divide-[var(--stroke-divider)]">
            {data?.receipts.map((receipt) => (
              <li key={receipt.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {receipt.format.toUpperCase()} · attempt {receipt.attempt}
                  </span>
                  <span>
                    {receipt.status === 'prepared' ? 'File prepared' : 'Preparation failed'}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-[var(--text-secondary)]">
                  {receipt.commitDigest}
                </p>
                {receipt.artifactDigest && (
                  <p className="mt-1 break-all font-mono text-[var(--text-tertiary)]">
                    {receipt.artifactDigest}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
