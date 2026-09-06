'use client';
import type { SchemaReleasePresentationReference } from '@t3x-dev/api-client';
import Image from 'next/image';
import { resourceUrl } from '@/components/project/StateAuthorReadme';
import { usePublishIntroduction } from '@/hooks/schemas/useSchemaCatalog';
export function SchemaPublishIntroduction({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value?: SchemaReleasePresentationReference;
  onChange: (reference: SchemaReleasePresentationReference | undefined) => void;
}) {
  const introduction = usePublishIntroduction(projectId, true);
  const document = introduction?.data?.document;
  const reference = introduction?.reference;
  const cover = document?.resources.find((resource) => resource.path === value?.coverPath);
  return (
    <section
      className="space-y-3 border-t border-[var(--stroke-divider)] pt-4"
      aria-label="Release introduction"
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 accent-[var(--color-brand)]"
          checked={!!value}
          disabled={!reference}
          onChange={(event) => onChange(event.target.checked ? reference : undefined)}
        />
        <span>
          Include project introduction
          {reference ? (
            <span className="mt-1 block font-mono text-[11px] text-[var(--text-tertiary)]">
              main · {reference.commitDigest.replace('sha256:', '').slice(0, 10)}
            </span>
          ) : null}
        </span>
      </label>
      {introduction?.error ? (
        <p role="alert" className="text-xs text-[var(--status-error)]">
          {introduction.error}
        </p>
      ) : null}
      {!introduction ? (
        <output className="block text-xs text-[var(--text-secondary)]">
          Loading introduction…
        </output>
      ) : !reference ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          Add an introduction in State Overview to include it in a release.
        </p>
      ) : null}
      {value && document ? (
        <>
          <p className="text-xs text-[var(--text-secondary)]">{document.description}</p>
          <label className="block text-xs font-medium">
            Cover image
            <select
              aria-label="Release cover image"
              value={value.coverPath ?? ''}
              onChange={(event) => {
                const { coverPath: _, ...pin } = value;
                onChange(event.target.value ? { ...pin, coverPath: event.target.value } : pin);
              }}
              className="mt-2 h-9 w-full rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2"
            >
              <option value="">No cover</option>
              {document.resources.map((resource) => (
                <option key={resource.path} value={resource.path}>
                  {resource.alt} · {resource.path}
                </option>
              ))}
            </select>
          </label>
          {cover ? (
            <Image
              unoptimized
              src={resourceUrl(cover)}
              alt={cover.alt}
              width={480}
              height={180}
              className="max-h-36 w-full rounded-md object-cover"
            />
          ) : null}
          <p className="text-[11px] text-[var(--text-tertiary)]">
            This release keeps the selected introduction and image revision.
          </p>
        </>
      ) : null}
    </section>
  );
}
