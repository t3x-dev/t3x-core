'use client';

import {
  ArrowRight,
  FileText,
  GitCommitHorizontal,
  Leaf as LeafIcon,
  MessageSquare,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChatSidebarToggleButton } from '@/components/chat/ChatSidebarToggleButton';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { fetchProject } from '@/queries/project';
import { useChatStore } from '@/store/chatStore';
import { cn } from '@/utils/cn';

function isNotFoundError(error: string | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes('404') || normalized.includes('not found');
}

export default function ChatProjectLeafIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { loadCommits } = useCommitsList();
  const { leaves, loading, error, refresh } = useProjectLeaves(projectId, true);
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(true);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const commitLoadSeq = useRef(0);
  const projectLoadSeq = useRef(0);

  const loadProjectCommits = useCallback(
    async (options?: { silent?: boolean }) => {
      const seq = commitLoadSeq.current + 1;
      commitLoadSeq.current = seq;
      if (!options?.silent) setCommitsLoading(true);
      setCommitsError(null);

      try {
        const commits = await loadCommits(projectId, undefined, 1);
        if (commitLoadSeq.current !== seq) return;
        setCommitCount(commits.length);
      } catch (err) {
        if (commitLoadSeq.current !== seq) return;
        setCommitCount(null);
        setCommitsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (commitLoadSeq.current === seq && !options?.silent) setCommitsLoading(false);
      }
    },
    [loadCommits, projectId]
  );

  const loadProjectSummary = useCallback(
    async (options?: { silent?: boolean }) => {
      const seq = projectLoadSeq.current + 1;
      projectLoadSeq.current = seq;
      if (!options?.silent) setProjectLoading(true);
      setProjectError(null);

      try {
        const project = await fetchProject(projectId);
        if (projectLoadSeq.current !== seq) return;
        setConversationCount(project.conversations_count ?? 0);
      } catch (err) {
        if (projectLoadSeq.current !== seq) return;
        setConversationCount(null);
        setProjectError(err instanceof Error ? err.message : String(err));
      } finally {
        if (projectLoadSeq.current === seq && !options?.silent) setProjectLoading(false);
      }
    },
    [projectId]
  );

  const goToProjectChat = useCallback(() => {
    useChatStore.getState().setActiveConversation(null, projectId);
    router.push(`/chat/new?projectId=${encodeURIComponent(projectId)}`);
  }, [projectId, router]);

  useEffect(() => {
    setCommitsLoading(true);
    void loadProjectCommits();
  }, [loadProjectCommits]);

  useEffect(() => {
    setProjectLoading(true);
    void loadProjectSummary();
  }, [loadProjectSummary]);

  const projectNotFound =
    isNotFoundError(error) || isNotFoundError(commitsError) || isNotFoundError(projectError);

  if (loading || commitsLoading || projectLoading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading leaves..." />
      </div>
    );
  }

  if (projectNotFound) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-app)]">
        <LeafPageHeader leafCount={leaves.length} />
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <EmptyLeafState
            actionLabel="Go to Chats"
            description="This project does not exist or was deleted."
            icon={<MessageSquare className="h-5 w-5" />}
            onAction={() => router.push('/chat')}
            title="Project not found"
            tone="conversation"
          />
        </main>
      </div>
    );
  }

  if (error || commitsError || projectError) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={new Error(error ?? commitsError ?? projectError ?? 'Failed to load leaf data')}
          onRetry={() => {
            void refresh();
            void loadProjectCommits();
            void loadProjectSummary();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-app)]">
      <LeafPageHeader leafCount={leaves.length} />

      <main className="min-h-0 flex-1 overflow-y-auto p-5">
        {commitCount === 0 && (conversationCount ?? 0) === 0 ? (
          <EmptyLeafState
            actionLabel="Go to Chat"
            description="Start a chat in this project, then commit it before creating a leaf."
            icon={<MessageSquare className="h-5 w-5" />}
            onAction={goToProjectChat}
            title="No conversations yet"
            tone="conversation"
          />
        ) : commitCount === 0 ? (
          <EmptyLeafState
            actionLabel="Go to Chat"
            description="Commit a chat first, then create a leaf from Canvas."
            icon={<GitCommitHorizontal className="h-5 w-5" />}
            onAction={goToProjectChat}
            title="No commits yet"
            tone="commit"
          />
        ) : leaves.length === 0 ? (
          <EmptyLeafState
            actionLabel="Go to Canvas"
            description="Create a leaf from a committed canvas node."
            icon={<LeafIcon className="h-5 w-5" />}
            onAction={() => router.push(`/chat/project/${encodeURIComponent(projectId)}/canvas`)}
            title="No leaves yet"
            tone="leaf"
          />
        ) : (
          <div className="mx-auto grid w-full max-w-4xl gap-2">
            {leaves.map((leaf) => {
              const assertionCount = leaf.runner_assertions?.length ?? leaf.assertions?.length ?? 0;
              const passedCount =
                leaf.runner_assertions?.filter((assertion) => assertion.passed).length ??
                leaf.assertions?.filter((assertion) => assertion.passed).length ??
                0;
              const hasOutput = Boolean(leaf.output);

              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(
                        leaf.id
                      )}`
                    )
                  }
                  className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 py-3 text-left transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                      {leaf.title?.trim() || `${leaf.type} leaf`}
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                      <span>{leaf.type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{hasOutput ? 'generated' : 'draft'}</span>
                      {assertionCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {passedCount}/{assertionCount} assertions
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-semibold',
                      hasOutput
                        ? 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
                        : 'border-[var(--accent-pending)]/25 bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]'
                    )}
                  >
                    {hasOutput ? 'leaf' : 'draft'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function LeafPageHeader({ leafCount }: { leafCount: number }) {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)] px-4">
      <ChatSidebarToggleButton className="absolute left-2.5 top-2" />
      <div className="min-w-0 pl-[34px]">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">Leaf</h1>
          <p className="truncate text-[11px] text-[var(--text-tertiary)]">
            Project output artifacts
          </p>
        </div>
      </div>
      <span className="inline-flex h-7 items-center rounded-full border border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] px-2.5 text-[11px] font-medium text-[var(--accent-leaf)]">
        {leafCount} {leafCount === 1 ? 'leaf' : 'leaves'}
      </span>
    </header>
  );
}

function EmptyLeafState({
  actionLabel,
  description,
  icon,
  onAction,
  title,
  tone,
}: {
  actionLabel: string;
  description: string;
  icon: ReactNode;
  onAction: () => void;
  title: string;
  tone: 'commit' | 'conversation' | 'leaf';
}) {
  const toneClass =
    tone === 'leaf'
      ? 'border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
      : tone === 'commit'
        ? 'border-[var(--accent-commit)]/20 bg-[var(--status-info-muted)] text-[var(--accent-commit)]'
        : 'border-[var(--accent-conversation)]/20 bg-[var(--status-info-muted)] text-[var(--accent-conversation)]';

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm p-6 text-center">
        <div
          className={cn(
            'mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border',
            toneClass
          )}
        >
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{description}</p>
        <button
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent-conversation)] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--accent-conversation)_88%,black)]"
          onClick={onAction}
          type="button"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
