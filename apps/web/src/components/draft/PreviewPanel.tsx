'use client';

/**
 * PreviewPanel - Bottom panel showing LLM-generated preview output
 *
 * 5 states (RFC §6.4): idle, loading, ready, stale, error
 * Follows VS Code terminal panel pattern.
 */

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonText } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { PreviewTypeSelector } from './PreviewTypeSelector';

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PreviewPanel() {
  const previewOutput = useDraftWorkspaceStore((s) => s.previewOutput);
  const previewStatus = useDraftWorkspaceStore((s) => s.previewStatus);
  const previewError = useDraftWorkspaceStore((s) => s.previewError);
  const previewGeneratedAt = useDraftWorkspaceStore((s) => s.previewGeneratedAt);
  const previewTokenCount = useDraftWorkspaceStore((s) => s.previewTokenCount);
  const previewModelUsed = useDraftWorkspaceStore((s) => s.previewModelUsed);
  const generatePreview = useDraftWorkspaceStore((s) => s.generatePreview);
  const previewIncludedCount = useDraftWorkspaceStore((s) => s.previewIncludedCount);
  const draft = useDraftWorkspaceStore((s) => s.draft);

  const includedCount = draft?.sentences.filter((s) => s.included).length ?? 0;
  const hasSentences = includedCount > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 bg-[var(--surface-card)]">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Preview
        </span>
        <PreviewTypeSelector />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={generatePreview}
          disabled={previewStatus === 'loading' || !hasSentences}
        >
          {previewStatus === 'loading' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {previewStatus === 'stale' ? 'Regenerate' : 'Generate Preview'}
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* idle */}
        {previewStatus === 'idle' && (
          <p className="text-sm text-muted-foreground italic">
            Add sentences and click Generate Preview to see output
          </p>
        )}

        {/* loading */}
        {previewStatus === 'loading' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating preview...
            </div>
            <SkeletonText lines={4} />
          </div>
        )}

        {/* ready */}
        {previewStatus === 'ready' && previewOutput && (
          <div className="space-y-2">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {previewOutput}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{previewOutput.length} chars</span>
              {previewTokenCount != null && (
                <>
                  <span className="text-muted-foreground/50">&middot;</span>
                  <span>{previewTokenCount} tokens</span>
                </>
              )}
              {previewGeneratedAt && (
                <>
                  <span className="text-muted-foreground/50">&middot;</span>
                  <span>Generated {formatTimeAgo(previewGeneratedAt)}</span>
                </>
              )}
              {previewModelUsed && (
                <>
                  <span className="text-muted-foreground/50">&middot;</span>
                  <span>{previewModelUsed}</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 italic">
              Preview uses a fast model. Final output quality may be higher.
            </p>
          </div>
        )}

        {/* stale */}
        {previewStatus === 'stale' && previewOutput && (
          <div className="space-y-2">
            <div
              className={cn(
                'opacity-40 select-none pointer-events-none',
                'text-sm text-foreground whitespace-pre-wrap leading-relaxed'
              )}
            >
              {previewOutput}
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {previewIncludedCount != null && includedCount !== previewIncludedCount
                ? `${Math.abs(includedCount - previewIncludedCount)} sentence${Math.abs(includedCount - previewIncludedCount) !== 1 ? 's' : ''} ${includedCount > previewIncludedCount ? 'added' : 'removed'} since last preview. `
                : 'Sentences changed since last preview. '}
              <button
                type="button"
                onClick={generatePreview}
                className="underline hover:no-underline"
              >
                Regenerate
              </button>
            </p>
          </div>
        )}

        {/* error */}
        {previewStatus === 'error' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--status-error)]">
              <AlertCircle className="h-4 w-4" />
              {previewError || 'Preview generation failed'}
            </div>
            <Button variant="outline" size="sm" onClick={generatePreview} className="text-xs">
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
