import type { SchemaReleasePreview } from '@/types/schemas';
import { cn } from '@/utils/cn';

interface SchemaStructureViewProps {
  currentRelease: SchemaReleasePreview | null;
  release: SchemaReleasePreview;
}

export function SchemaStructureView({ currentRelease, release }: SchemaStructureViewProps) {
  const isCurrent = release.id === currentRelease?.id;

  return (
    <div className="grid gap-4 min-[1181px]:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
          <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Structured state contract
          </h4>
          <span className="text-xs text-[var(--text-secondary)]">
            {release.structure.length} contract {release.structure.length === 1 ? 'path' : 'paths'}
          </span>
        </header>
        {release.structure.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-6 text-center text-[13px] text-[var(--text-secondary)]">
            No contract paths are available for this version.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">
                Contract paths for {release.name} {release.version}
              </caption>
              <thead>
                <tr className="bg-[var(--surface-card)]">
                  {['Path / key', 'Type', 'Required', 'Constraint'].map((label) => (
                    <th
                      className="px-3 py-[9px] text-left text-[10px] [font-weight:750] uppercase tracking-[0.05em] text-[var(--text-tertiary)]"
                      key={label}
                      scope="col"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {release.structure.map((field) => (
                  <tr
                    className="border-t border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]"
                    key={field.path}
                  >
                    <td
                      className={cn(
                        'min-w-[250px] px-3 py-2.5 font-mono font-semibold text-[var(--text-primary)]',
                        field.depth === 1 && 'pl-7',
                        field.depth === 2 && 'pl-[46px]'
                      )}
                    >
                      {field.path}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--text-secondary)]">
                      {field.type}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5',
                        field.required
                          ? 'font-bold text-[var(--status-warning)]'
                          : 'text-[var(--text-tertiary)]'
                      )}
                    >
                      {field.required ? 'required' : 'optional'}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-primary)]">{field.constraint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid content-start gap-3 min-[721px]:grid-cols-2 min-[1181px]:grid-cols-1">
        <section className="min-w-0 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <h4 className="mb-2.5 text-[13px] font-semibold text-[var(--text-primary)]">
            Version metadata
          </h4>
          <dl className="grid gap-2">
            <MetadataRow label="Name" mono value={release.canonicalName} />
            <MetadataRow label="Version" mono value={release.version} />
            <MetadataRow label="Schema hash" mono value={release.schemaHash} />
            <MetadataRow label="Updated" value={release.updatedLabel} />
            <MetadataRow label="Author" value={release.releasedBy ?? 'Schema working group'} />
          </dl>
        </section>

        <section className="min-w-0 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <h4 className="mb-2.5 text-[13px] font-semibold text-[var(--text-primary)]">Usage</h4>
          <dl className="grid gap-2">
            <MetadataRow label="Commits" value={String(release.usedByCommitCount)} />
            <MetadataRow label="Workspaces" value={String(release.usedByWorkspaceCount)} />
            <MetadataRow
              label="New workspaces"
              value={
                isCurrent
                  ? `Use ${release.version}`
                  : currentRelease
                    ? `Use current ${currentRelease.version}`
                    : 'No current version set'
              }
            />
          </dl>
        </section>

        <div className="rounded-[var(--radius-md)] border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] p-2.5 text-xs leading-[1.55] text-[var(--text-secondary)] min-[721px]:col-span-2 min-[1181px]:col-span-1">
          <strong className="text-[var(--text-primary)]">Version note.</strong>{' '}
          {release.migrationSummary}
        </div>
      </div>
    </div>
  );
}

function MetadataRow({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2.5">
      <dt className="text-[11px] font-semibold text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'm-0 min-w-0 [overflow-wrap:anywhere] text-xs font-semibold text-[var(--text-primary)]',
          mono && 'font-mono'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
