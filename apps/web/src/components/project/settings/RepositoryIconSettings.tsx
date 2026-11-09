'use client';

import {
  type RepositoryIcon,
  RepositoryIconColorSchema,
  RepositoryIconKeySchema,
  type RepositoryIconSelection,
  RepositoryIconSelectionSchema,
} from '@t3x-dev/api-client';
import { Shapes } from 'lucide-react';
import { useState } from 'react';
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
import { RepositoryMark, repositoryGlyphs } from '../RepositoryIdentity';
import { SettingsSection } from './SettingsSection';

export function RepositoryIconSettings({
  projectId,
  name,
  icon,
  canEdit,
  onSave,
}: {
  projectId: string;
  name: string;
  icon?: RepositoryIcon | null;
  canEdit: boolean;
  onSave: (icon: RepositoryIconSelection | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RepositoryIconSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = draft?.key !== icon?.key || draft?.color !== icon?.color;

  return (
    <SettingsSection
      id="appearance"
      icon={Shapes}
      title="Appearance"
      description="Set the icon shown in the repository header, directory, and Explore."
    >
      <div className="flex flex-wrap items-center gap-3">
        <RepositoryMark id={projectId} icon={icon} />
        <span className="text-sm">Repository icon</span>
        {canEdit && (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (busy) return;
              if (next) {
                setDraft(
                  icon ? (RepositoryIconSelectionSchema.safeParse(icon).data ?? null) : null
                );
                setError('');
              }
              setOpen(next);
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Change icon
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Choose a repository icon</DialogTitle>
                <DialogDescription>
                  Choose a symbol and color, or use the default icon.
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (busy || !dirty) return;
                  setBusy(true);
                  setError('');
                  try {
                    await onSave(draft);
                    setOpen(false);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not save the icon.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <RepositoryMark id={projectId} icon={draft} />
                  <div className="min-w-0 break-words text-sm font-medium">{name}</div>
                </div>
                <fieldset className="min-w-0" disabled={busy}>
                  <legend className="mb-2 text-sm font-medium">Icon</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    <Button
                      type="button"
                      variant={draft ? 'outline' : 'secondary'}
                      aria-pressed={!draft}
                      className="min-h-11 px-1 text-xs aria-pressed:border aria-pressed:border-ring"
                      onClick={() => setDraft(null)}
                    >
                      Default
                    </Button>
                    {RepositoryIconKeySchema.options.map((key) => {
                      const Glyph = repositoryGlyphs[key];
                      const label = key.replaceAll('-', ' ');
                      const selected = draft?.key === key;
                      return (
                        <Button
                          key={key}
                          type="button"
                          variant={selected ? 'secondary' : 'outline'}
                          aria-pressed={selected}
                          className="min-h-11 flex-col gap-0 px-1 text-xs capitalize aria-pressed:border aria-pressed:border-ring"
                          onClick={() => setDraft({ key, color: draft?.color ?? 'violet' })}
                        >
                          <Glyph aria-hidden="true" />
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="grid gap-1.5 text-sm font-medium">
                  Color
                  <select
                    className="min-h-10 rounded-md border bg-background px-3 font-normal capitalize focus-visible:outline-2 focus-visible:outline-ring"
                    disabled={busy || !draft}
                    value={draft?.color ?? 'violet'}
                    onChange={(event) => {
                      const color = RepositoryIconColorSchema.parse(event.target.value);
                      setDraft((current) => current && { ...current, color });
                    }}
                  >
                    {RepositoryIconColorSchema.options.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                {error && (
                  <p role="alert" className="text-sm text-[var(--status-error)]">
                    {error}
                  </p>
                )}
                <DialogFooter className="flex-row justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || !dirty}>
                    {busy ? 'Saving…' : 'Save icon'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </SettingsSection>
  );
}
