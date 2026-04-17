export type SlotTagKind = 'inherited' | 'new' | 'modified' | 'removed';

export interface SlotTag {
  kind: SlotTagKind;
  label: string;
}

const MAX_LABEL = 20;

export function deriveSlotTag(input: {
  diffType: 'added' | 'modified' | 'removed' | null;
  parentMessage: string | null;
}): SlotTag {
  const { diffType, parentMessage } = input;
  if (diffType === 'added') return { kind: 'new', label: 'New' };
  if (diffType === 'modified') return { kind: 'modified', label: 'Changed' };
  if (diffType === 'removed') return { kind: 'removed', label: 'Removed' };
  if (!parentMessage) return { kind: 'new', label: 'New' };
  const truncated =
    parentMessage.length > MAX_LABEL
      ? `${parentMessage.slice(0, MAX_LABEL - 1)}…`
      : parentMessage;
  return { kind: 'inherited', label: `← ${truncated}` };
}
