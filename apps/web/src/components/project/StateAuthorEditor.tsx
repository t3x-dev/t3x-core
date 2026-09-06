'use client';
import type { StatePresentationInput } from '@t3x-dev/api-client';
import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useStateAuthoring } from '@/hooks/commits/useStateAuthoring';

export function StateAuthorEditor({
  projectId,
  refName,
  commitDigest,
  initial,
  onSaved,
}: {
  projectId: string;
  refName: string;
  commitDigest: string;
  initial: StatePresentationInput;
  onSaved: (digest: string) => void;
}) {
  const { canEdit, busy, error, save } = useStateAuthoring(projectId, refName, commitDigest);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [tags, setTags] = useState((initial.tags ?? []).join('\n'));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const resources = draft.resources ?? [];
  const field =
    'w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] p-2 text-sm';
  if (!canEdit) return null;
  return (
    <>
      <Button
        aria-label="Edit introduction"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <Pencil className="size-3.5" /> Edit introduction
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!busy && !uploading) setOpen(value);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Edit introduction</SheetTitle>
            <SheetDescription>
              Your description, README and images. Saving creates a new revision on {refName}.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void save(
                {
                  ...draft,
                  tags: tags
                    .split('\n')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                },
                onSaved
              );
            }}
          >
            <fieldset
              disabled={busy || uploading}
              className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5"
            >
              <label className="block space-y-1 text-sm">
                Description
                <textarea
                  className={field}
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-sm">
                README
                <textarea
                  className={`${field} min-h-64 font-mono`}
                  rows={12}
                  aria-label="README"
                  value={draft.readme ?? ''}
                  onChange={(e) => setDraft({ ...draft, readme: e.target.value })}
                />
                <span className="text-xs text-[var(--text-tertiary)]">
                  Markdown · reference your images by their bundled path.
                </span>
              </label>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Tags & images</summary>
                <div className="mt-3 space-y-4">
                  <label className="block space-y-1 text-sm">
                    Tags, one per line
                    <textarea
                      className={field}
                      rows={3}
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    Avatar
                    <select
                      className={field}
                      aria-label="Avatar"
                      value={draft.avatarPath ?? ''}
                      onChange={(e) =>
                        setDraft({ ...draft, avatarPath: e.target.value || undefined })
                      }
                    >
                      <option value="">No avatar</option>
                      {resources.map((r) => (
                        <option key={r.path} value={r.path}>
                          {r.path}
                        </option>
                      ))}
                    </select>
                  </label>
                  {resources.map((resource) => (
                    <div key={resource.path} className="space-y-2 border-b pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <code className="break-all text-xs">{resource.path}</code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${resource.path}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              avatarPath:
                                draft.avatarPath === resource.path ? undefined : draft.avatarPath,
                              resources: resources.filter((r) => r.path !== resource.path),
                            })
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <label className="block text-xs">
                        Image description
                        <input
                          className={field}
                          value={resource.alt}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              resources: resources.map((r) =>
                                r.path === resource.path ? { ...r, alt: e.target.value } : r
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  <label className="block text-sm">
                    <span className="flex items-center gap-1">
                      <Plus className="size-4" /> Add image
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="mt-2 w-full text-xs"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        setUploading(true);
                        try {
                          if (file.size > 512 * 1024 || resources.length >= 16)
                            throw new Error('Use up to 16 images, each at most 512 KiB.');
                          if (!/^[A-Za-z0-9_.-]+$/.test(file.name))
                            throw new Error(
                              'Use a filename containing letters, numbers, dots, dashes or underscores.'
                            );
                          const path = `images/${file.name}`;
                          if (resources.some((r) => r.path === path))
                            throw new Error(
                              'This image path already exists. Rename the file first.'
                            );
                          const data = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result).split(',')[1]);
                            reader.onerror = () => reject(new Error('Could not read image'));
                            reader.readAsDataURL(file);
                          });
                          setDraft((current) => ({
                            ...current,
                            resources: [
                              ...(current.resources ?? []),
                              {
                                path,
                                mediaType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
                                alt: file.name,
                                base64: data,
                              },
                            ],
                          }));
                          setUploadError(undefined);
                        } catch (cause) {
                          setUploadError(
                            cause instanceof Error ? cause.message : 'Could not read image'
                          );
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </details>
              {uploadError ? (
                <p role="alert" className="text-sm text-[var(--status-error)]">
                  {uploadError}
                </p>
              ) : null}
            </fieldset>
            <div className="space-y-3 border-t p-5">
              {error ? (
                <p role="alert" className="text-sm text-[var(--status-error)]">
                  {error}
                </p>
              ) : null}
              <p className="text-xs text-[var(--text-tertiary)]">
                Business YAML / JSON stays unchanged. Historical introductions remain available.
              </p>
              <Button className="w-full" disabled={busy || uploading} type="submit">
                {busy ? 'Saving…' : 'Save new revision'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
