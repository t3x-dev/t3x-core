import { Badge } from '@/components/ui/badge';
import type { SchemaReleasePreview } from '@/types/schemas';

interface SchemaYamlViewProps {
  release: SchemaReleasePreview;
}

export function SchemaYamlView({ release }: SchemaYamlViewProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">Canonical YSchema</h4>
        <Badge className="font-mono text-[11px]" variant="outline">
          {release.canonicalName}@{release.version}
        </Badge>
      </header>
      {release.canonicalYaml.trim() ? (
        <div className="overflow-auto bg-white">
          <pre className="m-0 min-h-[430px] p-4 font-mono text-xs leading-[1.7] text-[#172033] selection:bg-[var(--accent-commit-soft)] [tab-size:2]">
            <code>{release.canonicalYaml}</code>
          </pre>
        </div>
      ) : (
        <div className="grid min-h-[430px] place-items-center p-6 text-center text-[13px] text-[var(--text-secondary)]">
          Canonical YAML is unavailable for this version.
        </div>
      )}
    </section>
  );
}
