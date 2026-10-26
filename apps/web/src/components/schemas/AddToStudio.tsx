'use client';
import type { AddStudioCandidate } from '@t3x-dev/api-client';
import { ArrowRight, Box, Check, LockKeyhole, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { safeExploreReturn } from '@/domain/project/exploreLocation';
import { DEFAULT_OWNER_SLUG } from '@/domain/project/repoPath';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useSchemaTargets } from '@/hooks/explore/useExploreData';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import palette from '@/styles/management-palette.module.css';

type Props = {
  source: AddStudioCandidate;
  title: string;
  defaultProjectId: string;
  defaultWorkspaceId?: string;
  branch?: string;
  returnTo?: string;
  requireSelection?: boolean;
  disabled?: boolean;
  layout?: 'sheet' | 'inline';
  onAdded?: () => void;
};
export function AddToStudio(props: Props) {
  const [open, setOpen] = useState(false);
  function done(openStudio: boolean) {
    setOpen(false);
    if (!openStudio) props.onAdded?.();
  }
  if (props.layout === 'inline') return <Destination {...props} onDone={done} />;
  return (
    <>
      <Button disabled={props.disabled} onClick={() => setOpen(true)}>
        Use Schema <ArrowRight className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className={`${palette.scope} flex w-full flex-col gap-0 overflow-y-auto bg-[var(--surface-card)] sm:max-w-[430px]`}
        >
          <SheetHeader className="px-6 pb-6 pt-6">
            <SheetTitle>Use Schema</SheetTitle>
            <SheetDescription className="mt-4 flex items-center gap-3">
              <Box className="size-9 shrink-0 text-[var(--accent-commit)]" />
              <span className="min-w-0">
                <span className="block break-words font-semibold text-[var(--text-primary)]">
                  {props.title}
                </span>
                <span className="mt-1 block font-mono text-xs">{props.source.version}</span>
              </span>
            </SheetDescription>
          </SheetHeader>
          {open && (
            <div className="px-6 pb-6">
              <Destination {...props} onDone={done} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
function Destination({
  source,
  defaultProjectId,
  defaultWorkspaceId,
  branch,
  returnTo,
  requireSelection,
  onDone,
}: Props & { onDone: (openStudio: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(requireSelection ? '' : defaultProjectId);
  const targets = useSchemaTargets(
    new URLSearchParams({ limit: '30', ...(query ? { q: query } : {}) }).toString()
  );
  const { activeAccount, accounts } = useNamespaceAccounts();
  const owner = activeAccount?.namespace.slug ?? accounts[0]?.namespace.slug ?? DEFAULT_OWNER_SLUG;
  const safeReturn = safeExploreReturn(returnTo);
  const newProjectHref = `/${encodeURIComponent(owner)}/new${safeReturn ? `?${new URLSearchParams({ returnTo: safeReturn })}` : ''}`;
  const items = targets.data?.items ?? [];
  const selected = items.find((item) => item.projectId === projectId);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-medium">Destination project</p>
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Choose a project you can edit. This saves a candidate to its Studio; you’ll review a
          Workspace before applying it.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setProjectId('');
          setQuery(search.trim());
        }}
      >
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs"
          aria-label="Find destination project"
          placeholder="Find a project…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="outline" size="sm" type="submit">
          Find
        </Button>
      </form>
      <select
        aria-label="Destination project"
        className="h-10 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-sm"
        value={selected ? projectId : ''}
        onChange={(event) => setProjectId(event.target.value)}
        disabled={targets.loading}
      >
        <option value="">{targets.loading ? 'Loading projects…' : 'Select a project'}</option>
        {items.map((item) => (
          <option key={item.projectId} value={item.projectId}>
            {item.namespace ? `${item.namespace} / ` : ''}
            {item.name}
            {item.projectId === defaultProjectId ? ' · from your link' : ''}
          </option>
        ))}
      </select>
      {targets.error && (
        <div role="alert" className="text-xs text-[var(--status-error)]">
          {targets.error}
          <button type="button" onClick={targets.retry} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
      {!targets.loading && !targets.error && !items.length && (
        <p className="text-sm text-[var(--text-secondary)]">
          {query
            ? 'No editable projects match your search.'
            : 'You don’t have an editable project yet.'}
        </p>
      )}
      {targets.data?.has_more && (
        <Button
          variant="outline"
          size="sm"
          disabled={targets.morePending}
          onClick={() => void targets.loadMore()}
        >
          {targets.morePending ? 'Loading…' : 'Load more projects'}
        </Button>
      )}
      <Link
        className="flex items-center gap-1 text-xs text-[var(--accent-commit)]"
        href={newProjectHref}
      >
        <Plus size={14} />
        New project{safeReturn ? ' & return to this release' : ''}
      </Link>
      {selected ? (
        <CandidateConfirmation
          key={`${projectId}:${source.canonicalName}:${source.version}:${source.expectedHash}`}
          projectId={projectId}
          workspaceId={projectId === defaultProjectId ? defaultWorkspaceId : undefined}
          branch={projectId === defaultProjectId ? branch : undefined}
          source={source}
          returnTo={safeReturn}
          onDone={onDone}
        />
      ) : null}
    </div>
  );
}
function CandidateConfirmation({
  projectId,
  workspaceId,
  branch,
  source,
  returnTo,
  onDone,
}: {
  projectId: string;
  workspaceId?: string;
  branch?: string;
  source: AddStudioCandidate;
  returnTo?: string;
  onDone: (openStudio: boolean) => void;
}) {
  const studio = useStudioCandidates(projectId);
  const router = useRouter();
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  const existing = studio.items.find(
    (item) =>
      item.source?.projectId === (source.sourceProjectId ?? null) &&
      item.source?.canonicalName === source.canonicalName &&
      item.source.version === source.version &&
      item.source.hash === source.expectedHash
  );
  async function save(open: boolean) {
    if (busy.current) return;
    busy.current = true;
    setError(undefined);
    try {
      // The idempotent endpoint rechecks live destination/source authority even for existing candidates.
      const candidate = await studio.add(source);
      if (!candidate) return;
      toast.success('Schema saved to Studio');
      onDone(open);
      if (open)
        router.push(
          `/project/${encodeURIComponent(projectId)}?${new URLSearchParams({ tab: 'schemas', schemaView: 'studio', candidate: candidate.id, ...(workspaceId ? { workspace: workspaceId } : {}), ...(branch ? { branch } : {}), ...(returnTo ? { returnTo } : {}) })}`
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this candidate.');
    } finally {
      busy.current = false;
    }
  }
  return (
    <div className="flex flex-col gap-4 border-t border-[var(--stroke-divider)] pt-5">
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">Pinned source release</p>
        <p className="mt-2 break-all text-sm">{source.canonicalName}</p>
        <p className="mt-2 flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)]">
          <LockKeyhole size={13} />
          {source.version}
        </p>
        {source.expectedHash && (
          <details className="mt-3 text-xs text-[var(--text-tertiary)]">
            <summary className="cursor-pointer">Exact source hash</summary>
            <p className="mt-2 break-all font-mono">{source.expectedHash}</p>
          </details>
        )}
      </div>
      {studio.loading && <output className="text-xs">Checking this Studio…</output>}
      {existing && (
        <p className="flex items-center gap-2 text-xs text-[var(--status-success)]">
          <Check size={14} />
          This exact release is already saved in this Studio.
        </p>
      )}
      {(error || studio.error) && (
        <p role="alert" className="text-xs text-[var(--status-error)]">
          {error || studio.error}
          {studio.error && (
            <button type="button" onClick={() => void studio.refresh()} className="ml-2 underline">
              Retry
            </button>
          )}
        </p>
      )}
      <div className="grid gap-2">
        <Button
          disabled={studio.pending || studio.loading || !!studio.error}
          onClick={() => void save(true)}
        >
          {studio.pending ? 'Saving…' : existing ? 'Open Studio' : 'Add & open Studio'}
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="outline"
          disabled={studio.pending || studio.loading || !!studio.error}
          onClick={() => void save(false)}
        >
          Add & keep browsing
        </Button>
      </div>
    </div>
  );
}
