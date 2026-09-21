import { frameData, splitSseFrames } from './chat';
import { API_V1, handleResponse, injectAuthHeaders } from './core';
export interface WorkspaceAssistantContext {
  workspaceId: string;
  workspaceRevision: number;
  sourceMaterialIds: string[];
  selectedActionId?: string;
  selectedNodeId?: string;
  allowProposal?: boolean;
  posture?: 'source_only' | 'guided' | 'recommend';
  onCandidate?: (transitionId: string) => void;
}
export type WorkspaceAssistantEvent = {
  type: 'context' | 'capabilities' | 'text' | 'operation' | 'done' | 'error';
  content?: string;
  turnHash?: string;
  message?: string;
  operationId?: string;
  status?: string;
  result?: { status?: string; transitionId?: string };
  disclosure?: { partial: boolean };
  reason?: string;
};
export async function* streamWorkspaceAssistant(
  projectId: string,
  context: WorkspaceAssistantContext,
  turn: { conversationId: string; userTurnHash: string },
  options: { signal: AbortSignal; provider?: string; model?: string }
): AsyncGenerator<WorkspaceAssistantEvent> {
  const headers = await injectAuthHeaders(new Headers({ 'Content-Type': 'application/json' }));
  const res = await fetch(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(context.workspaceId)}/source-chat/assistant/stream`,
    {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        conversation_id: turn.conversationId,
        user_turn_hash: turn.userTurnHash,
        if_revision: context.workspaceRevision,
        source_material_ids: context.sourceMaterialIds,
        selected_action_id: context.selectedActionId,
        selected_node_id: context.selectedNodeId,
        allow_proposal: context.allowProposal ?? false,
        posture: context.posture ?? 'source_only',
        provider: options.provider,
        model: options.model,
      }),
    }
  );
  if (!res.ok) {
    await handleResponse(res);
    throw new Error('Assistant request failed');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No Assistant stream');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const parts = splitSseFrames(buffer, done);
      buffer = parts.remaining;
      for (const frame of parts.frames) {
        const data = frameData(frame);
        if (data) yield JSON.parse(data) as WorkspaceAssistantEvent;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
export async function recoverWorkspaceAssistantOperation(
  projectId: string,
  workspaceId: string,
  operationId: string
) {
  const res = await fetch(
    `${API_V1}/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/source-chat/assistant/operations/${encodeURIComponent(operationId)}`,
    { headers: await injectAuthHeaders(new Headers()) }
  );
  return handleResponse<{ status: 'candidate' | 'unknown'; transitionId?: string }>(res);
}
