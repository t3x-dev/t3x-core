/**
 * Canvas context-menu builders — pure(-ish) group constructors for
 * the right-click menu. Extracted from
 * @/components/canvas/NodeContextMenu so non-component consumers
 * (useContextMenu hook) can import without breaching v2 §2.6.
 *
 * The builders return `ContextMenuGroup[]` which contains JSX icons
 * (lucide-react), so this file is `.tsx`. It is NOT a domain/ module
 * — React is allowed here; biome's hooks rule also allows utils/.
 */

import {
  ArrowLeftRight,
  Copy,
  Eye,
  FileOutput,
  GitBranch,
  GitMerge,
  MessageSquarePlus,
  Share2,
  Trash2,
  ZoomIn,
} from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  devOnly?: boolean;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

export function buildUnitNodeMenu(opts: {
  onOpenConversation?: () => void;
  onQuickDiff?: () => void;
  onQuickMerge?: () => void;
  onCreateBranch: () => void;
  onCopyHash?: () => void;
  onDelete?: () => void;
  isDraft: boolean;
  isDeveloperMode: boolean;
  hasConversation?: boolean;
}): ContextMenuGroup[] {
  const navigateItems: ContextMenuItem[] = [];
  if (opts.onOpenConversation) {
    navigateItems.push({
      label: 'Open Conversation',
      icon: <MessageSquarePlus size={14} />,
      action: opts.onOpenConversation,
    });
  }

  const actionItems: ContextMenuItem[] = [];
  if (opts.onQuickDiff) {
    actionItems.push({
      label: 'Compare with Parent',
      icon: <ArrowLeftRight size={14} />,
      action: opts.onQuickDiff,
    });
  }
  if (opts.onQuickMerge) {
    actionItems.push({
      label: 'Merge into Main',
      icon: <GitMerge size={14} />,
      action: opts.onQuickMerge,
    });
  }
  actionItems.push({
    label: 'Create Branch',
    icon: <GitBranch size={14} />,
    action: opts.onCreateBranch,
  });

  const groups: ContextMenuGroup[] = [];
  if (navigateItems.length > 0) groups.push({ items: navigateItems });
  groups.push({ items: actionItems });

  const utilityItems: ContextMenuItem[] = [];
  if (opts.onCopyHash) {
    utilityItems.push({
      label: 'Copy Hash',
      icon: <Copy size={14} />,
      action: opts.onCopyHash,
    });
  }
  if (utilityItems.length > 0) groups.push({ items: utilityItems });

  if (opts.isDraft && opts.onDelete) {
    groups.push({
      items: [{ label: 'Delete', icon: <Trash2 size={14} />, action: opts.onDelete, danger: true }],
    });
  }

  return groups;
}

export function buildLeafNodeMenu(opts: {
  onOpenDetail: () => void;
  onGenerate: () => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
}): ContextMenuGroup[] {
  return [
    {
      items: [
        { label: 'Open Detail', icon: <Eye size={14} />, action: opts.onOpenDetail },
        { label: 'Generate', icon: <FileOutput size={14} />, action: opts.onGenerate },
        { label: 'Share', icon: <Share2 size={14} />, action: opts.onShare },
      ],
    },
    {
      items: [{ label: 'Delete', icon: <Trash2 size={14} />, action: opts.onDelete, danger: true }],
    },
  ];
}

export function buildBackgroundMenu(opts: { onFitView: () => void }): ContextMenuGroup[] {
  return [
    {
      items: [{ label: 'Fit View', icon: <ZoomIn size={14} />, action: opts.onFitView }],
    },
  ];
}
