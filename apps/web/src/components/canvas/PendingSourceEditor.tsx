'use client';

import { useCallback } from 'react';
import type { AnchorCandidate, ConfirmedAnchor, SourceTextBlock } from '@/types/nodes';
import { SourceBox } from './SelectableTextBlock';

// Container for multiple text blocks with Box UI
interface PendingSourceEditorProps {
  blocks: SourceTextBlock[];
  onChange: (blocks: SourceTextBlock[]) => void;
  readOnly?: boolean;
  /** Anchor candidates from Ring 1 (global positions) */
  anchorCandidates?: AnchorCandidate[];
  /** Confirmed anchors (user-confirmed) */
  confirmedAnchors?: ConfirmedAnchor[];
  /** Callback when user confirms/changes an anchor */
  onAnchorChange?: (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => void;
  /** Confidence threshold for showing anchor candidates (0-1) */
  anchorThreshold?: number;
}

export function PendingSourceEditor({
  blocks,
  onChange,
  readOnly = false,
  anchorCandidates,
  confirmedAnchors,
  onAnchorChange,
  anchorThreshold,
}: PendingSourceEditorProps) {
  const handleBlockChange = useCallback(
    (updatedBlock: SourceTextBlock) => {
      const newBlocks = blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
      onChange(newBlocks);
    },
    [blocks, onChange]
  );

  // Default to expanded if there's only one block
  const defaultExpanded = blocks.length === 1;

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <SourceBox
          key={block.id}
          block={block}
          onChange={handleBlockChange}
          readOnly={readOnly}
          defaultExpanded={defaultExpanded}
          anchorCandidates={anchorCandidates}
          confirmedAnchors={confirmedAnchors}
          onAnchorChange={onAnchorChange}
          anchorThreshold={anchorThreshold}
        />
      ))}
    </div>
  );
}
