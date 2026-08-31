'use client';

import type { Node } from '@xyflow/react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
} from '@/types/nodes';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';
import { ConversationView } from './ConversationView';

export type NodeQuickAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

interface NodeModalProps {
  node?: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  quickActions?: NodeQuickAction[];
  onSaveConstraints?: (constraints: ConversationConstraints) => void;
  effectiveConstraints?: {
    clauses: ConversationConstraints['clauses'];
    must_have: string[];
    mustnt_have: string[];
  };
  onUpdateConstraintOverrides?: (overrides: Partial<DraftConstraintOverrides>) => void;
  isConversationLocked?: boolean;
  viewMode?: 'conversation' | 'commit';
}

export function NodeModal({
  node,
  onClose,
  onUpdate,
  quickActions,
  onSaveConstraints,
  effectiveConstraints,
  onUpdateConstraintOverrides,
  isConversationLocked,
  viewMode = 'commit',
}: NodeModalProps) {
  const router = useRouter();
  const projectId = useCanvasStore((state) => state.projectId);

  if (!node) return null;

  const data = node.data;
  if (!data) return null;

  const isUnit = data.kind === 'unit';
  const isStagingUnit = isUnit && data.commitStatus === 'staging';
  const isCommittedUnit = isUnit && data.commitStatus === 'committed';

  const isConversation = isStagingUnit || (isUnit && viewMode === 'conversation');

  if (isConversation) {
    return (
      <ConversationView
        node={node}
        onClose={onClose}
        onUpdate={onUpdate}
        projectId={projectId || ''}
        isStagingUnit={isStagingUnit}
        quickActions={quickActions}
        onSaveConstraints={onSaveConstraints}
        effectiveConstraints={effectiveConstraints}
        onUpdateConstraintOverrides={onUpdateConstraintOverrides}
        isConversationLocked={isConversationLocked}
        onOpenWorkspace={() => {
          router.push(buildWorkspaceHandoffPath(projectId, data));
          onClose();
        }}
      />
    );
  }

  // Committed versions are inspected directly on the Canvas. The legacy
  // commit-mode modal is intentionally unavailable, while conversation mode
  // remains usable when the node has source discussion.
  if (isCommittedUnit) return null;

  // Fallback for unknown node types
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-modal-title"
    >
      <div
        className={cn(
          'flex flex-col w-[80vw] max-w-[800px] max-h-[60vh] rounded-2xl overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="node-modal-title"
              className="text-[0.95rem] font-semibold text-[var(--text-primary)]"
            >
              {data?.title || 'Node'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="flex-1 p-6 flex items-center justify-center text-[var(--text-tertiary)]">
          <p>Unknown node type</p>
        </div>
      </div>
    </div>
  );
}

export function buildWorkspaceHandoffPath(projectId: string | null, data: CanvasNodeData): string {
  if (!projectId) return '/';
  const branch =
    data.pendingBranch === 'branch' ? data.pendingBranchName?.trim() || 'main' : 'main';
  const params = new URLSearchParams({ branch, tab: 'workspaces' });
  const conversationId = data.sourceConversationId || data.conversationId;
  if (conversationId) params.set('sourceConversation', conversationId);
  return `/project/${encodeURIComponent(projectId)}?${params.toString()}`;
}
