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

// Main workspace
export { default as CanvasWorkspace } from './CanvasWorkspace'

// Node definitions
export { canvasNodeTypes, LEAF_TYPES } from './CanvasNodes'

// Modal
export { NodeModal } from './NodeModal'
export type { NodeQuickAction } from './NodeModal'

// Panels
export { LeafPanel } from './LeafPanel'
export { default as ConstraintsPanel } from './ConstraintsPanel'

// Shared components
export {
  SelectableTextBlock,
  PendingSourceEditor,
  SourceExcerptViewer
} from './SelectableTextBlock'
export { default as ManageMode } from './ManageMode'

// Dialogs
export { DeletionConfirmDialog } from './DeletionConfirmDialog'
