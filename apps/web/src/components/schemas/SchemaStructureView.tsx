import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SchemaContractPath, SchemaReleasePreview } from '@/types/schemas';
import { cn } from '@/utils/cn';

interface SchemaStructureViewProps {
  currentRelease: SchemaReleasePreview | null;
  release: SchemaReleasePreview;
}

export function SchemaStructureView({ currentRelease, release }: SchemaStructureViewProps) {
  const isCurrent = release.id === currentRelease?.id;
  const groups = groupContractPaths(release.structure);
  const expandGroupsByDefault = release.structure.length <= 12;
  const [expandedByGroup, setExpandedByGroup] = useState<Record<string, boolean>>({});

  function isGroupExpanded(groupKey: string) {
    return expandedByGroup[`${release.id}:${groupKey}`] ?? expandGroupsByDefault;
  }

  function toggleGroup(groupKey: string) {
    const stateKey = `${release.id}:${groupKey}`;
    setExpandedByGroup((expanded) => ({
      ...expanded,
      [stateKey]: !(expanded[stateKey] ?? expandGroupsByDefault),
    }));
  }

  return (
    <div className="grid gap-4 min-[1181px]:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
          <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Structured state contract
          </h4>
          <span className="text-xs text-[var(--text-secondary)]">
            {groups.length} {groups.length === 1 ? 'node' : 'nodes'} · {release.structure.length}{' '}
            {release.structure.length === 1 ? 'path' : 'paths'}
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
              {groups.map((group) => {
                const expanded = isGroupExpanded(group.key);
                return (
                  <tbody key={group.key}>
                    <StructureRow
                      expandable={group.children.length > 0}
                      expanded={expanded}
                      field={group.root}
                      onToggle={() => toggleGroup(group.key)}
                    />
                    {expanded
                      ? group.children.map((field) => (
                          <StructureRow field={field} key={field.path} />
                        ))
                      : null}
                  </tbody>
                );
              })}
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
            <MetadataRow
              displayValue={compactSchemaHash(release.schemaHash)}
              label="Schema hash"
              mono
              value={release.schemaHash}
            />
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

function StructureRow({
  expandable = false,
  expanded = false,
  field,
  onToggle,
}: {
  expandable?: boolean;
  expanded?: boolean;
  field: SchemaContractPath;
  onToggle?: () => void;
}) {
  return (
    <tr className="border-t border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]">
      <td
        className={cn(
          'min-w-[250px] px-3 py-2.5 font-mono font-semibold text-[var(--text-primary)]',
          field.depth === 1 && 'pl-9',
          field.depth === 2 && 'pl-[52px]'
        )}
      >
        {expandable ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${field.path} structure`}
            className="-ml-1 inline-flex min-h-7 max-w-full items-center gap-1 rounded px-1 text-left hover:bg-[var(--surface-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]"
            onClick={onToggle}
            type="button"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
            )}
            <span className="truncate">{field.path}</span>
          </button>
        ) : (
          <span>{field.path}</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-[var(--text-secondary)]">{field.type}</td>
      <td
        className={cn(
          'px-3 py-2.5',
          field.required ? 'font-bold text-[var(--status-warning)]' : 'text-[var(--text-tertiary)]'
        )}
      >
        {field.required ? 'required' : 'optional'}
      </td>
      <td className="px-3 py-2.5 text-[var(--text-primary)]">
        <div className="flex min-w-[180px] flex-wrap items-center gap-1.5">
          <span>{field.constraint}</span>
          {field.constraintTags?.map((tag) => (
            <Badge className="font-mono text-[10px]" key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  );
}

interface SchemaStructureGroup {
  key: string;
  root: SchemaContractPath;
  children: SchemaContractPath[];
}

function groupContractPaths(paths: SchemaContractPath[]): SchemaStructureGroup[] {
  const groups = new Map<string, SchemaStructureGroup>();

  for (const field of paths) {
    const key = field.path.split('.')[0] ?? field.path;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        root:
          field.depth === 0
            ? field
            : {
                path: key,
                type: 'object',
                required: false,
                constraint: 'grouped paths',
                depth: 0,
              },
        children: field.depth === 0 ? [] : [field],
      });
      continue;
    }

    if (field.depth === 0) {
      existing.root = field;
    } else {
      existing.children.push(field);
    }
  }

  return [...groups.values()];
}

function MetadataRow({
  displayValue,
  label,
  mono = false,
  value,
}: {
  displayValue?: string;
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
        title={displayValue ? value : undefined}
      >
        {displayValue ? (
          <>
            <span className="sr-only">{value}</span>
            <span aria-hidden="true">{displayValue}</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function compactSchemaHash(hash: string): string {
  if (!/^sha256:[a-f0-9]{64}$/i.test(hash)) return hash;
  return `${hash.slice(0, 15)}…${hash.slice(-6)}`;
}
