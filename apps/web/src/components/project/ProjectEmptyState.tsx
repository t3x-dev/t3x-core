import { ArrowRight, Boxes, MessageSquarePlus } from 'lucide-react';

export interface ProjectEmptyStateProps {
  description: string;
  onAddSource: () => void;
  onCreateWorkspace: () => void;
  title: string;
}

export function ProjectEmptyState({
  description,
  onAddSource,
  onCreateWorkspace,
  title,
}: ProjectEmptyStateProps) {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md -translate-y-6 text-center sm:-translate-y-8">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--accent-branch)]/25 bg-[var(--surface-card)] text-[var(--accent-branch)]">
          <Boxes aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{description}</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-branch)] px-3.5 text-sm font-semibold text-[var(--on-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-branch)_88%,black)]"
            onClick={onCreateWorkspace}
            type="button"
          >
            <Boxes aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Create Workspace</span>
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
            onClick={onAddSource}
            type="button"
          >
            <MessageSquarePlus aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Add Chat Source</span>
          </button>
        </div>
      </div>
    </section>
  );
}
