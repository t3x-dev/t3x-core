import type { WorkspaceYOpsDraft } from '@/types/workspaces';

export function YOpsDraftTab({ draft }: { draft: WorkspaceYOpsDraft }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Read-only YOps draft</h4>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Fixture-backed operation preview. Apply remains outside this W1 slice.
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {draft.operations.map((operation) => (
          <li
            className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-2"
            key={operation.id}
          >
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-[var(--surface-card)] px-2 py-0.5 text-xs text-[var(--text-primary)]">
                {operation.op}
              </code>
              <code className="text-xs text-[var(--text-secondary)]">{operation.path}</code>
            </div>
            <p className="mt-1 text-sm text-[var(--text-primary)]">{operation.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
