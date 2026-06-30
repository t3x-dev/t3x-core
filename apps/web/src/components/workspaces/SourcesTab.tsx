import type { SourceBundleItem } from '@/types/workspaces';

export function SourcesTab({ sources }: { sources: SourceBundleItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {sources.map((source) => (
          <li
            className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-subtle)] px-3 py-2"
            key={source.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">{source.title}</p>
              <p className="text-xs text-[var(--text-secondary)]">{source.type}</p>
            </div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {formatSourceReference(source)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSourceReference(source: SourceBundleItem): string {
  if (source.conversationId) return source.conversationId;
  if (source.fileName) return source.fileName;
  if (source.runId) return source.runId;
  if (source.format) return source.format;
  return 'Source evidence';
}
