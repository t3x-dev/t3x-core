/**
 * Canvas Module
 *
 * Components for the semantic canvas workspace including:
 * - CanvasWorkspace: Main ReactFlow canvas container
 * - CanvasNodes: Node type definitions (conversation, commit, leaf)
 * - NodeModal: Modal for viewing/editing nodes
 * - LeafPanel: Side panel for leaf node details
 * - SelectableTextBlock: Text selection with semantic markup
 * - ManageMode: Manage mode UI for conversation editing
 * - ConstraintsPanel: Constraints display/editing panel
 * - DeletionConfirmDialog: Confirmation dialog for deletions
 */

// Node definitions
export { canvasNodeTypes, LEAF_TYPES } from './CanvasNodes';
// Main workspace
export { default as CanvasWorkspace } from './CanvasWorkspace';
export { default as ConstraintsPanel } from './ConstraintsPanel';
// Dialogs
export { DeletionConfirmDialog } from './DeletionConfirmDialog';

// Panels
export { LeafPanel } from './LeafPanel';
export { default as ManageMode } from './ManageMode';
export type { NodeQuickAction } from './NodeModal';
// Modal
export { NodeModal } from './NodeModal';
// Shared components
export {
  PendingSourceEditor,
  SelectableTextBlock,
  SourceExcerptViewer,
} from './SelectableTextBlock';
