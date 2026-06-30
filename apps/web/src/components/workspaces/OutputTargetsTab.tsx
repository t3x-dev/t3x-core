import { Badge } from '@/components/ui/badge';
import type { WorkspaceOutputTarget } from '@/types/workspaces';

export function OutputTargetsTab({ targets }: { targets: WorkspaceOutputTarget[] }) {
  return (
    <div className="flex flex-col gap-2">
      {targets.map((target) => (
        <article
          className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-2"
          key={target.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-[var(--text-primary)]">{target.title}</h4>
            <Badge variant="pending">Draft target</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {target.type} / {target.format}
          </p>
          <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">
            Not a committed artifact
          </p>
        </article>
      ))}
    </div>
  );
}
