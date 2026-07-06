import { Boxes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SchemaFamilyList } from '@/components/schemas/SchemaFamilyList';
import { SchemaReleaseDetail } from '@/components/schemas/SchemaReleaseDetail';
import { SchemaReleaseList } from '@/components/schemas/SchemaReleaseList';
import { groupSchemaReleasesByFamily } from '@/domain/schemas/selectors';
import type { WorkspaceSchemaBindingScope } from '@/domain/workspaces/schemaBindings';
import type { SchemaRelease } from '@/types/schemas';

interface SchemaRegistryProps {
  bindingTargetLabel?: string;
  currentWorkspaceBindingLabel?: string;
  onBindRelease?: (release: SchemaRelease, scope: WorkspaceSchemaBindingScope) => void;
  projectDefaultBindingLabel?: string;
  releases: SchemaRelease[];
}

export function SchemaRegistry({
  bindingTargetLabel,
  currentWorkspaceBindingLabel,
  onBindRelease,
  projectDefaultBindingLabel,
  releases,
}: SchemaRegistryProps) {
  const families = useMemo(() => groupSchemaReleasesByFamily(releases), [releases]);
  const [selectedFamilyName, setSelectedFamilyName] = useState(families[0]?.name ?? '');
  const selectedFamily =
    families.find((family) => family.name === selectedFamilyName) ?? families[0] ?? null;
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    selectedFamily?.releases.find((release) => release.status === 'active')?.id ??
      selectedFamily?.releases[0]?.id ??
      ''
  );

  const selectedRelease =
    selectedFamily?.releases.find((release) => release.id === selectedReleaseId) ??
    selectedFamily?.releases.find((release) => release.status === 'active') ??
    selectedFamily?.releases[0] ??
    null;

  function handleSelectFamily(familyName: string) {
    const nextFamily = families.find((family) => family.name === familyName);
    setSelectedFamilyName(familyName);
    setSelectedReleaseId(
      nextFamily?.releases.find((release) => release.status === 'active')?.id ??
        nextFamily?.releases[0]?.id ??
        ''
    );
  }

  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Boxes aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Schema templates</h2>
          </div>
          <p className="text-sm leading-5 text-[var(--text-secondary)]">
            Choose a structured-state template, pick a version, then bind it as the project default
            or pin it to a workspace.
          </p>
        </div>

        {selectedFamily && selectedRelease ? (
          <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(220px,0.85fr)_minmax(220px,0.85fr)_minmax(320px,1.25fr)]">
            <SchemaFamilyList
              families={families}
              onSelectFamily={handleSelectFamily}
              selectedFamilyName={selectedFamily.name}
            />
            <SchemaReleaseList
              onSelectRelease={setSelectedReleaseId}
              releases={selectedFamily.releases}
              selectedReleaseId={selectedRelease.id}
            />
            <SchemaReleaseDetail
              bindingTargetLabel={bindingTargetLabel}
              currentWorkspaceBindingLabel={currentWorkspaceBindingLabel}
              onBindRelease={onBindRelease}
              projectDefaultBindingLabel={projectDefaultBindingLabel}
              release={selectedRelease}
            />
          </div>
        ) : (
          <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 text-sm text-[var(--text-secondary)]">
            No schema releases are available for this project.
          </div>
        )}
      </div>
    </section>
  );
}
