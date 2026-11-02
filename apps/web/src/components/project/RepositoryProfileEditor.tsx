'use client';

import {
  type RepositoryProfile,
  type RepositoryProfilePatch,
  RepositoryProfilePatchSchema,
} from '@t3x-dev/api-client';
import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NamespaceTagChoices } from './RepositoryTagPicker';
import { type RepositoryTagsDraft, RepositoryTagsInput } from './RepositoryTagsInput';

export function RepositoryProfileEditor({
  profile,
  suggestionsNamespace,
  onSave,
}: {
  profile: RepositoryProfile;
  suggestionsNamespace?: string;
  onSave: (patch: RepositoryProfilePatch) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RepositoryTagsDraft>({ tags: [], input: '' });
  const [initial, setInitial] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dirty =
    Boolean(draft.input.trim()) || JSON.stringify(initial) !== JSON.stringify(draft.tags);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (pending.current || (!next && dirty)) return;
        if (next) {
          setInitial(profile.tags);
          setDraft({ tags: profile.tags, input: '' });
          setError('');
          setQuery('');
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-[var(--text-secondary)]">
          <Pencil aria-hidden="true" className="size-3.5" /> {profile.tags.length ? 'Edit' : 'Add'}{' '}
          tags
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        aria-label="Edit repository tags"
        className="w-[360px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
        onEscapeKeyDown={(e) => {
          if (dirty || pending.current) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (dirty || pending.current) e.preventDefault();
        }}
      >
        <form
          className="flex max-h-[var(--radix-popover-content-available-height)] flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending.current) return;
            const patch = RepositoryProfilePatchSchema.safeParse({
              tags: [...draft.tags, draft.input],
            });
            if (!patch.success) {
              setError(patch.error.issues[0]?.message ?? 'Invalid tags.');
              return;
            }
            pending.current = true;
            setBusy(true);
            setError('');
            try {
              await onSave(patch.data);
              setOpen(false);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not save tags.');
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          <div className="grid min-h-0 gap-3 overflow-y-auto p-4 [&_fieldset_fieldset]:max-h-none">
            <RepositoryTagsInput value={draft} onChange={setDraft} disabled={busy} />
            {suggestionsNamespace && (
              <fieldset className="min-w-0 space-y-2 border-t pt-3" disabled={busy}>
                <legend className="text-sm font-semibold">Existing tags</legend>
                <Input
                  type="search"
                  aria-label="Search existing tags"
                  placeholder="Search existing tags…"
                  value={query}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <NamespaceTagChoices
                  namespace={suggestionsNamespace}
                  query={query}
                  selected={draft.tags}
                  onChange={(tags) => setDraft((v) => ({ ...v, tags }))}
                  maxSelected={32}
                />
              </fieldset>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error}
            </p>
          )}
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--stroke-divider)] px-4 py-2">
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save tags'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
