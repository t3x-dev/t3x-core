'use client';

import {
  type RepositoryProfile,
  type RepositoryProfilePatch,
  RepositoryProfilePatchSchema,
} from '@t3x-dev/api-client';
import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { RepositoryTagsInput } from './RepositoryTagsInput';

export function RepositoryProfileEditor({
  field,
  profile,
  onSave,
}: {
  field: 'readme' | 'tags';
  profile: RepositoryProfile;
  onSave: (patch: RepositoryProfilePatch) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const label = field === 'readme' ? 'README' : 'tags';
  const hasContent = field === 'readme' ? Boolean(profile.readme.trim()) : profile.tags.length > 0;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setValue(field === 'readme' ? profile.readme : profile.tags.join('\n'));
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden="true" className="size-3.5" /> {hasContent ? 'Edit' : 'Add'} {label}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Edit repository {label}</SheetTitle>
            <SheetDescription>
              Current repository information, shared across branches.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (inFlight.current) return;
              setError(null);
              const parsed = RepositoryProfilePatchSchema.safeParse(
                field === 'readme' ? { readme: value } : { tags: value.split('\n') }
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
            {field === 'readme' ? (
              <label className="block space-y-2 text-sm">
                Repository README
                <textarea
                  aria-label="Repository README"
                  rows={16}
                  value={value}
                  disabled={busy}
                  onChange={(event) => setValue(event.target.value)}
                  className="w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] p-2 font-mono text-sm"
                />
                <span className="block text-xs text-[var(--text-secondary)]">
                  Markdown · at most 128 KiB UTF-8. Images are not supported. Clear the text to
                  remove the README.
                </span>
              </label>
            ) : (
              <RepositoryTagsInput value={value} onChange={setValue} disabled={busy} />
            )}
            {error ? (
              <p role="alert" className="text-sm text-[var(--status-error)]">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button disabled={busy} type="submit">
                {busy ? 'Saving…' : `Save ${label}`}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
