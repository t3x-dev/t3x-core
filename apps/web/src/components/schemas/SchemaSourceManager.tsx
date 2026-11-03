'use client';

import type { AddStudioCandidate, StudioCandidate } from '@t3x-dev/api-client';
import { MoreHorizontal, Plus } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SchemaSourceImport } from './SchemaSourceImport';
import s from './SchemaSourceManager.module.css';

type SourceOption = { id: string; title: string; source: string; candidate?: StudioCandidate };

export function SchemaSourceManager({
  open,
  onOpenChange,
  projectId,
  returnFocusRef,
  modules,
  selection,
  onRemove,
  removalBlockers,
  pending,
  loading,
  error,
  onCombine,
  combineDisabledReason,
  composition,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  modules: SourceOption[];
  selection: string[];
  onRemove: (id: string) => void;
  removalBlockers: Record<string, string>;
  pending: boolean;
  loading: boolean;
  error?: string;
  onCombine?: (ids: string[]) => void;
  combineDisabledReason?: string;
  composition?: ReactNode;
  onImport: (source: AddStudioCandidate) => Promise<StudioCandidate | undefined>;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [detailsId, setDetailsId] = useState<string>();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setIds(selection);
      setQuery('');
      setImporting(false);
      setDetailsId(undefined);
    }
    wasOpen.current = open;
  }, [open, selection]);
  const selected = ids.filter((sourceId) =>
    modules.some((item) => item.id === sourceId && item.candidate?.available)
  );
  const busy = pending || importPending;
  const combineReason =
    combineDisabledReason ||
    (!onCombine
      ? 'Select a saved Workspace before combining sources.'
      : busy
        ? 'Wait for the current operation to finish.'
        : loading
          ? 'Loading sources…'
          : !selected.length
            ? 'Select at least one source to combine.'
            : undefined);
  const visible = modules.filter((item) =>
    `${item.title} ${item.source}`.toLowerCase().includes(query.toLowerCase())
  );
  const step = composition ? 'combine' : importing ? 'import' : 'sources';
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex h-[min(760px,90dvh)] flex-col gap-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-card)] p-0 sm:max-w-[min(960px,96vw)]"
        showCloseButton={!busy}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader className="shrink-0 gap-1 border-b border-[var(--stroke-divider)] px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-sm font-medium">Schema sources</DialogTitle>
          <DialogDescription className="text-xs">
            Import reusable schemas, manage sources, and combine them into your draft.
          </DialogDescription>
        </DialogHeader>
        <div className={s.body}>
          <aside className={s.sidebar} aria-label="Source workflow">
            <strong>Schema sources</strong>
            <p>{modules.length} available in this project</p>
            <ol className={s.steps}>
              <li aria-current={step === 'sources' ? 'step' : undefined}>Select & manage</li>
              <li aria-current={step === 'import' ? 'step' : undefined}>Import schema</li>
              <li aria-current={step === 'combine' ? 'step' : undefined}>Combine & resolve</li>
            </ol>
            <p className="mt-6!">
              Selecting sources does not change your draft. Save the combined draft when it is
              ready.
            </p>
          </aside>
          <div className={s.main}>
            {composition ??
              (importing ? (
                <SchemaSourceImport
                  projectId={projectId}
                  candidates={modules.flatMap((item) => (item.candidate ? [item.candidate] : []))}
                  onImport={onImport}
                  onBack={() => setImporting(false)}
                  onBusyChange={setImportPending}
                />
              ) : (
                <>
                  <div className={s.toolbar}>
                    <Input
                      aria-label="Filter sources"
                      placeholder="Search sources…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <Button
                      variant="canvas-outline"
                      size="sm"
                      disabled={busy || loading}
                      onClick={() => setImporting(true)}
                    >
                      <Plus size={14} aria-hidden="true" /> Import schema…
                    </Button>
                  </div>
                  <div className={s.scroll}>
                    {loading ? <output className={s.feedback}>Loading sources…</output> : null}
                    {error ? (
                      <p role="alert" className={`${s.feedback} ${s.error}`}>
                        {error}
                      </p>
                    ) : null}
                    {visible.map((module, index) => {
                      const reason = removalBlockers[module.id];
                      const candidate = module.candidate;
                      const inputId = `${id}-source-${index}`;
                      return (
                        <div key={module.id}>
                          <div className={s.row}>
                            <input
                              id={inputId}
                              type="checkbox"
                              aria-label={`Select ${module.title} for combination`}
                              checked={selected.includes(module.id)}
                              disabled={busy || !candidate?.available}
                              onChange={() =>
                                setIds((current) =>
                                  current.includes(module.id)
                                    ? current.filter((value) => value !== module.id)
                                    : [...current, module.id]
                                )
                              }
                            />
                            <div className={s.identity}>
                              <label htmlFor={inputId}>{module.title}</label>
                              <p className={s.meta}>
                                {candidate?.source?.canonicalName ?? module.source} ·{' '}
                                {candidate?.source?.version ?? 'Unavailable'}
                              </p>
                              {candidate && !candidate.available ? (
                                <p className={s.meta}>{candidate.reason ?? 'Source unavailable'}</p>
                              ) : null}
                              {reason ? (
                                <p id={`${inputId}-reason`} className={s.meta}>
                                  {reason}
                                </p>
                              ) : null}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Actions for ${module.title}`}
                                  disabled={busy}
                                >
                                  <MoreHorizontal size={16} aria-hidden="true" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setDetailsId(detailsId === module.id ? undefined : module.id)
                                  }
                                >
                                  View source details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  aria-label={`Remove ${module.title}`}
                                  disabled={busy || !!reason || !candidate}
                                  aria-describedby={reason ? `${inputId}-reason` : undefined}
                                  onSelect={() => onRemove(module.id)}
                                >
                                  Remove from sources
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {detailsId === module.id ? (
                            <dl className={s.details} aria-label={`Details for ${module.title}`}>
                              <dt>Source hash</dt>
                              <dd>
                                <code>{candidate?.source?.hash ?? 'Hash unavailable'}</code>
                              </dd>
                              <dt>Kind</dt>
                              <dd>{candidate?.kind ?? 'Unknown'}</dd>
                              {candidate?.description ? (
                                <>
                                  <dt>Description</dt>
                                  <dd>{candidate.description}</dd>
                                </>
                              ) : null}
                              {candidate?.license ? (
                                <>
                                  <dt>License</dt>
                                  <dd>{candidate.license}</dd>
                                </>
                              ) : null}
                            </dl>
                          ) : null}
                        </div>
                      );
                    })}
                    {!loading && !error && !visible.length ? (
                      <p className={s.feedback}>
                        {modules.length
                          ? 'No sources match this search.'
                          : 'No sources yet. Import a schema to get started.'}
                      </p>
                    ) : null}
                  </div>
                  <footer className={s.footer}>
                    <span>
                      {selected.length} {selected.length === 1 ? 'source' : 'sources'} selected
                    </span>
                    {combineReason ? (
                      <span id={`${id}-combine-reason`}>{combineReason}</span>
                    ) : null}
                    <Button
                      variant="commit"
                      size="sm"
                      disabled={!!combineReason}
                      aria-describedby={combineReason ? `${id}-combine-reason` : undefined}
                      onClick={() => onCombine?.(selected)}
                    >
                      Combine selected…
                    </Button>
                  </footer>
                </>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
