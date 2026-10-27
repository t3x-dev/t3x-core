import type {
  WorkspaceProposalGenerationGroup,
  WorkspaceProposalGenerationView,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';

export function composeConversationTranscript(
  messages: Array<{ role: string; content: string }>,
  pendingInput?: string
): string {
  const lines = messages
    .map((message) => {
      const content = message.content.trim();
      if (!content) return '';
      return `${message.role === 'user' ? 'You' : 'Assistant'}: ${content}`;
    })
    .filter(Boolean);
  const pending = pendingInput?.trim();
  if (pending) lines.push(`You: ${pending}`);
  return lines.join('\n\n');
}

export function yopsDraftFromProposalGeneration(
  view: Pick<WorkspaceProposalGenerationView, 'generation'>
): WorkspaceYOpsDraftOperation[] {
  const groups = view.generation?.groups ?? [];
  return groups.flatMap((group, groupIndex) => operationsFromGenerationGroup(group, groupIndex));
}

function operationsFromGenerationGroup(
  group: WorkspaceProposalGenerationGroup,
  groupIndex: number
): WorkspaceYOpsDraftOperation[] {
  if (group.values.length > 0) {
    return group.values.flatMap((value, index) => {
      if (value.after.availability !== 'available') return [];
      const before =
        value.before.availability === 'available' ? value.before.value : 'Current value';
      return [
        {
          id: `op_${group.id}_${index}`,
          op: 'set',
          path: normalizeDraftPath(value.path),
          summary: group.reason || `Set ${value.path}`,
          beforeValue: before as WorkspaceYOpsValue,
          afterValue: value.after.value as WorkspaceYOpsValue,
          reason: group.reason,
        },
      ];
    });
  }

  return group.operations.flatMap((operation, index) => {
    const parsed = parseGeneratedOperation(operation);
    if (!parsed) return [];
    return [
      {
        id: `op_${group.id || groupIndex}_${index}`,
        op: parsed.op,
        path: normalizeDraftPath(parsed.path),
        summary: group.reason || `Set ${parsed.path}`,
        afterValue: parsed.value as WorkspaceYOpsValue,
        reason: group.reason,
      },
    ];
  });
}

function parseGeneratedOperation(
  operation: unknown
): { op: string; path: string; value: unknown } | null {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return null;
  const record = operation as Record<string, { path?: unknown; value?: unknown }>;
  for (const op of ['set', 'add', 'define'] as const) {
    const payload = record[op];
    if (payload && typeof payload.path === 'string' && payload.path.trim()) {
      return { op, path: payload.path, value: payload.value };
    }
  }
  return null;
}

function normalizeDraftPath(path: string): string {
  return path.replace(/^\/+/, '');
}
