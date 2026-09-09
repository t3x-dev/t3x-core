'use client';

import { Eye, Globe2, Loader2, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useProjectVisibility } from '@/hooks/projects/useProjectVisibility';
import type { ProjectVisibility } from '@/types/api';

const VISIBILITY_OPTIONS: Array<{
  description: string;
  icon: typeof LockKeyhole;
  label: string;
  value: ProjectVisibility;
}> = [
  {
    value: 'private',
    label: 'Private',
    description: 'Not published. Namespace and project permissions continue to apply.',
    icon: LockKeyhole,
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    description: 'Not listed publicly. Direct-link access still follows server policy.',
    icon: Eye,
  },
  {
    value: 'public',
    label: 'Public',
    description: 'Published through explicit confirmation and retained as audit evidence.',
    icon: Globe2,
  },
];

function VisibilityForm({
  clearError,
  currentVisibility,
  error,
  save,
  saving,
}: {
  clearError: () => void;
  currentVisibility: ProjectVisibility;
  error: string | null;
  save: (visibility: ProjectVisibility, publicationConfirmed: boolean) => Promise<void>;
  saving: boolean;
}) {
  const [selectedVisibility, setSelectedVisibility] = useState(currentVisibility);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);

  const selected = VISIBILITY_OPTIONS.find((option) => option.value === selectedVisibility);
  const SelectedIcon = selected?.icon;
  const requiresPublicationConfirmation =
    selectedVisibility === 'public' && currentVisibility !== 'public';
  const unchanged = selectedVisibility === currentVisibility;

  return (
    <>
      <label
        className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]"
        htmlFor="project-visibility"
      >
        Project visibility
        <select
          className="h-10 rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
          disabled={saving}
          id="project-visibility"
          onChange={(event) => {
            setSelectedVisibility(event.target.value as ProjectVisibility);
            setPublicationConfirmed(false);
            clearError();
          }}
          value={selectedVisibility}
        >
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {selected && SelectedIcon ? (
        <div className="flex gap-3 rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-3">
          <SelectedIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--text-secondary)]"
          />
          <p className="text-xs leading-5 text-[var(--text-secondary)]">{selected.description}</p>
        </div>
      ) : null}

      {requiresPublicationConfirmation ? (
        <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/5 px-3 py-3 text-xs leading-5 text-[var(--text-secondary)]">
          <input
            checked={publicationConfirmed}
            className="mt-1"
            onChange={(event) => setPublicationConfirmed(event.target.checked)}
            type="checkbox"
          />
          I understand this publishes the project and records immutable visibility evidence.
        </label>
      ) : null}

      {error ? (
        <p
          className="rounded-[var(--radius-control)] bg-[var(--status-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--status-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end border-t border-[var(--stroke-divider)] pt-4">
        <Button
          disabled={
            saving || unchanged || (requiresPublicationConfirmation && !publicationConfirmed)
          }
          onClick={() => void save(selectedVisibility, publicationConfirmed)}
          type="button"
        >
          {saving ? 'Saving…' : 'Save visibility'}
        </Button>
      </div>
    </>
  );
}

export function ProjectVisibilitySettings({ projectId }: { projectId: string }) {
  const { clearError, currentVisibility, error, loading, save, saving } =
    useProjectVisibility(projectId);

  return (
    <section
      aria-labelledby="project-visibility-heading"
      className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)]"
    >
      <div className="border-b border-[var(--stroke-divider)] px-5 py-4">
        <h2
          className="text-sm font-semibold text-[var(--text-primary)]"
          id="project-visibility-heading"
        >
          Project visibility
        </h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Choose the repository privacy boundary. Public discovery and managed-AI grants are
          separate policies.
        </p>
      </div>

      <div className="grid gap-4 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading visibility…
          </div>
        ) : currentVisibility ? (
          <VisibilityForm
            clearError={clearError}
            currentVisibility={currentVisibility}
            error={error}
            key={currentVisibility}
            save={save}
            saving={saving}
          />
        ) : error ? (
          <p
            className="rounded-[var(--radius-control)] bg-[var(--status-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--status-danger)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
