'use client';

import { ChevronDown, Download, FileText, Link2, PanelTop, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shortHash } from '@/domain/format/formatters';
import { artifactSchemaLabels } from '@/domain/project/stateArtifact';
import { downloadStateArtifactCard, useStateArtifact } from '@/hooks/commits/useStateArtifact';
import { useClipboard } from '@/hooks/shared/useClipboard';
import { stateArtifactStyles } from './stateArtifactStyles';

interface ArtifactProps {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  schemaBindings?: readonly Record<string, unknown>[];
  commitDigest: string;
  structureYaml: string;
  href: string;
}

export function StateArtifactDialog({
  open,
  onOpenChange,
  ...props
}: ArtifactProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PanelTop aria-hidden="true" /> View share card
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh_-_1.5rem)] w-[calc(100%_-_1.5rem)] max-w-[48rem] flex-col gap-0 overflow-hidden rounded-xl bg-background/85 p-0 backdrop-blur-md data-[state=closed]:animate-none! data-[state=open]:animate-none! sm:max-h-[calc(100dvh_-_3rem)] sm:max-w-[48rem] dark:bg-background/85 dark:backdrop-blur-md"
        overlayClassName="backdrop-blur-[2px]"
        showCloseButton={false}
      >
        {open ? <ArtifactPreview {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ArtifactPreview({
  projectId,
  projectName,
  projectDescription,
  schemaBindings,
  commitDigest,
  structureYaml,
  href,
}: ArtifactProps) {
  const card = useRef<HTMLElement>(null);
  const exportInFlight = useRef(false);
  const { result, summary, retry } = useStateArtifact(projectId, commitDigest, structureYaml);
  const { copy } = useClipboard();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const data = result && 'data' in result ? result.data : null;
  const description = typeof projectDescription === 'string' ? projectDescription.trim() : '';
  const objectType = summary?.objectType ?? (data?.exact ? 'State' : null);
  const schemaLabels = artifactSchemaLabels(schemaBindings);
  const fieldCount = summary?.rows.reduce((count, row) => count + row.fields.length, 0) ?? 0;

  async function share() {
    const url = new URL(href, window.location.origin).href;
    const copied = await copy(url);
    setFeedback({
      text: copied
        ? 'Version link copied. Repository access is required.'
        : 'Unable to copy the link.',
      error: !copied,
    });
  }

  async function download(format: 'html' | 'png') {
    if (!card.current || exportInFlight.current) return;
    exportInFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await downloadStateArtifactCard(
        card.current,
        stateArtifactStyles,
        projectName,
        commitDigest,
        format
      );
    } catch {
      setFeedback({
        text:
          format === 'png' ? 'Could not export PNG. Try HTML instead.' : 'Could not export HTML.',
        error: true,
      });
    } finally {
      exportInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background/65 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <DialogTitle>Share card</DialogTitle>
          <DialogDescription className="mt-1 break-words">
            {projectName} · <code title={commitDigest}>{shortHash(commitDigest)}</code>
          </DialogDescription>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => void share()} disabled={!data}>
            <Link2 aria-hidden="true" /> Copy version link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!data || busy}>
                <Download aria-hidden="true" /> {busy ? 'Exporting…' : 'Export'}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[60]">
              <DropdownMenuItem onSelect={() => void download('html')}>
                HTML · Card + {data?.exact ? 'full' : 'Structure'} data
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void download('png')}>
                PNG · Card snapshot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Close share card">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
      </header>
      {feedback ? (
        <p
          role={feedback.error ? 'alert' : 'status'}
          className="border-b px-4 py-2 text-sm sm:px-6"
        >
          {feedback.text}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-6 sm:py-6">
        {!result ? <output className="block text-center">Loading committed data…</output> : null}
        {result && 'error' in result ? (
          <div className="mx-auto flex max-w-xl flex-col items-start gap-3">
            <p role="alert">{result.error}</p>
            <Button size="sm" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {data ? (
          <div className="flex justify-center">
            <style>{stateArtifactStyles}</style>
            <article className="t3x-state-artifact" ref={card}>
              <header>
                <span className="t3x-artifact-icon" aria-hidden="true">
                  <FileText size={19} />
                </span>
                <div>
                  <p className="t3x-artifact-tags">
                    {objectType ? (
                      <span className="t3x-artifact-tag-kind">{objectType}</span>
                    ) : null}
                    <span>
                      Committed · <code>{shortHash(commitDigest)}</code>
                    </span>
                  </p>
                  <h2>{projectName}</h2>
                  {description ? (
                    <div className="t3x-artifact-description">
                      <ArtifactText value={description} />
                    </div>
                  ) : null}
                </div>
              </header>
              <section aria-label="Content summary">
                <div className="t3x-artifact-section-heading">
                  <h3>{objectType === 'Content' ? 'Structure summary' : 'Content summary'}</h3>
                  {summary ? (
                    <span className="t3x-artifact-note">
                      {summary.hasMore ? 'First ' : ''}
                      {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
                    </span>
                  ) : null}
                </div>
                {!summary ? (
                  <p className="t3x-artifact-note">
                    Content summary is unavailable. You can still view the YAML below.
                  </p>
                ) : summary.rows.length ? (
                  <div className="t3x-artifact-groups">
                    {summary.rows.map(({ path, fields }, index) => (
                      <div className="t3x-artifact-group" key={`${index}:${JSON.stringify(path)}`}>
                        {path.length || summary.rows.length > 1 ? (
                          <h4>{path.length ? path.join(' / ') : 'Root fields'}</h4>
                        ) : null}
                        <dl>
                          {fields.map(({ name, value }) => (
                            <div key={name}>
                              <dt>{name}</dt>
                              <dd>
                                <ArtifactText value={value} />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="t3x-artifact-note">No fields in this version.</p>
                )}
                {summary && (summary.hasMore || objectType === 'Content') ? (
                  <p className="t3x-artifact-scope">
                    {objectType === 'Content'
                      ? 'Structure preview. Full data includes all fields and relations.'
                      : 'Summary preview. Full data includes the remaining fields.'}
                  </p>
                ) : null}
              </section>
              <details className="t3x-artifact-disclosure">
                <summary>{data.exact ? 'Full data (YAML)' : 'Structure data (YAML)'}</summary>
                {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll the full data. */}
                <pre tabIndex={0}>
                  <code>{data.yaml}</code>
                </pre>
              </details>
              <details className="t3x-artifact-disclosure">
                <summary>
                  Version details
                  {schemaLabels.length
                    ? ` · ${schemaLabels.length} ${schemaLabels.length === 1 ? 'Schema' : 'Schemas'}`
                    : ''}
                </summary>
                <dl className="t3x-artifact-metadata">
                  <div>
                    <dt>Commit</dt>
                    <dd>
                      <code>{commitDigest}</code>
                    </dd>
                  </div>
                  {schemaLabels.length ? (
                    <div>
                      <dt>Schema</dt>
                      <dd>
                        {schemaLabels.map((label) => (
                          <p key={label}>{label}</p>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            </article>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ArtifactText({ value }: { value: string }) {
  const preview = value.split('\n').slice(0, 3).join('\n').slice(0, 240);
  if (preview === value) return <span className="t3x-artifact-value">{value}</span>;
  return (
    <details className="t3x-artifact-text">
      <summary>
        <span className="t3x-artifact-excerpt">{preview}…</span>
        <span className="t3x-artifact-more">Show more</span>
        <span className="t3x-artifact-less">Show less</span>
      </summary>
      <p className="t3x-artifact-value">{value}</p>
    </details>
  );
}
