import type { ArrowRight, GitCommit, MessageSquarePlus, Plus } from 'lucide-react';

export interface NextStepResult {
  label: string;
  icon: typeof ArrowRight | typeof MessageSquarePlus | typeof GitCommit | typeof Plus;
  action: () => void;
}

/**
 * B-4: Next Step button logic
 * Determines what action the user should take next based on node state.
 */
export function getNextStep(opts: {
  isStaging: boolean;
  isCommitted: boolean;
  conversationId?: string;
  nodeId: string;
  t: (key: string) => string;
  icons: {
    MessageSquarePlus: typeof MessageSquarePlus;
    GitCommit: typeof GitCommit;
    Plus: typeof Plus;
  };
  actions: {
    navigateToConversation: (conversationId: string) => void;
    openNodeModal: (nodeId: string, mode: 'commit' | 'conversation') => void;
    openLeafPanel: (nodeId: string) => void;
  };
}): NextStepResult | null {
  const { isStaging, isCommitted, conversationId, nodeId, t, icons, actions } = opts;

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
      action: () => actions.navigateToConversation(conversationId),
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
