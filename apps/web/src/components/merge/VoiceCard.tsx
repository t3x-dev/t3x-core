import type { MergeVoiceSection } from '@/domain/merge/voices';
import { cn } from '@/utils/cn';

const VOICE_TONE: Record<
  MergeVoiceSection['kind'],
  { rail: string; badge: string; quote: string }
> = {
  agreements: {
    rail: 'bg-[var(--diff-identical-accent)]',
    badge: 'border-[var(--diff-identical-accent)]/30 text-[var(--text-secondary)]',
    quote: 'text-[var(--text-secondary)]',
  },
  unique_to_source: {
    rail: 'bg-[var(--merge-src-accent)]',
    badge: 'border-[var(--merge-src-accent)]/35 text-[var(--merge-src-accent)]',
    quote: 'text-[var(--merge-src-accent)]',
  },
  unique_to_target: {
    rail: 'bg-[var(--merge-tgt-accent)]',
    badge: 'border-[var(--merge-tgt-accent)]/35 text-[var(--merge-tgt-accent)]',
    quote: 'text-[var(--merge-tgt-accent)]',
  },
  tension: {
    rail: 'bg-[var(--merge-conflict-accent)]',
    badge: 'border-[var(--merge-conflict-accent)]/40 text-[var(--merge-conflict-accent)]',
    quote: 'text-[var(--text-primary)]',
  },
};

export function VoiceCard({ voice }: { voice: MergeVoiceSection }) {
  const tone = VOICE_TONE[voice.kind];

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
      data-testid={`merge-voice-${voice.kind}`}
    >
      <div className={cn('absolute inset-y-0 left-0 w-[3px]', tone.rail)} />
      <div className="space-y-2 px-3 py-2 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h5 className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
              {voice.title}
            </h5>
            <p className="mt-0.5 text-[10px] leading-4 text-[var(--text-tertiary)]">
              {voice.description}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded border bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[10px]',
              tone.badge
            )}
          >
            {voice.count}
          </span>
        </div>
        {voice.examples.length > 0 && (
          <div className="space-y-1.5">
            {voice.examples.map((example) => (
              <div key={example.path} className="min-w-0">
                <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                  {example.path}
                </div>
                <div className="text-[10px] leading-4 text-[var(--text-secondary)]">
                  {example.reason}
                </div>
                {(example.sourceQuote || example.targetQuote) && (
                  <div className="mt-1 space-y-1 rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-2 py-1 font-mono text-[10px] leading-4">
                    {example.sourceQuote && (
                      <div className={cn('truncate', tone.quote)}>{example.sourceQuote}</div>
                    )}
                    {example.targetQuote && (
                      <div className={cn('truncate', tone.quote)}>{example.targetQuote}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
