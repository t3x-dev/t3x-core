import type { ArrowRight, GitCommit, MessageSquarePlus, PenSquare, Plus } from 'lucide-react';

export interface NextStepResult {
  label: string;
  icon:
    | typeof ArrowRight
    | typeof PenSquare
    | typeof MessageSquarePlus
    | typeof GitCommit
    | typeof Plus;
  action: () => void;
}

/**
 * B-4: Next Step button logic
 * Determines what action the user should take next based on node state.
 */
export function getNextStep(opts: {
  isDraft: boolean;
  isStaging: boolean;
  isCommitted: boolean;
  draftId?: string;
  projectId?: string;
  conversationId?: string;
  nodeId: string;
  t: (key: string) => string;
  icons: {
    PenSquare: typeof PenSquare;
    MessageSquarePlus: typeof MessageSquarePlus;
    GitCommit: typeof GitCommit;
    Plus: typeof Plus;
  };
  actions: {
    navigateToDraft: (projectId: string, draftId: string) => void;
    openNodeModal: (nodeId: string, mode: 'commit' | 'conversation') => void;
    openLeafPanel: (nodeId: string) => void;
  };
}): NextStepResult | null {
  const {
    isDraft,
    isStaging,
    isCommitted,
    draftId,
    projectId,
    conversationId,
    nodeId,
    t,
    icons,
    actions,
  } = opts;

  // Draft nodes: navigate to draft workspace
  if (isDraft && draftId && projectId) {
    return {
      label: 'Open Draft',
      icon: icons.PenSquare,
      action: () => actions.navigateToDraft(projectId, draftId),
    };
  }
  if (isStaging && !conversationId) {
    return {
      label: 'Start Conversation',
      icon: icons.MessageSquarePlus,
      action: () => actions.openNodeModal(nodeId, 'conversation'),
    };
  }
  if (isStaging && conversationId) {
    return {
      label: t('create_commit'),
      icon: icons.GitCommit,
      action: () => actions.openNodeModal(nodeId, 'commit'),
    };
  }
  if (isCommitted) {
    return {
      label: 'Create Output',
      icon: icons.Plus,
      action: () => actions.openLeafPanel(nodeId),
    };
  }
  return null;
}
