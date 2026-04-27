'use client';

import { Check, GitCommitHorizontal, LayoutGrid, MessageSquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCommitStore } from '@/store/commitStore';

interface CommittedBarProps {
  projectId?: string;
}

export function CommittedBar({ projectId }: CommittedBarProps) {
  const router = useRouter();
  const lastCommitHash = useCommitStore((s) => s.lastCommitHash);
  const commitBranch = useCommitStore((s) => s.commitBranch);

  const shortHash = lastCommitHash ? lastCommitHash.replace('sha256:', '').slice(0, 8) : '';

  return (
    <div className="border-t border-[var(--stroke-divider)] shrink-0 py-3">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-2xl border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-3.5">
          {/* Status row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--commit)] text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Committed</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              on {commitBranch || 'main'}
            </span>
            {shortHash && (
              <>
                <span className="text-[11px] text-[var(--text-tertiary)]">&middot;</span>
                <span className="inline-flex items-center gap-1 rounded bg-[var(--hover-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                  <GitCommitHorizontal className="h-2.5 w-2.5" />
                  {shortHash}
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (lastCommitHash) params.set('inheritFrom', lastCommitHash);
                if (projectId) params.set('projectId', projectId);
                const query = params.toString();
                router.push(query ? `/chat/new?${query}` : '/chat/new');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--stroke-default)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New Conversation
            </button>
            {projectId && (
              <button
                type="button"
                onClick={() => router.push(`/project/${projectId}`)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-commit)] px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                View Canvas
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
