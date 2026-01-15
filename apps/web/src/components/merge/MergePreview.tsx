'use client';

/**
 * MergePreview - Shows the final merged result before commit
 *
 * Collapsible panel at the bottom showing what the merge
 * commit will contain.
 */

import { ChevronUp, ChevronDown, FileText } from 'lucide-react';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';

interface MergePreviewProps {
  expanded: boolean;
  onToggle: () => void;
}

export function MergePreview({ expanded, onToggle }: MergePreviewProps) {
  const { getPreviewSentences, prepared } = useMergeWorkspaceStore();
  const sentences = getPreviewSentences();

  // Count stats
  const identicalCount = prepared?.identical.length || 0;
  const resolvedCount = prepared?.similarPairs.filter((p) => p.resolution).length || 0;
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
          <div className="text-xs text-muted-foreground space-x-3">
            <span className="text-green-600">{identicalCount} identical</span>
            <span className="text-yellow-600">{resolvedCount} resolved</span>
            <span className="text-blue-600">{keptSourceCount + keptTargetCount} unique kept</span>
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
                {sentences.map((sentence, idx) => (
                  <div
                    key={sentence.id || idx}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span className="shrink-0 w-6 text-muted-foreground text-right">
                      {idx + 1}.
                    </span>
                    <span className="flex-1">{sentence.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
