import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SchemaReleasePreview } from '@/types/schemas';

interface SchemaRelationsViewProps {
  release: SchemaReleasePreview;
}

export function SchemaRelationsView({ release }: SchemaRelationsViewProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Allowed relationships
          </h4>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Typed edges connect workflow nodes without changing their structured content.
          </p>
        </div>
        <span className="flex-none text-xs text-[var(--text-secondary)]">
          {release.relationTypes.length}{' '}
          {release.relationTypes.length === 1 ? 'relation type' : 'relation types'}
        </span>
      </header>

      {release.relationTypes.length === 0 ? (
        <div className="grid min-h-56 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              No relation types declared
            </p>
            <p className="mt-1 text-xs leading-[1.55] text-[var(--text-secondary)]">
              This Schema validates paths and values without defining typed edges between nodes.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-px bg-[var(--stroke-divider)] min-[1181px]:grid-cols-2">
          {release.relationTypes.map((relation) => (
            <article
              className="min-w-0 bg-[var(--surface-panel)] p-3.5 hover:bg-[var(--hover-bg)]"
              key={relation.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-mono text-xs font-bold text-[var(--text-primary)]">
                  {relation.id}
                </h5>
                {relation.constraints.map((constraint) => (
                  <Badge className="text-[10px]" key={constraint} variant="outline">
                    {constraint}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex min-w-0 items-center gap-2 text-xs">
                <code className="min-w-0 truncate rounded bg-[var(--surface-card)] px-2 py-1 font-mono text-[var(--text-secondary)]">
                  {relation.from}
                </code>
                <ArrowRight
                  aria-label="connects to"
                  className="h-3.5 w-3.5 flex-none text-[var(--accent-commit)]"
                />
                <code className="min-w-0 truncate rounded bg-[var(--surface-card)] px-2 py-1 font-mono text-[var(--text-secondary)]">
                  {relation.to}
                </code>
              </div>
              <p className="mt-2.5 text-xs leading-[1.55] text-[var(--text-secondary)]">
                {relation.description}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
