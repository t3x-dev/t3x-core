'use client';

import {
  Archive,
  ArrowLeft,
  Copy,
  FilePlus2,
  MoreHorizontal,
  Search,
  Settings2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  blueprintFamilyId,
  publishedSchemaReleaseId,
} from '@/domain/schemas/publishedSchemaVersions';
import type {
  PublishedSchemaVersionManifest,
  SchemaCompositionWorkspaceContext,
  YSchemaArtifactFamily,
} from '@/types/schemaModules';
import type { SchemaFamilyPreview, SchemaReleasePreview } from '@/types/schemas';
import { cn } from '@/utils/cn';
import { SchemaModuleRegistry } from './modules/SchemaModuleRegistry';
import { SchemaBindingActions, type SchemaBindingActionsState } from './SchemaBindingActions';
import { type SchemaDetailView, SchemaReleaseDetail } from './SchemaReleaseDetail';
import { SchemaReleaseList } from './SchemaReleaseList';

interface SchemaIdentityUpdate {
  displayName: string;
  description: string;
  tags: string[];
}

interface SchemaRegistryProps {
  bindingActions?: SchemaBindingActionsState;
  compositionWorkspace?: SchemaCompositionWorkspaceContext;
  defaultFamilyId: string;
  families: SchemaFamilyPreview[];
  onArchiveIdentity?: (family: SchemaFamilyPreview) => Promise<void>;
  onRestoreIdentity?: (family: SchemaFamilyPreview) => Promise<void>;
  onUpdateIdentity?: (family: SchemaFamilyPreview, update: SchemaIdentityUpdate) => Promise<void>;
}

type LibraryScope = 'all' | 'mine' | 'official';
type LifecycleFilter = 'active' | 'all' | 'archived';

export function SchemaRegistry({
  bindingActions,
  compositionWorkspace,
  defaultFamilyId,
  families,
  onArchiveIdentity,
  onRestoreIdentity,
  onUpdateIdentity,
}: SchemaRegistryProps) {
  const [registryView, setRegistryView] = useState<'compose' | 'versions'>('versions');
  const initialFamily =
    families.find((family) => family.id === defaultFamilyId) ?? families[0] ?? null;
  const [selectedFamilyId, setSelectedFamilyId] = useState(initialFamily?.id ?? '');
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<SchemaDetailView>('structure');
  const [linkedArtifact, setLinkedArtifact] = useState<{
    canonicalName: string;
    version?: string;
  }>();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<LibraryScope>('all');
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('active');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [identityPending, setIdentityPending] = useState(false);
  const [identityFeedback, setIdentityFeedback] = useState<string>();

  useEffect(() => {
    const routeQuery = new URLSearchParams(window.location.search);
    if (routeQuery.get('mode') !== 'compose') return;
    const linkedFamily = routeQuery.get('family');
    if (linkedFamily && families.some((family) => family.id === linkedFamily)) {
      setSelectedFamilyId(linkedFamily);
    }
    const canonicalName = routeQuery.get('module');
    if (canonicalName) {
      setLinkedArtifact({
        canonicalName,
        version: routeQuery.get('version') ?? undefined,
      });
    }
    setRegistryView('compose');
  }, [families]);

  useEffect(() => {
    if (families.some((family) => family.id === selectedFamilyId)) return;
    setSelectedFamilyId(
      families.find((family) => family.id === defaultFamilyId)?.id ?? families[0]?.id ?? ''
    );
  }, [defaultFamilyId, families, selectedFamilyId]);

  const visibleFamilies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return families.filter((family) => {
      const source = family.source ?? 'official';
      const status = family.lifecycleStatus ?? 'active';
      const searchable = [family.name, family.canonicalName, ...(family.tags ?? [])]
        .join(' ')
        .toLowerCase();
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (scope === 'all' ||
          (scope === 'mine' && source === 'team') ||
          (scope === 'official' && source === 'official')) &&
        (lifecycle === 'all' || status === lifecycle)
      );
    });
  }, [families, lifecycle, query, scope]);

  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? initialFamily;
  const selectedRelease = selectedFamily
    ? (selectedFamily.releases.find(
        (release) => release.id === selectedReleaseIds[selectedFamily.id]
      ) ?? null)
    : null;
  const comparisonBaseRelease = selectedRelease
    ? (selectedFamily?.releases.find(
        (release) => release.id === selectedRelease.changesBaseReleaseId
      ) ?? null)
    : null;

  function handleSelectFamily(familyId: string) {
    setSelectedFamilyId(familyId);
    setActiveView('structure');
    setIdentityFeedback(undefined);
  }

  function handleSelectRelease(releaseId: string) {
    if (!selectedFamily) return;
    setSelectedReleaseIds((releaseIds) => ({
      ...releaseIds,
      [selectedFamily.id]: releaseId,
    }));
    setActiveView('structure');
  }

  async function handleVersionPublished(version: PublishedSchemaVersionManifest) {
    await compositionWorkspace?.onPublished?.(version);
    const publishedFamily =
      version.apiVersion === 't3x.dev/yschema-blueprint/v1'
        ? blueprintFamilyId(version.canonicalName)
        : (version.family ?? selectedFamily?.id ?? defaultFamilyId);
    setSelectedFamilyId(publishedFamily);
    setSelectedReleaseIds((releaseIds) => ({
      ...releaseIds,
      [publishedFamily]: publishedSchemaReleaseId(version.canonicalName, version.version),
    }));
    setActiveView('structure');
    setRegistryView('versions');
  }

  function openIdentityEditor() {
    if (!selectedFamily) return;
    setEditName(selectedFamily.name);
    setEditDescription(selectedFamily.description);
    setEditTags((selectedFamily.tags ?? []).join(', '));
    setEditOpen(true);
  }

  async function saveIdentity() {
    if (!selectedFamily || !onUpdateIdentity) return;
    setIdentityPending(true);
    setIdentityFeedback(undefined);
    try {
      await onUpdateIdentity(selectedFamily, {
        displayName: editName.trim(),
        description: editDescription.trim(),
        tags: editTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setEditOpen(false);
      setIdentityFeedback('Schema metadata updated. Published versions were not changed.');
    } catch (error) {
      setIdentityFeedback(
        error instanceof Error ? error.message : 'Schema metadata could not be updated.'
      );
    } finally {
      setIdentityPending(false);
    }
  }

  async function toggleArchive() {
    if (!selectedFamily) return;
    const archived = selectedFamily.lifecycleStatus === 'archived';
    const action = archived ? onRestoreIdentity : onArchiveIdentity;
    if (!action) return;
    setIdentityPending(true);
    setIdentityFeedback(undefined);
    try {
      await action(selectedFamily);
      setIdentityFeedback(
        archived
          ? 'Schema restored to the active library.'
          : 'Schema archived. Immutable versions remain addressable.'
      );
    } catch (error) {
      setIdentityFeedback(error instanceof Error ? error.message : 'Schema status update failed.');
    } finally {
      setIdentityPending(false);
    }
  }

  if (registryView === 'compose') {
    return (
      <section className="h-full overflow-auto bg-[var(--surface-app)] p-2.5 min-[481px]:p-4">
        <div className="mx-auto w-full max-w-[1480px]">
          <SchemaRegistryHeader registryView={registryView} onViewChange={setRegistryView} />
          <SchemaModuleRegistry
            family={schemaArtifactFamily(selectedFamily?.id)}
            initialArtifactName={linkedArtifact?.canonicalName}
            initialArtifactVersion={linkedArtifact?.version}
            nextVersion={suggestNextVersion(selectedFamily?.releases ?? [])}
            workspace={
              compositionWorkspace
                ? { ...compositionWorkspace, onPublished: handleVersionPublished }
                : undefined
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section className="h-full overflow-auto bg-[var(--surface-app)] p-2.5 min-[481px]:p-4">
      <div className="mx-auto w-full max-w-[1480px]">
        <SchemaRegistryHeader registryView={registryView} onViewChange={setRegistryView} />

        <section className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm min-[961px]:grid min-[961px]:min-h-[760px] min-[961px]:grid-cols-[300px_minmax(0,1fr)]">
          <SchemaLibrary
            activeFamilyId={selectedFamily?.id ?? ''}
            families={visibleFamilies}
            lifecycle={lifecycle}
            onLifecycleChange={setLifecycle}
            onQueryChange={setQuery}
            onScopeChange={setScope}
            onSelect={handleSelectFamily}
            query={query}
            scope={scope}
          />

          {selectedFamily ? (
            <div className="min-w-0">
              <SchemaIdentityHeader
                identityPending={identityPending}
                onEdit={selectedFamily.artifactId ? openIdentityEditor : undefined}
                onToggleArchive={selectedFamily.artifactId ? toggleArchive : undefined}
                selectedFamily={selectedFamily}
              />
              {identityFeedback ? (
                <output className="block border-t border-[var(--stroke-divider)] px-4 py-2 text-xs text-[var(--text-secondary)]">
                  {identityFeedback}
                </output>
              ) : null}
              <section className="grid min-h-[600px] border-t border-[var(--stroke-divider)] min-[1101px]:grid-cols-[250px_minmax(0,1fr)]">
                <SchemaReleaseList
                  onSelectRelease={handleSelectRelease}
                  releases={selectedFamily.releases}
                  selectedReleaseId={selectedRelease?.id}
                />
                {selectedRelease ? (
                  <SchemaReleaseDetail
                    activeView={activeView}
                    actions={
                      bindingActions ? (
                        <SchemaBindingActions
                          actions={bindingActions}
                          selectedRelease={selectedRelease}
                        />
                      ) : undefined
                    }
                    comparisonBaseRelease={comparisonBaseRelease}
                    onViewChange={setActiveView}
                    release={selectedRelease}
                  />
                ) : (
                  <div className="grid min-h-[420px] place-items-center p-8 text-center">
                    <div className="max-w-sm">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Select a Schema version
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                        Versions are not project defaults. Select an exact version to inspect it or
                        apply it to a Workspace.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center p-8 text-center text-sm text-[var(--text-secondary)]">
              No Schema matches the current library selection.
            </div>
          )}
        </section>
      </div>

      <Dialog onOpenChange={setEditOpen} open={editOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Schema metadata</DialogTitle>
            <DialogDescription>
              Update discoverability metadata. Immutable published versions are not modified.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <label className="grid gap-1.5 text-xs font-medium" htmlFor="schema-display-name">
              Display name
              <Input
                id="schema-display-name"
                onChange={(event) => setEditName(event.target.value)}
                value={editName}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium" htmlFor="schema-description">
              Description
              <Textarea
                id="schema-description"
                onChange={(event) => setEditDescription(event.target.value)}
                rows={3}
                value={editDescription}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium" htmlFor="schema-tags">
              Tags (comma separated)
              <Input
                id="schema-tags"
                onChange={(event) => setEditTags(event.target.value)}
                value={editTags}
              />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditOpen(false)} type="button" variant="canvas-outline">
              Cancel
            </Button>
            <Button
              disabled={identityPending || !editName.trim()}
              onClick={() => void saveIdentity()}
              type="button"
              variant="commit"
            >
              {identityPending ? 'Saving…' : 'Save metadata'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SchemaRegistryHeader({
  onViewChange,
  registryView,
}: {
  onViewChange: (view: 'compose' | 'versions') => void;
  registryView: 'compose' | 'versions';
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-4 min-[721px]:flex-row min-[721px]:items-center">
      <div>
        <p className="mb-[3px] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Repository contracts
        </p>
        <h2
          className="text-xl font-bold leading-[1.3] text-[var(--text-primary)]"
          id="schemas-page-title"
        >
          Schemas
        </h2>
        <p className="mt-0.5 max-w-[820px] text-[13px] leading-5 text-[var(--text-secondary)]">
          {registryView === 'versions'
            ? 'Manage Schema identities and inspect immutable versions. Compose Modules to publish without changing existing history.'
            : 'Assemble Modules with automatic saving, verify the result, then publish an immutable Schema version.'}
        </p>
      </div>
      <Button
        className="h-[36px] rounded-[var(--radius-md)] px-3 text-[13px]"
        onClick={() => onViewChange(registryView === 'versions' ? 'compose' : 'versions')}
        type="button"
        variant={registryView === 'versions' ? 'commit' : 'canvas-outline'}
      >
        {registryView === 'versions' ? <FilePlus2 /> : <ArrowLeft />}
        {registryView === 'versions' ? 'Compose with modules' : 'Back to Schema library'}
      </Button>
    </header>
  );
}

function SchemaLibrary({
  activeFamilyId,
  families,
  lifecycle,
  onLifecycleChange,
  onQueryChange,
  onScopeChange,
  onSelect,
  query,
  scope,
}: {
  activeFamilyId: string;
  families: SchemaFamilyPreview[];
  lifecycle: LifecycleFilter;
  onLifecycleChange: (value: LifecycleFilter) => void;
  onQueryChange: (value: string) => void;
  onScopeChange: (value: LibraryScope) => void;
  onSelect: (familyId: string) => void;
  query: string;
  scope: LibraryScope;
}) {
  return (
    <aside
      className="min-w-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[961px]:border-r min-[961px]:border-b-0"
      aria-label="Schema library"
    >
      <header className="border-b border-[var(--stroke-divider)] p-3">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Schema library</h3>
          <span className="text-[11px] text-[var(--text-tertiary)]">{families.length} schemas</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            aria-label="Search Schemas"
            className="h-9 pl-8 text-xs"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name, canonical, or tag"
            type="search"
            value={query}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-[var(--radius-md)] bg-[var(--surface-panel)] p-1">
          {(['all', 'mine', 'official'] as const).map((value) => (
            <button
              className={cn(
                'inline-flex h-7 items-center justify-center rounded-[var(--radius-sm)] text-[10px] font-semibold leading-none text-[var(--text-secondary)]',
                scope === value && 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
              )}
              key={value}
              onClick={() => onScopeChange(value)}
              type="button"
            >
              {value === 'all' ? 'All' : value === 'mine' ? 'My Schemas' : 'Official'}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by Schema status"
          className="mt-2 h-8 w-full rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 text-[11px] text-[var(--text-secondary)]"
          onChange={(event) => onLifecycleChange(event.target.value as LifecycleFilter)}
          value={lifecycle}
        >
          <option value="active">Active</option>
          <option value="all">Any status</option>
          <option value="archived">Archived</option>
        </select>
      </header>
      <div className="grid max-h-[420px] gap-1 overflow-auto p-2 min-[961px]:max-h-[610px]">
        {families.map((family) => {
          return (
            <button
              className={cn(
                'rounded-[var(--radius-md)] border border-transparent p-2.5 text-left hover:border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]',
                family.id === activeFamilyId &&
                  'border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] shadow-[inset_3px_0_0_var(--accent-commit)]'
              )}
              key={family.id}
              onClick={() => onSelect(family.id)}
              type="button"
            >
              <span className="flex items-start justify-between gap-2">
                <strong className="truncate text-xs">{family.name}</strong>
                <Badge className="font-mono text-[9px]" variant="outline">
                  {family.releases.length}v
                </Badge>
              </span>
              <span className="mt-1 block truncate font-mono text-[9px] text-[var(--text-tertiary)]">
                {family.canonicalName}
              </span>
              <span className="mt-2 flex flex-wrap gap-1">
                <Badge
                  className="text-[9px]"
                  variant={family.source === 'team' ? 'pending' : 'outline'}
                >
                  {family.source === 'team' ? 'Composed' : 'Official'}
                </Badge>
                {(family.tags ?? []).slice(0, 2).map((tag) => (
                  <Badge className="text-[9px]" key={tag} variant="secondary">
                    {tag.replace(/^[^:]+:/, '')}
                  </Badge>
                ))}
              </span>
            </button>
          );
        })}
        {families.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-[var(--text-secondary)]">
            No Schemas match this search or status.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function SchemaIdentityHeader({
  identityPending,
  onEdit,
  onToggleArchive,
  selectedFamily,
}: {
  identityPending: boolean;
  onEdit?: () => void;
  onToggleArchive?: () => Promise<void>;
  selectedFamily: SchemaFamilyPreview;
}) {
  const archived = selectedFamily.lifecycleStatus === 'archived';
  const publishedCount = selectedFamily.releases.filter(
    (release) => release.status !== 'draft'
  ).length;
  const workspaceCount = selectedFamily.releases.reduce(
    (total, release) => total + release.usedByWorkspaceCount,
    0
  );
  const commitCount = selectedFamily.releases.reduce(
    (total, release) => total + release.usedByCommitCount,
    0
  );
  return (
    <header>
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{selectedFamily.name}</h3>
            <Badge variant={archived ? 'outline' : 'success'}>
              {archived ? 'Archived' : 'Active'}
            </Badge>
            <Badge variant="pending">
              {selectedFamily.source === 'team' ? 'Composed' : 'Official'}
            </Badge>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-tertiary)]">
            {selectedFamily.canonicalName}
          </p>
          <p className="mt-2 max-w-[820px] text-xs leading-5 text-[var(--text-secondary)]">
            {selectedFamily.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(selectedFamily.tags ?? []).map((tag) => (
              <Badge className="text-[9px]" key={tag} variant="secondary">
                {tag.replace(/^[^:]+:/, '')}
              </Badge>
            ))}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Schema management menu"
              className="size-9 p-0"
              type="button"
              variant="canvas-outline"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {onEdit ? (
              <DropdownMenuItem disabled={identityPending} onClick={onEdit}>
                <Settings2 /> Edit name, description &amp; tags
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(selectedFamily.canonicalName)}
            >
              <Copy /> Copy canonical name
            </DropdownMenuItem>
            {onToggleArchive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={identityPending} onClick={() => void onToggleArchive()}>
                  <Archive /> {archived ? 'Restore Schema identity' : 'Archive Schema identity'}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <dl className="grid gap-px border-t border-[var(--stroke-divider)] bg-[var(--stroke-divider)] min-[481px]:grid-cols-2 min-[721px]:grid-cols-4">
        <SchemaFact label="Versions" value={String(selectedFamily.releases.length)} mono />
        <SchemaFact label="Published" value={String(publishedCount)} mono />
        <SchemaFact label="Usage" value={`${commitCount} commits · ${workspaceCount} workspaces`} />
        <SchemaFact
          label="Updated"
          value={selectedFamily.updatedAt ?? selectedFamily.releases[0]?.updatedLabel ?? '—'}
        />
      </dl>
    </header>
  );
}

function SchemaFact({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0 bg-[var(--surface-panel)] px-4 py-3">
      <dt className="mb-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className={cn('m-0 truncate text-xs font-semibold', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

function schemaArtifactFamily(value?: string): YSchemaArtifactFamily {
  return value === 'skill' || value === 'prompt' || value === 'esphome-device' ? value : 'prd';
}

function suggestNextVersion(releases: SchemaReleasePreview[]): string {
  const semanticVersions = releases
    .map((release) => /^(\d+)\.(\d+)\.(\d+)$/.exec(release.version))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const)
    .sort((left, right) => right[0] - left[0] || right[1] - left[1] || right[2] - left[2]);
  const latest = semanticVersions[0];
  return latest ? `${latest[0]}.${latest[1]}.${latest[2] + 1}` : '1.0.0';
}
