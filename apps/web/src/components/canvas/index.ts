/**
 * Canvas Module
 *
 * Components for the semantic canvas workspace including:
 * - CanvasWorkspace: Main ReactFlow canvas container
 * - CanvasNodes: Node type definitions (conversation, commit, leaf)
 * - NodeModal: Modal for viewing/editing nodes
 * - LeafPanel: Side panel for leaf node details
 * - SelectableTextBlock: Text selection with semantic markup
 * - DeletionConfirmDialog: Confirmation dialog for deletions
 */

// Node definitions
export { canvasNodeTypes, LEAF_TYPES } from './CanvasNodes';
// Main workspace
export { default as CanvasWorkspace } from './CanvasWorkspace';
// Dialogs
export { DeletionConfirmDialog } from './DeletionConfirmDialog';

// Panels
export { LeafPanel } from './LeafPanel';
export type { NodeQuickAction } from './NodeModal';
// Modal
export { NodeModal } from './NodeModal';
// Shared components
export { PendingSourceEditor } from './PendingSourceEditor';
export { SelectableTextBlock, SourceBox } from './SelectableTextBlock';
export { SourceExcerptViewer } from './SourceExcerptViewer';
