import { Braces, CheckCircle2, GitCommitHorizontal, Play, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPrimarySchemaBinding } from '@/domain/workspaces/selectors';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceSchemaFieldStatus,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';

export function YOpsDraftTab({ candidate }: { candidate: WorkspaceCandidate }) {
  const draft = candidate.yopsDraft;
  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);
  const schemaName = schemaBinding
    ? schemaBinding.schemaName.replace(/\s+Schema$/i, '')
    : 'Candidate';
  const yopsLines = buildYOpsScriptLines(draft.operations);
  const treeLines = buildYamlTreeLines(candidate, schemaName);

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--workspace-panel)]">
      <header className="flex min-h-10 items-center gap-3 border-b border-[var(--stroke-divider)] px-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">YOps workspace</h3>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge variant="commit-subtle">Materialized 0</Badge>
          <Badge variant="pending-subtle">Pending {draft.operations.length}</Badge>
          <Button size="sm" type="button" variant="canvas-outline">
            <Play aria-hidden="true" className="size-4" />
            Generate ops
          </Button>
          <Button size="sm" type="button" variant="commit">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Apply YOps
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section
          aria-label="YOps editor"
          className="flex min-h-[360px] min-w-0 flex-col border-b border-[var(--stroke-divider)] lg:border-r lg:border-b-0"
        >
          <PaneHeader
            icon={<ScrollText aria-hidden="true" className="size-4 text-[var(--accent-extract)]" />}
            label="YOps editor"
            meta={`${draft.operations.length} ops`}
          />
          <CodePane lines={yopsLines} />
        </section>

        <section aria-label="YOps YAML tree" className="flex min-h-[360px] min-w-0 flex-col">
          <PaneHeader
            icon={<Braces aria-hidden="true" className="size-4 text-[var(--accent-commit)]" />}
            label="YAML tree"
            meta={
              schemaBinding ? `${schemaBinding.schemaName} ${schemaBinding.version}` : 'No schema'
            }
          />
          <TreePane lines={treeLines} />
          <footer className="flex min-h-10 items-center gap-3 border-t border-[var(--stroke-divider)] px-3">
            <TreeLegend />
            <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
              0 applied
            </span>
            <Button size="sm" type="button" variant="commit">
              <GitCommitHorizontal aria-hidden="true" className="size-4" />
              Commit · main
            </Button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function PaneHeader({ icon, label, meta }: { icon: ReactNode; label: string; meta: string }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="ml-auto truncate font-mono text-[10px] text-[var(--text-tertiary)]">
        {meta}
      </span>
    </div>
  );
}

function CodePane({ lines }: { lines: string[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)]">
      <div className="grid min-w-[520px] grid-cols-[36px_minmax(0,1fr)] font-mono text-[12px] leading-[19px]">
        {lines.map((line, index) => (
          <div className="contents" key={`${index}-${line}`}>
            <div className="select-none border-r border-[var(--stroke-divider)] bg-[var(--workspace-panel)] pr-2 text-right text-[var(--text-tertiary)]">
              {index + 1}
            </div>
            <pre className="whitespace-pre-wrap px-3 text-[var(--text-primary)]">{line || ' '}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreePane({ lines }: { lines: YamlTreeLine[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)] py-2">
      <div className="min-w-[520px] font-mono text-[12px] leading-[20px]">
        {lines.map((line) => (
          <div className={treeLineClassName(line.status)} key={line.id}>
            <span
              aria-hidden="true"
              className="inline-block select-none text-[var(--text-quaternary)]"
              style={{ width: `${line.indent * 1.25}rem` }}
            />
            <span className="text-[var(--yaml-key)]">{line.key}</span>
            {line.value ? (
              <>
                <span className="text-[var(--yaml-punctuation)]">: </span>
                <span className="text-[var(--yaml-string)]">{line.value}</span>
              </>
            ) : (
              <span className="text-[var(--yaml-punctuation)]">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeLegend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]">
      <LegendItem className="bg-[var(--status-info)]" label="Human" />
      <LegendItem className="bg-[var(--status-success)]" label="New" />
      <LegendItem className="bg-[var(--status-warning)]" label="Changed" />
      <LegendItem className="bg-[var(--status-error)]" label="Removed" />
      <LegendItem className="bg-[var(--text-quaternary)]" label="Inherited" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function buildYOpsScriptLines(operations: WorkspaceYOpsDraftOperation[]): string[] {
  if (operations.length === 0) {
    return ['yops:', '  - set:', '      path: node/slot', '      value: "new value"'];
  }

  const lines = ['yops:'];
  for (const operation of operations) {
    lines.push(`  - ${operation.op}:`);
    lines.push(`      path: ${operation.path}`);
    if (operation.afterValue) lines.push(`      value: ${quoteYamlValue(operation.afterValue)}`);
    if (operation.reason) lines.push(`      reason: ${quoteYamlValue(operation.reason)}`);
    if (operation.sourceRefs?.length) {
      lines.push('      source_refs:');
      for (const ref of operation.sourceRefs) lines.push(`        - ${quoteYamlValue(ref)}`);
    }
  }
  return lines;
}

function quoteYamlValue(value: string): string {
  return JSON.stringify(value);
}

interface YamlTreeLine {
  id: string;
  indent: number;
  key: string;
  value?: string;
  status?: WorkspaceSchemaFieldStatus;
}

function buildYamlTreeLines(candidate: WorkspaceCandidate, schemaName: string): YamlTreeLine[] {
  const rootKey = schemaName.toLowerCase().replaceAll(/\s+/g, '_');
  const lines: YamlTreeLine[] = [
    { id: 'root', indent: 0, key: rootKey },
    { id: 'title', indent: 1, key: 'title', value: candidate.title },
  ];

  for (const field of candidate.schemaCandidate.fields) {
    lines.push(...fieldToTreeLines(field, 1));
  }

  return lines;
}

function fieldToTreeLines(field: WorkspaceSchemaCandidateField, indent: number): YamlTreeLine[] {
  const key = field.path.split('.').at(-1) ?? field.path;
  if (field.children?.length) {
    return [
      { id: field.id, indent, key, status: field.status },
      ...field.children.flatMap((child) => fieldToTreeLines(child, indent + 1)),
    ];
  }

  return [
    {
      id: field.id,
      indent,
      key,
      status: field.status,
      value: field.value,
    },
  ];
}

function treeLineClassName(status: WorkspaceSchemaFieldStatus | undefined) {
  const base = 'relative px-3';
  if (status === 'covered') return `${base} bg-[var(--diff-added-bg)]`;
  if (status === 'missing' || status === 'needs_confirmation') {
    return `${base} bg-[var(--diff-modified-bg)]`;
  }
  if (status === 'type_mismatch') return `${base} bg-[var(--diff-removed-bg)]`;
  return base;
}
