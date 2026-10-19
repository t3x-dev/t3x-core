'use client';
import {
  type StudioPreview,
  StudioPublishInputSchema,
  type StudioPublishResult,
} from '@t3x-dev/api-client';
import Link from 'next/link';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { usePublishStudioSchema } from '@/hooks/schemas/usePublishStudioSchema';

export function StudioPublishDialog({
  projectId,
  workspaceId,
  preview,
  candidateIds,
  currentReviewHash,
  onOpenChange,
}: {
  projectId: string;
  workspaceId: string;
  preview: StudioPreview;
  candidateIds: string[];
  currentReviewHash?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const publish = usePublishStudioSchema(projectId, workspaceId);
  const id = useId();
  const mounted = useRef(true);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<StudioPublishResult>();
  const [name, setName] = useState(`projects/${projectId}/my-schema`);
  const [version, setVersion] = useState('1.0.0');
  const [title, setTitle] = useState('My Schema');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const canPublish =
    preview.reviewHash === currentReviewHash &&
    preview.report.valid &&
    preview.adoption.allowed &&
    preview.impact?.canPublish === true &&
    !!preview.freshness.candidateId &&
    !!preview.freshness.candidateRevision &&
    !!preview.workspace;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !canPublish) return;
    const parsed = StudioPublishInputSchema.safeParse({
      candidateIds,
      schemaEditCandidate: {
        candidateId: preview.freshness.candidateId,
        revision: preview.freshness.candidateRevision,
      },
      ifRevision: preview.workspace?.revision,
      reviewHash: preview.reviewHash,
      canonicalName: name,
      version,
      title,
      description,
      releaseNotes: notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid release metadata.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const release = await publish(parsed.data);
      if (mounted.current) setResult(release);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Publication failed.');
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const releaseHref = result
    ? `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({
        tab: 'browse',
        schemaView: 'release',
        catalogName: result.source.canonicalName,
        catalogVersion: result.source.version,
        catalogHash: result.source.hash,
      })}`
    : '';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish private Schema</DialogTitle>
          <DialogDescription>
            Freeze this verified definition as an immutable Schema version. Base sources and local
            contributions are retained. No Module publication is required; upstream and Workspace
            remain unchanged.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <section className="space-y-3" aria-label="Published Schema">
            <output>
              Published {result.source.canonicalName}@{result.source.version} · Private Schema
            </output>
            <p className="break-all font-mono text-xs">Artifact Hash: {result.source.hash}</p>
            <p className="break-all font-mono text-xs">Schema Hash: {result.schemaHash}</p>
            <Button asChild>
              <Link href={releaseHref}>Open exact release in Browse</Link>
            </Button>
          </section>
        ) : (
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <label htmlFor={`${id}-name`} className="grid gap-1 text-sm">
              Canonical name
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label htmlFor={`${id}-version`} className="grid gap-1 text-sm">
              Version
              <Input
                id={`${id}-version`}
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                disabled={busy}
                required
              />
            </label>
            <label htmlFor={`${id}-title`} className="grid gap-1 text-sm">
              Title
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={busy}
                required
                maxLength={80}
              />
            </label>
            <label htmlFor={`${id}-description`} className="grid gap-1 text-sm">
              Description
              <Textarea
                id={`${id}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
                maxLength={500}
              />
            </label>
            <label htmlFor={`${id}-notes`} className="grid gap-1 text-sm">
              Release notes
              <Textarea
                id={`${id}-notes`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={busy}
                maxLength={1000}
              />
            </label>
            <p className="break-all text-xs text-[var(--text-secondary)]">
              Reviewed Schema Hash: {preview.schemaHash}
            </p>
            {!canPublish ? (
              <p role="alert">
                Save and check the current candidate, and resolve content impact before publishing.
                This preview may be stale.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-[var(--status-error)]">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !canPublish}>
                {busy ? 'Publishing…' : 'Publish private version'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
