import { Blocks, Braces, Cpu, Database, FileCode2, Monitor, Server } from 'lucide-react';
import type { SchemaArtifactPreview } from '@/types/schemaModules';

const ICONS = {
  blocks: Blocks,
  braces: Braces,
  cpu: Cpu,
  database: Database,
  file: FileCode2,
  monitor: Monitor,
  server: Server,
};

export function SchemaArtifactIcon({ artifact }: { artifact: SchemaArtifactPreview }) {
  const Icon = ICONS[artifact.icon];
  return (
    <span className="flex size-9 flex-none items-center justify-center rounded-[10px] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--accent-commit)]">
      <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
    </span>
  );
}
