'use client';

import type { Node } from '@xyflow/react';
import { Check, Clock, GitCommit, Link2, Settings, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
} from '@/types/nodes';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import type { NodeQuickAction } from './NodeModal';
import { MemoryContextSidebar } from './shared';

export interface ConversationViewProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  isStagingUnit: boolean;
  quickActions: NodeQuickAction[] | undefined;
  onSaveConstraints: ((constraints: ConversationConstraints) => void) | undefined;
  effectiveConstraints:
    | {
        clauses: ConversationConstraints['clauses'];
        must_have: string[];
        mustnt_have: string[];
      }
    | undefined;
  onUpdateConstraintOverrides: ((overrides: Partial<DraftConstraintOverrides>) => void) | undefined;
  isConversationLocked: boolean | undefined;
  onShowCommitConfig: () => void;
}

export function ConversationView({
  node,
  onClose,
  onUpdate,
  projectId,
  isStagingUnit,
  quickActions,
  onShowCommitConfig,
}: ConversationViewProps) {
  const { t } = useTerminology();
  const router = useRouter();
  const data = node.data;

  // Get projectId from route params for sidebar links
  const params = useParams();
  const routeProjectId = params?.projectId as string | undefined;

  // Derive the addCommitAction from quickActions
  const addCommitAction = useMemo(
    () => quickActions?.find((a) => a.key === 'add-commit'),
    [quickActions]
  );

  // ========== Layout state ==========
  const [detailsOpen, setDetailsOpen] = useState(false);
  const createdLabel = useMemo(() => {
    const createdAt = new Date(data.timestamp);
    if (Number.isNaN(createdAt.getTime())) {
      return data.timestamp;
    }
    return createdAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [data.timestamp]);

  // ========== Render ==========
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-modal-title"
    >
      <div
        className={cn(
          'relative flex flex-col w-screen h-screen overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="node-modal-title"
              className="text-[0.95rem] font-semibold text-[var(--text-primary)]"
            >
              {isStagingUnit ? 'Unit (Staging)' : 'Unit'}: {data.title || 'Untitled'}
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{data.entryId}</span>
            {isStagingUnit && (
              <Badge
                variant="outline"
                className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider border-dashed border-[var(--accent-pending)]/40 bg-[var(--accent-pending-soft)]"
              >
                staging
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDetailsOpen((open) => !open)}
              title="Unit details"
              aria-pressed={detailsOpen}
              className={cn(
                'h-9 w-9',
                detailsOpen &&
                  'border-[var(--stroke-strong)] bg-[var(--hover-bg)] text-[var(--text-primary)]'
              )}
            >
              <Settings size={18} />
            </Button>
            {/* For staging units: show Commit button to enter commit config view */}
            {isStagingUnit && (
              <Button
                onClick={() => {
                  if (data.conversationId) {
                    router.push(`/chat/${encodeURIComponent(data.conversationId)}`);
                    onClose();
                    return;
                  }
                  onShowCommitConfig();
                }}
                title={t('configure_and_commit')}
                className="gap-1.5"
              >
                <Check size={16} />
                <span>{t('commitAction')}</span>
              </Button>
            )}
            {/* For committed units: show Create Unit button */}
            {addCommitAction && !isStagingUnit && (
              <Button
                onClick={() => {
                  addCommitAction.onClick();
                  onClose();
                }}
                disabled={addCommitAction.disabled}
                title="Create a new unit from this one"
                className="gap-1.5"
              >
                <GitCommit size={16} />
                <span>Create Unit</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={20} />
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* ChatWorkspace replaces ConversationWorkspace */}
          {(() => {
            // Resolve conversation ID: use real source if conversationId is orphan
            let resolvedConvId = data?.conversationId || 'new';
            if (resolvedConvId.startsWith('orphan-') && data?.sources?.length) {
              const convSource = data.sources.find((s) => s.type === 'conversation');
              if (convSource?.id && !convSource.id.startsWith('orphan-')) {
                resolvedConvId = convSource.id;
              }
            }

            // Only show fallback if truly no conversation available
            if (resolvedConvId.startsWith('orphan-')) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                  <GitCommit className="h-10 w-10 text-[var(--text-tertiary)] mb-3" />
                  <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">
                    No linked conversation
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] max-w-[320px] leading-relaxed">
                    This commit was created without a conversation source. Click{' '}
                    <strong>Details</strong> on the commit card to view its content.
                  </p>
                </div>
              );
            }

            return (
              <ChatWorkspace
                conversationId={resolvedConvId}
                projectId={projectId}
                className="flex-1"
                inheritFromCommitHash={data?.inheritFromCommitHash}
                onInheritComplete={() => {
                  onUpdate({ inheritFromCommitHash: undefined });
                }}
                onConversationCreated={(convId) => {
                  onUpdate({ conversationId: convId, sourceConversationId: convId });
                  if (node?.id && node.id !== convId) {
                    useCanvasStore.getState().updateNodeId(node.id, convId);
                  }
                }}
              />
            );
          })()}
        </div>

        {detailsOpen && (
          <aside
            aria-label="Unit details"
            className="absolute top-14 right-0 bottom-0 z-20 flex w-[min(360px,calc(100vw-24px))] flex-col border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-[var(--fx-shadow-lg)]"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Details</h3>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  Metadata, audit info, and memory context.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close details"
                className="h-8 w-8 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <section className="mb-5">
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Metadata
                </h4>
                <div className="mb-[var(--space-group)]">
                  <label
                    htmlFor="conversation-title"
                    className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Title
                  </label>
                  <Input
                    id="conversation-title"
                    type="text"
                    value={data.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                  />
                </div>
                <div className="mb-[var(--space-group)]">
                  <label
                    htmlFor="conversation-tags"
                    className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Tags
                  </label>
                  <Input
                    id="conversation-tags"
                    type="text"
                    value={data.tags.join(', ')}
                    onChange={(e) =>
                      onUpdate({
                        tags: e.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="tag1, tag2, ..."
                  />
                </div>
              </section>

              <div className="my-4 h-px bg-[var(--stroke-divider)]" />

              <section className="mb-5">
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Info
                </h4>
                <div className="mb-[var(--space-item)] flex items-start gap-2 text-[0.85rem] text-[var(--text-secondary)]">
                  <Clock size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                  <span>Created: {createdLabel}</span>
                </div>
                <div className="mb-[var(--space-item)] flex items-start gap-2 text-[0.85rem] text-[var(--text-secondary)]">
                  <Link2 size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                  <span>Upstream: {data.baselineSummary ? 'Connected' : 'None (root)'}</span>
                </div>
              </section>

              <MemoryContextSidebar
                projectId={routeProjectId || projectId || undefined}
                conversationId={data?.conversationId || data?.sourceConversationId}
                branch={
                  data.branchName ||
                  (data.pendingBranch === 'main' ? 'main' : data.pendingBranchName) ||
                  'main'
                }
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
