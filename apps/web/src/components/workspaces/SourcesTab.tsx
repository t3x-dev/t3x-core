import { FileText, MessageSquareText, Plus, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SourceBundleItem, SourceConversationTurn } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export function SourcesTab({ sources }: { sources: SourceBundleItem[] }) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(sources[0]?.id ?? null);

  useEffect(() => {
    if (sources.some((source) => source.id === selectedSourceId)) return;
    setSelectedSourceId(sources[0]?.id ?? null);
  }, [selectedSourceId, sources]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? sources[0] ?? null,
    [selectedSourceId, sources]
  );

  if (sources.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-6 text-center text-sm text-[var(--text-secondary)]">
        No source material yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Chat</h3>
          <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
            Talk with the model, then mark useful turns and documents as source evidence.
          </p>
        </div>
        <Button type="button" variant="commit">
          Extract candidate
        </Button>
      </header>

      <div className="grid min-h-[420px] gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          aria-label="Source context"
          className="flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Source context</h3>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{sources.length} sources</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Add chat source"
                size="icon-sm"
                type="button"
                variant="canvas-ghost"
              >
                <Plus className="size-4" />
              </Button>
              <Button
                aria-label="Upload document source"
                size="icon-sm"
                type="button"
                variant="canvas-ghost"
              >
                <Upload className="size-4" />
              </Button>
            </div>
          </div>

          <ul
            aria-label="Source list"
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2"
          >
            {sources.map((source) => {
              const selected = source.id === selectedSource?.id;
              const Icon = source.type === 'chat' ? MessageSquareText : FileText;

              return (
                <li key={source.id}>
                  <button
                    aria-pressed={selected}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selected
                        ? 'border-[var(--source)] bg-[var(--source)]/5'
                        : 'border-transparent bg-[var(--surface-card)] hover:border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]'
                    )}
                    onClick={() => setSelectedSourceId(source.id)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border',
                          selected
                            ? 'border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]'
                            : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]'
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                          {source.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[var(--text-tertiary)]">
                          {formatSourceReference(source)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
                        {source.type}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          aria-label="Selected source"
          className="flex min-h-0 flex-col rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
        >
          {selectedSource ? <SelectedSourcePanel source={selectedSource} /> : null}
        </section>
      </div>
    </div>
  );
}

function SelectedSourcePanel({ source }: { source: SourceBundleItem }) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">
              {source.title}
            </h3>
            <span className="rounded-full border border-[var(--source)]/25 bg-[var(--source)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--source)]">
              {source.type === 'chat' ? 'Chat source' : 'Document source'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {source.description ?? 'Source evidence for schema and YOps review.'}
          </p>
        </div>
        <span className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
          {formatSourceReference(source)}
        </span>
      </header>

      {source.type === 'chat' ? (
        <SourceConversationPreview source={source} />
      ) : (
        <SourceDocumentPreview source={source} />
      )}
    </>
  );
}

function SourceConversationPreview({ source }: { source: SourceBundleItem }) {
  const turns = source.previewTurns?.length ? source.previewTurns : fallbackConversation(source);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        aria-label="Source conversation"
        className="chat-scrollbar min-h-0 flex-1 overflow-auto bg-[var(--chat-panel)] px-4 py-3"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {turns.map((turn, index) => (
            <SourceTurnBubble index={index + 1} key={turn.id} turn={turn} />
          ))}
        </div>
      </section>
      <div className="border-t border-[var(--stroke-divider)] bg-[var(--chat-panel)] px-4 py-3">
        <div className="mx-auto max-w-3xl rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-tertiary)]">
          Ask the model, paste source text, or continue the selected conversation...
        </div>
      </div>
    </div>
  );
}

function SourceTurnBubble({ index, turn }: { index: number; turn: SourceConversationTurn }) {
  const isUser = turn.role === 'user';

  return (
    <article className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && <SourceAvatar label="AI" tone="assistant" />}
      <div
        className={cn(
          'max-w-[min(680px,85%)] rounded-md border px-3 py-2 text-sm leading-6',
          isUser
            ? 'border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation)]/10 text-[var(--text-primary)]'
            : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]'
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <span>{turn.author}</span>
          <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            turn {index}
          </span>
        </div>
        <p>{turn.content}</p>
      </div>
      {isUser && <SourceAvatar label="YX" tone="user" />}
    </article>
  );
}

function SourceAvatar({ label, tone }: { label: string; tone: 'assistant' | 'user' }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        tone === 'assistant'
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
          : 'bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]'
      )}
    >
      {label}
    </span>
  );
}

function SourceDocumentPreview({ source }: { source: SourceBundleItem }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)] p-4">
      <pre className="min-h-full whitespace-pre-wrap rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 font-mono text-sm leading-6 text-[var(--text-secondary)]">
        {source.previewText ?? `${source.title}\n\nNo document preview available.`}
      </pre>
    </div>
  );
}

function fallbackConversation(source: SourceBundleItem): SourceConversationTurn[] {
  return [
    {
      id: `${source.id}_user`,
      role: 'user',
      author: 'YX',
      content: `Use ${source.title} as source evidence before schema review.`,
    },
    {
      id: `${source.id}_assistant`,
      role: 'assistant',
      author: 'Assistant',
      content: 'Captured as source context for YSchema and YOps review.',
    },
  ];
}

function formatSourceReference(source: SourceBundleItem): string {
  if (source.conversationId) return source.conversationId;
  if (source.fileName) return source.fileName;
  if (source.runId) return source.runId;
  if (source.format) return source.format;
  return 'Source evidence';
}
