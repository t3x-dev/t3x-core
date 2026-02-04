'use client';

/**
 * MergePreview - Shows the final merged result before commit
 *
 * Collapsible panel at the bottom showing what the merge
 * commit will contain.
 */

import { ChevronDown, ChevronUp, Edit3, FileText, Layers } from 'lucide-react';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

interface MergePreviewProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MergePreview({ expanded, onToggle }: MergePreviewProps) {
  const { getPreviewSentences, prepared, getResolutionStats } = useMergeWorkspaceStore();
  const sentences = getPreviewSentences();

  // Count stats including extended resolutions
  const identicalCount = prepared?.identical.length || 0;
  const stats = getResolutionStats();

  const keptSourceCount = prepared?.onlyInSource.filter((c) => c.keep).length || 0;
  const keptTargetCount = prepared?.onlyInTarget.filter((c) => c.keep).length || 0;

  return (
    <div className="border-t bg-muted/30">
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Merge Preview</span>
          <span className="text-sm text-muted-foreground">
            {sentences.length} sentences will be in final commit
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">{identicalCount} identical</span>
            <span className="text-yellow-600 dark:text-yellow-400">{stats.standard} resolved</span>
            {stats.both > 0 && (
              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                <Layers className="h-3 w-3" />
                {stats.both} both
              </span>
            )}
            {stats.edit > 0 && (
              <span className="text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
                <Edit3 className="h-3 w-3" />
                {stats.edit} edited
              </span>
            )}
            <span className="text-blue-600 dark:text-blue-400">
              {keptSourceCount + keptTargetCount} unique kept
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Content - Collapsible */}
      {expanded && (
        <div className="px-6 pb-4 max-h-64 overflow-auto">
          <div className="bg-background rounded-lg border p-4">
            {sentences.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No sentences selected for merge
              </p>
            ) : (
              <div className="space-y-2">
                {sentences.map((sentence, idx) => {
                  // Check if this is a merged/edited sentence
                  const isMerged = sentence.id.startsWith('merged-');
                  return (
                    <div key={sentence.id || idx} className="flex items-start gap-3 text-sm">
                      <span className="shrink-0 w-6 text-muted-foreground text-right">
                        {idx + 1}.
                      </span>
                      <span className="flex-1">
                        {isMerged && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-purple-600 dark:text-purple-400 mr-1.5">
                            <Edit3 className="h-3 w-3" />
                            edited:
                          </span>
                        )}
                        {sentence.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
