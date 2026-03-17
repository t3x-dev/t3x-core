import type { Node } from '@xyflow/react';
import { useEffect } from 'react';
import type { CanvasNodeData } from '@/types/nodes';

interface CanvasKeyboardShortcutsOptions {
  selectAllNodes: () => void;
  deselectAllNodes: () => void;
  navigateToNode: (direction: 'up' | 'down' | 'left' | 'right') => void;
  getNodes: () => Node[];
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  openNodeModal: (nodeId: string, viewMode?: 'conversation' | 'commit') => void;
  openNodeId: string | null;
  showShortcuts: boolean;
  router: { push: (url: string) => void };
  projectId: string | null;
  setIsPanMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  setShowShortcuts: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function useCanvasKeyboardShortcuts({
  selectAllNodes,
  deselectAllNodes,
  navigateToNode,
  getNodes,
  setNodes,
  openNodeModal,
  openNodeId,
  showShortcuts,
  router,
  projectId,
  setIsPanMode,
  setShowShortcuts,
}: CanvasKeyboardShortcutsOptions) {
  // Main keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Pan mode toggle (Meta/Ctrl held) -- always allowed
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(true);
      }

      // Don't handle navigation shortcuts when modal/dialog is open
      if (openNodeId || showShortcuts) {
        return;
      }

      // Space: toggle pan mode (skip when focus is on interactive elements)
      if (event.key === ' ') {
        if (
          target.tagName === 'BUTTON' ||
          target.tagName === 'SELECT' ||
          target.getAttribute('role') === 'button' ||
          target.getAttribute('role') === 'combobox'
        ) {
          return;
        }
        event.preventDefault();
        setIsPanMode((prev: boolean) => !prev);
        return;
      }

      // Select all (Ctrl/Cmd+A)
      if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        selectAllNodes();
        return;
      }

      // Deselect all (Escape)
      if (event.key === 'Escape') {
        deselectAllNodes();
        return;
      }

      // Tab: cycle through nodes
      if (event.key === 'Tab') {
        event.preventDefault();
        const currentNodes = getNodes();
        if (currentNodes.length === 0) return;
        const selectedIdx = currentNodes.findIndex((n) => n.selected);
        const nextIdx = event.shiftKey
          ? selectedIdx <= 0
            ? currentNodes.length - 1
            : selectedIdx - 1
          : (selectedIdx + 1) % currentNodes.length;
        setNodes(currentNodes.map((node, i) => ({ ...node, selected: i === nextIdx })));
        return;
      }

      // Enter: open selected node (committed -> full page, others -> modal)
      if (event.key === 'Enter') {
        const currentNodes = getNodes();
        const selectedNode = currentNodes.find((n) => n.selected);
        if (selectedNode) {
          event.preventDefault();
          const nodeData = selectedNode.data as CanvasNodeData;
          if (nodeData.commitStatus === 'committed' && nodeData.commitHash && projectId) {
            router.push(`/project/${projectId}/commit/${encodeURIComponent(nodeData.commitHash)}`);
          } else {
            openNodeModal(selectedNode.id, 'commit');
          }
        }
        return;
      }

      // Arrow key navigation
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        navigateToNode('up');
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        navigateToNode('down');
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateToNode('left');
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateToNode('right');
        return;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') {
        setIsPanMode(false);
      }
    };
    const handleBlur = () => setIsPanMode(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [
    selectAllNodes,
    deselectAllNodes,
    navigateToNode,
    getNodes,
    setNodes,
    openNodeModal,
    openNodeId,
    showShortcuts,
    router,
    projectId,
    setIsPanMode,
  ]);

  // Keyboard shortcut help dialog toggle (? key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts((prev: boolean) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowShortcuts]);
}
