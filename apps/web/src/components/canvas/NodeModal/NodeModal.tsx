'use client';

import type { Node } from '@xyflow/react';
import { X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
} from '@/types/nodes';
import { CommittedCommitView } from './CommittedCommitView';
import { ConversationView } from './ConversationView';
import { PendingCommitView } from './PendingCommitView';

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
  onConvertDraft?: () => void;
  onBranchChange?: (branch: 'main' | 'branch') => void;
  onBranchNameChange?: (name: string) => void;
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
  onConvertDraft,
  onBranchChange,
  onBranchNameChange,
  quickActions,
  onSaveConstraints,
  effectiveConstraints,
  onUpdateConstraintOverrides,
  isConversationLocked,
  viewMode = 'commit',
}: NodeModalProps) {
  const params = useParams();
  const routeProjectId = params?.projectId as string | undefined;
  const projectId = useCanvasStore((state) => state.projectId);

  // For staging units: toggle between conversation view and commit config view
  const [showCommitConfig, setShowCommitConfig] = useState(false);

  if (!node) return null;

  const data = node.data;
  if (!data) return null;

  const isUnit = data.kind === 'unit';
  const isStagingUnit = isUnit && data.commitStatus === 'staging';
  const isCommittedUnit = isUnit && data.commitStatus === 'committed';

  const isConversation =
    (isStagingUnit && !showCommitConfig) || (isUnit && viewMode === 'conversation');
  const isPendingCommit = isStagingUnit && showCommitConfig && viewMode !== 'conversation';
  const isCommittedCommit = isCommittedUnit && viewMode !== 'conversation';

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
        onShowCommitConfig={() => setShowCommitConfig(true)}
      />
    );
  }

  if (isPendingCommit) {
    return (
      <PendingCommitView
        node={node}
        onClose={onClose}
        onUpdate={onUpdate}
        projectId={projectId || ''}
        routeProjectId={routeProjectId}
        onConvertDraft={onConvertDraft}
        onBranchChange={onBranchChange}
        onBranchNameChange={onBranchNameChange}
      />
    );
  }

  if (isCommittedCommit) {
    return (
      <CommittedCommitView
        node={node}
        onClose={onClose}
        onUpdate={onUpdate}
        projectId={projectId || ''}
        routeProjectId={routeProjectId}
        quickActions={quickActions}
      />
    );
  }

  // Fallback for unknown node types
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
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
