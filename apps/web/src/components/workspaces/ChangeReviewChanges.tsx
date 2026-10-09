import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { composeValueLabel } from '@/domain/composePresentation';
import {
  type FieldChangeGroup,
  type FieldChangeKind,
  fieldChangeCount,
} from '@/domain/workspaces/changeFields';
import { operationDetail, operationLabel } from './TransitionReviewPanel';

type ChangeTab = 'fields' | 'operations';

export function ChangeReviewChanges({
  groups,
  operations,
}: {
  groups: readonly FieldChangeGroup[] | null;
  operations: readonly unknown[];
}) {
  const [tab, setTab] = useState<ChangeTab | null>(null);
  const activeTab = groups ? (tab ?? 'fields') : 'operations';

  return (
    <section
      aria-label="Changes"
      className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Changes</h2>
        <div
          aria-label="Change view"
          className="inline-flex rounded-md bg-[var(--surface-panel)] p-0.5 text-xs"
          role="tablist"
        >
          {groups ? (
            <TabButton
              active={activeTab === 'fields'}
              count={fieldChangeCount(groups)}
              label="Fields"
              onClick={() => setTab('fields')}
            />
          ) : null}
          <TabButton
            active={activeTab === 'operations'}
            count={operations.length}
            label="Operations"
            onClick={() => setTab('operations')}
          />
        </div>
      </header>
      {activeTab === 'fields' && groups ? (
        <FieldGroups groups={groups} />
      ) : (
        <OperationList operations={operations} />
      )}
    </section>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`rounded px-2.5 py-1 font-medium transition-colors ${
        active
          ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[0_1px_2px_oklch(0_0_0/8%)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label} <span className="text-[var(--text-tertiary)]">{count}</span>
    </button>
  );
}

function FieldGroups({ groups }: { groups: readonly FieldChangeGroup[] }) {
  if (groups.length === 0) {
    return <p className="px-4 py-6 text-xs text-[var(--text-secondary)]">No field changes.</p>;
  }
  return (
    <ol className="divide-y divide-[var(--stroke-divider)]">
      {groups.map((group) => (
        <li className="px-4 py-3" key={group.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {group.label}
              </h3>
              {group.breadcrumb ? (
                <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                  {group.breadcrumb}
                </p>
              ) : null}
            </div>
            <Badge variant={KIND_BADGE[group.kind]}>{KIND_LABEL[group.kind]}</Badge>
          </div>
          <dl className="mt-2 grid gap-1.5 text-xs">
            {group.fields.map((field) => (
              <div
                className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[112px_minmax(0,1fr)]"
                key={field.name}
              >
                <dt className="font-medium text-[var(--text-tertiary)]">{field.name}</dt>
                <dd className="min-w-0 leading-5">
                  {field.kind !== 'added' ? <ValueText removed value={field.before} /> : null}
                  {field.kind !== 'removed' ? <ValueText value={field.after} /> : null}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function ValueText({ removed = false, value }: { removed?: boolean; value: unknown }) {
  const label = composeValueLabel(value, '—');
  return (
    <span
      className={`block break-words ${
        removed
          ? 'text-[var(--text-tertiary)] line-through decoration-[var(--status-error)]/50'
          : 'text-[var(--text-primary)]'
      }`}
      title={typeof value === 'string' ? value : JSON.stringify(value)}
    >
      {label}
    </span>
  );
}

function OperationList({ operations }: { operations: readonly unknown[] }) {
  return (
    <ol className="divide-y divide-[var(--stroke-divider)]">
      {operations.map((operation, index) => (
        <li className="px-4 py-2 text-xs" key={`${operationLabel(operation, index)}-${index}`}>
          <div className="flex gap-2">
            <span className="w-6 shrink-0 text-right font-mono text-[var(--text-tertiary)]">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="font-mono font-semibold text-[var(--text-primary)]">
                {operationLabel(operation, index)}
              </div>
              <div className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] text-[var(--text-secondary)]">
                {operationDetail(operation)}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const KIND_LABEL: Record<FieldChangeKind, string> = {
  added: 'Added',
  changed: 'Changed',
  removed: 'Removed',
};

const KIND_BADGE: Record<FieldChangeKind, 'success' | 'commit-subtle' | 'destructive'> = {
  added: 'success',
  changed: 'commit-subtle',
  removed: 'destructive',
};
