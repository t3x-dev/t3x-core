'use client';

import type { Node } from '@xyflow/react';
import { Check, Clock, GitCommit, Link2, Settings, X } from 'lucide-react';
import { useParams } from 'next/navigation';
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
  const [showSettings, setShowSettings] = useState(false);

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
          'flex flex-col w-screen h-screen overflow-hidden',
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
              onClick={() => setShowSettings(!showSettings)}
              title="Edit Meta"
              className="h-9 w-9"
            >
              <Settings size={18} />
            </Button>
            {/* For staging units: show Commit button to enter commit config view */}
            {isStagingUnit && (
              <Button
                onClick={() => onShowCommitConfig()}
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

        {/* Content: settings sidebar + chat */}
        <div className="flex flex-1 overflow-hidden">
          {/* Settings sidebar */}
          {showSettings && (
            <aside className="w-72 shrink-0 border-r border-[var(--stroke-divider)] overflow-y-auto">
              <div className="p-5">
                <div className="mb-5">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                    Metadata
                  </h4>
                  <div className="mb-[var(--space-group)]">
                    <label
                      htmlFor="conversation-title"
                      className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
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
                      className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
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
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="tag1, tag2, ..."
                    />
                  </div>
                </div>

                <div className="h-px bg-[var(--stroke-divider)] my-4" />

                <div className="mb-5">
                  <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                    Info
                  </h4>
                  <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                    <Clock size={14} className="text-[var(--text-tertiary)] shrink-0" />
                    <span>Created: {data.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                    <Link2 size={14} className="text-[var(--text-tertiary)] shrink-0" />
                    <span>Upstream: {data.baselineSummary ? 'Connected' : 'None (root)'}</span>
                  </div>
                </div>

                <div className="h-px bg-[var(--stroke-divider)] my-4" />

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
      </div>
    </div>
  );
}
