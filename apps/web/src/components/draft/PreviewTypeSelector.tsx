'use client';

/**
 * PreviewTypeSelector - Dropdown for selecting preview output format
 *
 * Reuses LEAF_TYPES from CanvasNodes for consistent type labels.
 */

import { LEAF_TYPES } from '@/components/canvas/CanvasNodes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export function PreviewTypeSelector() {
  const draft = useDraftWorkspaceStore((s) => s.draft);
  const updatePreviewType = useDraftWorkspaceStore((s) => s.updatePreviewType);

  const currentType = draft?.preview_type || 'tweet';

  return (
    <Select value={currentType} onValueChange={updatePreviewType}>
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAF_TYPES.map((lt) => (
          <SelectItem key={lt.type} value={lt.type} className="text-xs">
            {lt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
