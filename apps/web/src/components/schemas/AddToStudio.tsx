'use client';
import type { AddStudioCandidate } from '@t3x-dev/api-client';
import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useProjects } from '@/hooks/projects/useProjects';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
export function AddToStudio({
  source,
  title,
  defaultProjectId,
  defaultWorkspaceId,
}: {
  source: AddStudioCandidate;
  title: string;
  defaultProjectId: string;
  defaultWorkspaceId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Add to Studio <ArrowRight className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add to Studio</SheetTitle>
            <SheetDescription>
              {title} · {source.version}
            </SheetDescription>
          </SheetHeader>
          {open ? (
            <Destination
              source={source}
              defaultProjectId={defaultProjectId}
              defaultWorkspaceId={defaultWorkspaceId}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
function Destination({
  source,
  defaultProjectId,
  defaultWorkspaceId,
  onDone,
}: {
  source: AddStudioCandidate;
  defaultProjectId: string;
  defaultWorkspaceId?: string;
  onDone: () => void;
}) {
  const { projects, error } = useProjects(100);
  const [projectId, setProjectId] = useState(defaultProjectId);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
      <label className="block text-sm font-medium">
        Destination project
        <select
          aria-label="Destination project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="my-3 h-11 w-full rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3"
        >
          {!projects.some((project) => project.project_id === defaultProjectId) ? (
            <option value={defaultProjectId}>Current project</option>
          ) : null}
          {projects.map((project) => (
            <option key={project.project_id} value={project.project_id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--status-error)]">
          {error}
        </p>
      ) : null}
      <CandidateConfirmation
        key={projectId}
        projectId={projectId}
        workspaceId={projectId === defaultProjectId ? defaultWorkspaceId : undefined}
        source={source}
        onDone={onDone}
      />
    </div>
  );
}
function CandidateConfirmation({
  projectId,
  workspaceId,
  source,
  onDone,
}: {
  projectId: string;
  workspaceId?: string;
  source: AddStudioCandidate;
  onDone: () => void;
}) {
  const studio = useStudioCandidates(projectId);
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState(false);
  const existing = studio.items.find(
    (item) =>
      item.source?.projectId === (source.sourceProjectId ?? null) &&
      item.source?.canonicalName === source.canonicalName &&
      item.source.version === source.version &&
      (!source.expectedHash || item.source.hash === source.expectedHash)
  );
  async function save(open: boolean) {
    setError(undefined);
    try {
      const candidate = existing ?? (await studio.add(source));
      if (!candidate) return;
      setAdded(true);
      onDone();
      if (open) {
        router.push(
          `/project/${encodeURIComponent(projectId)}?${new URLSearchParams({ tab: 'schemas', schemaView: 'studio', candidate: candidate.id, ...(workspaceId ? { workspace: workspaceId } : {}) })}`
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add candidate');
    }
  }
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--stroke-divider)] p-4">
        <p className="text-sm font-medium">Source release</p>
        <p className="mt-2 break-all text-sm">{source.canonicalName}</p>
        <p className="mt-2 flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)]">
          <LockKeyhole className="size-3" />
          {source.version}
        </p>
        {source.expectedHash ? (
          <p className="mt-2 break-all font-mono text-[11px] text-[var(--text-tertiary)]">
            {source.expectedHash}
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-medium">Already in this Studio</h3>
        {studio.loading ? (
          <output>Loading candidates…</output>
        ) : studio.items.length ? (
          <ul className="divide-y divide-[var(--stroke-divider)]">
            {studio.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>{item.title ?? 'Unavailable source'}</span>
                <span className="shrink-0 text-[var(--text-secondary)]">
                  {item.source?.version}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Your first candidate.</p>
        )}
      </div>
      {error || studio.error ? (
        <p role="alert" className="text-sm text-[var(--status-error)]">
          {error ?? studio.error}
        </p>
      ) : null}
      {added || existing ? (
        <p className="flex items-center gap-2 text-sm text-[var(--status-success)]">
          <Check className="size-4" />
          Saved as a candidate
        </p>
      ) : null}
      <p className="text-xs text-[var(--text-secondary)]">
        Explore and compare before applying to a Workspace.
      </p>
      <div className="grid gap-2">
        <Button disabled={studio.pending || studio.loading} onClick={() => void save(true)}>
          {existing || added ? 'Open Studio' : 'Add & open Studio'}{' '}
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="canvas-outline"
          disabled={studio.pending || studio.loading}
          onClick={() => void save(false)}
        >
          Add & keep browsing
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
