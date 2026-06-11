'use client';

export const PROJECT_DELETED_EVENT = 't3x:project-deleted';
export const CONVERSATION_DELETED_EVENT = 't3x:conversation-deleted';

export interface ProjectDeletedDetail {
  projectId: string;
}

export interface ConversationDeletedDetail {
  projectId: string;
  conversationId: string;
}

export function dispatchProjectDeleted(detail: ProjectDeletedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProjectDeletedDetail>(PROJECT_DELETED_EVENT, { detail }));
}

export function dispatchConversationDeleted(detail: ConversationDeletedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ConversationDeletedDetail>(CONVERSATION_DELETED_EVENT, { detail })
  );
}
