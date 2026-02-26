'use client';

/**
 * InstructionEditor - Free-form text instructions for generation guidance
 */

import { Textarea } from '@/components/ui/textarea';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export function InstructionEditor() {
  const { draft, updateInstructions } = useDraftWorkspaceStore();

  if (!draft) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Instructions
        <span className="ml-1.5 text-muted-foreground font-normal">(optional)</span>
      </h2>
      <Textarea
        value={draft.instructions || ''}
        onChange={(e) => updateInstructions(e.target.value)}
        placeholder="Add instructions for generation (e.g., tone, style, format)..."
        rows={3}
        className="resize-y"
      />
    </section>
  );
}
