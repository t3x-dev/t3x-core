'use client';

import type { Node } from '@xyflow/react';
import { Check, Clock, GitCommit, Link2, Settings, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ConversationWorkspace } from '@/components/conversation/ConversationWorkspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConversationChat } from '@/hooks/useConversationChat';
import { useTerminology } from '@/hooks/useTerminology';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
} from '@/types/nodes';
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
  onSaveConstraints: _onSaveConstraints,
  effectiveConstraints: _effectiveConstraints,
  onUpdateConstraintOverrides: _onUpdateConstraintOverrides,
  isConversationLocked: _isConversationLocked,
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

  // ========== Chat hook ==========
  const chat = useConversationChat({
    projectId,
    conversationId: data?.conversationId,
    title: data?.title,
    onConversationCreated: (convId) => {
      onUpdate({ conversationId: convId, sourceConversationId: convId });
      if (node?.id && node.id !== convId) {
        useCanvasStore.getState().updateNodeId(node.id, convId);
      }
    },
  });

  // Keep a ref to messages for the commit config flow
  const chatMessagesRef = useRef(chat.messages);
  chatMessagesRef.current = chat.messages;

  // ========== Metadata sidebar ==========
  const metadataSidebar = showSettings ? (
    <div className="p-5">
      <div className="mb-5">
        <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
          Metadata
        </h4>
        <div className="mb-[var(--space-group)]">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Title
          </label>
          <Input
            type="text"
            value={data.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        <div className="mb-[var(--space-group)]">
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Tags
          </label>
          <Input
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
  ) : null;

  // ========== Render ==========
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
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
                className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider border-dashed border-slate-400/40 dark:border-slate-500/40 bg-slate-500/15"
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
                onClick={() => {
                  // Save chat messages as baselineSummary so PendingCommitView has source data
                  // even if turns weren't persisted to the backend
                  const msgs = chatMessagesRef.current;
                  if (msgs.length > 0) {
                    const fullText = msgs.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
                    onUpdate({ baselineSummary: fullText });
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

        {/* Replace the old flex layout with ConversationWorkspace */}
        <ConversationWorkspace
          projectId={projectId}
          conversationId={data?.conversationId}
          leftSidebar={metadataSidebar}
          {...chat}
        />
      </div>
    </div>
  );
}
