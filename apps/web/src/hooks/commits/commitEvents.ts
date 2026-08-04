'use client';

export const COMMIT_CREATED_EVENT = 't3x:commit-created';
export const COMMITS_BROADCAST_CHANNEL = 't3x-commits';

export interface CommitCreatedDetail {
  type: 'commit.created';
  projectId: string;
  branch?: string;
  conversationId?: string | null;
  conversationIds?: string[];
  payload: {
    hash: string;
    branch?: string;
  };
}

export interface CommitCreatedInput {
  projectId: string;
  hash: string;
  branch?: string | null;
  conversationId?: string | null;
  conversationIds?: string[];
}

export function buildCommitCreatedDetail(input: CommitCreatedInput): CommitCreatedDetail {
  const branch = input.branch || undefined;
  const detail: CommitCreatedDetail = {
    type: 'commit.created',
    projectId: input.projectId,
    ...(branch ? { branch } : {}),
    payload: {
      hash: input.hash,
      ...(branch ? { branch } : {}),
    },
  };

  if (input.conversationId !== undefined) {
    detail.conversationId = input.conversationId;
  }
  if (input.conversationIds !== undefined) {
    detail.conversationIds = input.conversationIds;
  }

  return detail;
}

export function isCommitCreatedForProject(
  payload: unknown,
  projectId: string
): payload is CommitCreatedDetail {
  if (!payload || typeof payload !== 'object') return false;
  const detail = payload as Partial<CommitCreatedDetail>;
  return detail.type === 'commit.created' && detail.projectId === projectId;
}

export function dispatchCommitCreated(input: CommitCreatedInput): void {
  const detail = buildCommitCreatedDetail(input);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COMMIT_CREATED_EVENT, { detail }));
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(COMMITS_BROADCAST_CHANNEL);
      channel.postMessage(detail);
      channel.close();
    } catch {
      // BroadcastChannel is optional; the same-window event keeps local views in sync.
    }
  }
}
