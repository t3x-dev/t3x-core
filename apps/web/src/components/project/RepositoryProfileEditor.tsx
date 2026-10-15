'use client';

import {
  initialRepositoryReadme,
  type RepositoryProfile,
  type RepositoryProfilePatch,
  RepositoryProfilePatchSchema,
} from '@t3x-dev/api-client';
import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import { type RepositoryTagsDraft, RepositoryTagsInput } from './RepositoryTagsInput';

export function RepositoryProfileEditor({
  field,
  profile,
  projectName,
  projectDescription,
  onSave,
}: {
  field: 'readme' | 'tags';
  profile: RepositoryProfile;
  projectName: string;
  projectDescription?: string;
  onSave: (patch: RepositoryProfilePatch) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [tags, setTags] = useState<RepositoryTagsDraft>({ tags: [], input: '' });
  const [initialValue, setInitialValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const label = field === 'readme' ? 'README' : 'tags';
  const hasContent = field === 'readme' ? Boolean(profile.readme.trim()) : profile.tags.length > 0;
  const dirty =
    field === 'readme'
      ? value !== initialValue
      : Boolean(tags.input.trim()) || JSON.stringify(tags.tags) !== initialValue;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (inFlight.current) return;
        if (next) {
          setInitialValue(field === 'readme' ? profile.readme : JSON.stringify(profile.tags));
          setValue(
            profile.readme.trim()
              ? profile.readme
              : initialRepositoryReadme(projectName, projectDescription)
          );
          setTags({ tags: profile.tags, input: '' });
          setError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil aria-hidden="true" className="size-3.5" /> {hasContent ? 'Edit' : 'Add'} {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0',
          field === 'readme' ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
        showCloseButton={!busy}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          formRef.current
            ?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
            ?.focus();
        }}
        onInteractOutside={(event) => {
          if (dirty || inFlight.current) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (dirty || inFlight.current) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-[var(--stroke-divider)] px-6 py-5 pr-12 text-left">
          <DialogTitle>
            {hasContent ? 'Edit' : 'Add'} repository {label}
          </DialogTitle>
          <DialogDescription>
            {field === 'readme'
              ? 'Introduce your repository with Markdown.'
              : 'Help others understand what this repository is about.'}
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            setError(null);
            const parsed = RepositoryProfilePatchSchema.safeParse(
              field === 'readme' ? { readme: value } : { tags: [...tags.tags, tags.input] }
            );
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? 'Invalid input.');
              return;
            }
            inFlight.current = true;
            setBusy(true);
            try {
              await onSave(parsed.data);
              setOpen(false);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Could not save repository information.'
              );
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
            {field === 'readme' ? (
              <label className="block space-y-2 text-sm">
                <span className="font-medium">Repository README</span>
                <textarea
                  aria-label="Repository README"
                  rows={14}
                  value={value}
                  disabled={busy}
                  onChange={(event) => setValue(event.target.value)}
                  className="block min-h-48 w-full resize-y rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] p-3 font-mono text-sm leading-6 outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                />
                <span className="block text-xs text-[var(--text-secondary)]">
                  Markdown · images are not supported. Clear the text to remove the README.
                </span>
              </label>
            ) : (
              <RepositoryTagsInput value={tags} onChange={setTags} disabled={busy} />
            )}
            {error ? (
              <p role="alert" className="text-sm text-[var(--status-error)]">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t border-[var(--stroke-divider)] px-6 py-4">
            <Button disabled={busy} type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? 'Saving…' : `Save ${label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
