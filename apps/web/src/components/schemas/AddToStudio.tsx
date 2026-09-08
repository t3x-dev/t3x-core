'use client';
import type { AddStudioCandidate } from '@t3x-dev/api-client';
import { ArrowRight, Box, Check, FileText, LockKeyhole } from 'lucide-react';
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
  onAdded,
}: {
  source: AddStudioCandidate;
  title: string;
  defaultProjectId: string;
  defaultWorkspaceId?: string;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Add to Studio <ArrowRight className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden bg-[var(--surface-card)] sm:max-w-[400px]">
          <SheetHeader className="shrink-0 gap-0 px-6 pb-5 pt-6">
            <SheetTitle className="pr-7 text-sm">Add to Studio</SheetTitle>
            <SheetDescription className="mt-6 flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-app)]">
                <Box className="size-6 text-[var(--accent-commit)]" />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-[13px] font-semibold text-[var(--text-primary)]">
                  {title}
                </span>
                <span className="mt-1 block break-all font-mono text-[11px] leading-4">
                  {source.version}
                </span>
              </span>
            </SheetDescription>
          </SheetHeader>
          {open ? (
            <Destination
              source={source}
              defaultProjectId={defaultProjectId}
              defaultWorkspaceId={defaultWorkspaceId}
              onDone={() => {
                setOpen(false);
                onAdded?.();
              }}
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
    <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-6">
      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Destination project
        <select
          aria-label="Destination project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="mb-5 mt-2 h-9 w-full rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 text-[13px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--text-secondary)]">Source release</p>
        <p className="mt-2 break-all text-[13px] leading-5">{source.canonicalName}</p>
        <p className="mt-2 flex min-h-9 items-center gap-2 rounded-[5px] border border-[var(--stroke-default)] px-2.5 font-mono text-xs text-[var(--text-secondary)]">
          <LockKeyhole className="size-3" />
          {source.version}
        </p>
        {source.expectedHash ? (
          <details className="mt-3 text-xs text-[var(--text-tertiary)]">
            <summary className="cursor-pointer">Exact source hash</summary>
            <p className="mt-2 break-all font-mono text-[11px]">{source.expectedHash}</p>
          </details>
        ) : null}
      </div>
      <div className="border-t border-[var(--stroke-divider)] pt-5">
        <h3 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
          Already in this Studio
        </h3>
        {studio.loading ? (
          <output>Loading candidates…</output>
        ) : studio.items.length ? (
          <ul className="space-y-2">
            {studio.items.map((item) => (
              <li
                key={item.id}
                className={`flex min-h-10 items-center gap-2 rounded-[5px] border px-2.5 py-2 text-xs ${existing?.id === item.id ? 'border-[var(--accent-commit)] bg-[var(--status-info-muted)]' : 'border-[var(--stroke-divider)]'}`}
              >
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--text-tertiary)]"
                />
                <span className="min-w-0 flex-1 break-words leading-5">
                  {item.title ?? 'Unavailable source'}
                </span>
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
      <div className="sticky bottom-0 -mx-6 mt-auto border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-6 pb-5 pt-4">
        <p className="mb-4 text-xs leading-5 text-[var(--text-secondary)]">
          Explore and compare before applying to a Workspace.
        </p>
        <div className="grid gap-2">
          <Button
            className="h-10 w-full rounded-[5px] bg-[var(--accent-commit)] text-white hover:bg-[var(--accent-commit)] hover:brightness-95"
            disabled={studio.pending || studio.loading}
            onClick={() => void save(true)}
          >
            {existing || added ? 'Open Studio' : 'Add & open Studio'}{' '}
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            className="h-9 text-xs text-[var(--accent-commit)]"
            disabled={studio.pending || studio.loading}
            onClick={() => void save(false)}
          >
            Add & keep browsing
          </Button>
          <Button
            variant="ghost"
            className="h-8 text-xs text-[var(--text-tertiary)]"
            onClick={onDone}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
