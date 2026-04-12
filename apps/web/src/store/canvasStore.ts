import type { Edge, Node } from '@xyflow/react';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { create } from 'zustand';
import { deleteConversationById } from '@/queries/conversations';
import type { CanvasNodeData } from '../types/nodes';
import { createCommitSlice } from './canvasCommitSlice';
import { createLeafSlice } from './canvasLeafSlice';
import { createMergeSlice } from './canvasMergeSlice';
import { createNodeSlice } from './canvasNodeSlice';
import type { CanvasState } from './canvasStoreTypes';
import {
  buildIncomingMap,
  buildOutgoingMap,
  canConnect,
  collectAffectedStagingUnits,
  computeUnitTone,
  edgeStyle,
  edgeType,
  getLockedNodeIds,
  isUpstreamOfStagingUnit,
  nextEdgeId,
  resetCounters,
  saveNodePosition,
  snapPosition,
} from './canvasStoreUtils';

export {
  selectCanExecuteMerge,
  selectIsMerging,
  selectMergeCounts,
  selectUnresolvedCount,
} from './canvasMergeSlice';
// Re-export types and selectors for backward compatibility
export type { CanvasState } from './canvasStoreTypes';

export const useCanvasStore = create<CanvasState>((...a) => {
  const [set, get] = a;
  return {
    ...createMergeSlice(...a),
    ...createLeafSlice(...a),
    ...createNodeSlice(...a),
    ...createCommitSlice(...a),

    nodes: [],
    edges: [],
    hasMainCommit: false,
    latestMainCommitId: undefined,
    hasDbPositions: false,
    projectId: null,
    loading: false,
    loadError: null,
    notifyCallback: null,
    openNodeId: null,
    modalViewMode: null,
    deletionConfirmation: null,

    setNotifyCallback: (cb) => set({ notifyCallback: cb }),

    openNodeModal: (nodeId, viewMode = 'commit') =>
      set({ openNodeId: nodeId, modalViewMode: viewMode }),
    closeNodeModal: () => set({ openNodeId: null, modalViewMode: null }),

    onNodesChange: (changes) =>
      set((state) => {
        if (changes.length === 0) {
          return {};
        }

        const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
        const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

        // Handle position changes - save to database (debounced)
        const positionChanges = changes.filter((c) => c.type === 'position' && c.position);
        if (positionChanges.length > 0) {
          positionChanges.forEach((change) => {
            if (change.type !== 'position' || !change.position) return;
            const node = nodeMap.get(change.id);
            if (!node) return;

            const snappedPos = snapPosition(change.position);
            // Save position to database (fire and forget, debounced internally)
            saveNodePosition(node.id, node.data.kind, snappedPos);
          });
        }

        // If a deletion confirmation dialog is already open, suppress new delete requests
        // to prevent silently replacing the pending confirmation
        let mutableChanges = changes;
        if (state.deletionConfirmation) {
          mutableChanges = changes.filter((c) => c.type !== 'remove');
        }

        // Separate remove changes from other changes
        const removeChanges = mutableChanges.filter((c) => c.type === 'remove');
        const otherChanges = mutableChanges.filter((c) => c.type !== 'remove');

        // Filter out locked nodes from removal
        const allowedRemoves = removeChanges.filter((c) => !lockedNodes.has(c.id));

        if (allowedRemoves.length === 0) {
          // No removes, just apply other changes
          if (otherChanges.length === 0) return {};
          return {
            nodes: (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
              (node) => ({
                ...node,
                position: snapPosition(node.position),
              })
            ),
          };
        }

        // Check if any of the nodes to be removed need confirmation
        const nodeIdsToRemove = allowedRemoves.map((c) => c.id);
        const needsConfirmation: string[] = [];
        const directDeletes: string[] = [];

        nodeIdsToRemove.forEach((nodeId) => {
          const node = nodeMap.get(nodeId);
          if (!node) return;

          // Staging unit needs confirmation
          if (node.data.kind === 'unit' && node.data.commitStatus === 'staging') {
            needsConfirmation.push(nodeId);
            return;
          }

          // Node upstream of pending commit needs confirmation
          if (isUpstreamOfStagingUnit(nodeId, state.nodes, state.edges)) {
            needsConfirmation.push(nodeId);
            return;
          }

          // Otherwise, can delete directly
          directDeletes.push(nodeId);
        });

        // If there are nodes needing confirmation, show dialog
        if (needsConfirmation.length > 0) {
          // Build confirmation message
          const stagingUnitsInSelection = needsConfirmation.filter((id) => {
            const n = nodeMap.get(id);
            return n?.data.kind === 'unit' && n?.data.commitStatus === 'staging';
          });
          const upstreamNodes = needsConfirmation.filter(
            (id) => !stagingUnitsInSelection.includes(id)
          );
          const affectedDownstream = collectAffectedStagingUnits(
            needsConfirmation,
            state.nodes,
            state.edges
          );

          let message = '';
          if (stagingUnitsInSelection.length > 0) {
            message += `Discard ${stagingUnitsInSelection.length} staging unit(s)?`;
          }
          if (upstreamNodes.length > 0) {
            if (message) message += '\n';
            message += `Delete ${upstreamNodes.length} upstream node(s)?`;
          }
          if (affectedDownstream.length > 0) {
            if (message) message += '\n';
            message += `This will also affect ${affectedDownstream.length} downstream pending commit(s).`;
          }

          // Collect edges that connect to/from nodes being deleted
          const edgesToRemove = state.edges
            .filter(
              (e) => needsConfirmation.includes(e.source) || needsConfirmation.includes(e.target)
            )
            .map((e) => e.id);

          // Apply direct deletes immediately, but defer confirmation nodes
          const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));

          // Delete conversations from database for directly deleted unit nodes
          // Note: Commit deletion is local only - backend deleteCommit API not available
          directDeletes.forEach((nodeId) => {
            const node = nodeMap.get(nodeId);
            if (node?.data.kind === 'unit' && node.data.conversationId) {
              deleteConversationById(node.data.conversationId).catch(() => {
                // Error handled silently
              });
            }
          });

          const newNodes =
            directRemoveChanges.length > 0
              ? (
                  applyNodeChanges(
                    [...otherChanges, ...directRemoveChanges],
                    state.nodes
                  ) as Node<CanvasNodeData>[]
                ).map((node) => ({
                  ...node,
                  position: snapPosition(node.position),
                }))
              : otherChanges.length > 0
                ? (applyNodeChanges(otherChanges, state.nodes) as Node<CanvasNodeData>[]).map(
                    (node) => ({
                      ...node,
                      position: snapPosition(node.position),
                    })
                  )
                : state.nodes;

          return {
            nodes: newNodes,
            deletionConfirmation: {
              nodeIds: needsConfirmation,
              edgeIds: edgesToRemove,
              message,
              onConfirm: () => {
                // This will be called when user confirms
                const currentState = get();
                const nodesToDeleteSet = new Set(needsConfirmation);

                // Delete conversations from database for unit nodes
                // Note: Commit deletion is local only - backend deleteCommit API not available
                needsConfirmation.forEach((nodeId) => {
                  const node = currentState.nodes.find((n) => n.id === nodeId);
                  if (node?.data.kind === 'unit' && node.data.conversationId) {
                    deleteConversationById(node.data.conversationId).catch(() => {
                      // Error handled silently
                    });
                  }
                });

                set((s) => ({
                  nodes: s.nodes.filter((n) => !nodesToDeleteSet.has(n.id)),
                  edges: s.edges.filter(
                    (e) => !nodesToDeleteSet.has(e.source) && !nodesToDeleteSet.has(e.target)
                  ),
                  deletionConfirmation: null,
                }));
              },
            },
          };
        }

        // No confirmation needed, apply all changes
        // Delete conversations from database for removed unit nodes
        // Note: Commit deletion is local only - backend deleteCommit API not available
        allowedRemoves.forEach((change) => {
          const node = nodeMap.get(change.id);
          if (node?.data.kind === 'unit' && node.data.conversationId) {
            deleteConversationById(node.data.conversationId).catch(() => {
              // Error handled silently
            });
          }
        });

        return {
          nodes: (
            applyNodeChanges(
              [...otherChanges, ...allowedRemoves],
              state.nodes
            ) as Node<CanvasNodeData>[]
          ).map((node) => ({
            ...node,
            position: snapPosition(node.position),
          })),
        };
      }),

    onEdgesChange: (changes) =>
      set((state) => {
        if (changes.length === 0) {
          return {};
        }

        const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));
        const lockedNodes = getLockedNodeIds(state.nodes, state.edges);

        // Separate remove changes from other changes
        const removeChanges = changes.filter((c) => c.type === 'remove');
        const otherChanges = changes.filter((c) => c.type !== 'remove');

        // Filter out edges that connect locked nodes
        // An edge is protected if BOTH source and target are locked
        // (this means the edge is part of committed history)
        const allowedRemoves = removeChanges.filter((c) => {
          const edge = state.edges.find((e) => e.id === c.id);
          if (!edge) return false;
          const sourceLocked = lockedNodes.has(edge.source);
          const targetLocked = lockedNodes.has(edge.target);
          // Block if BOTH ends are locked (edge is part of committed history)
          return !(sourceLocked && targetLocked);
        });

        if (allowedRemoves.length === 0) {
          if (otherChanges.length === 0) return {};
          return { edges: applyEdgeChanges(otherChanges, state.edges) };
        }

        // Check if any edge removal needs confirmation
        // An edge needs confirmation if it connects to a pending commit
        const needsConfirmation: string[] = [];
        const directDeletes: string[] = [];

        allowedRemoves.forEach((c) => {
          const edge = state.edges.find((e) => e.id === c.id);
          if (!edge) return;

          const targetNode = nodeMap.get(edge.target);

          // Edge going INTO a staging unit needs confirmation
          if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
            needsConfirmation.push(c.id);
            return;
          }

          // Edge from a node that feeds into pending commit downstream
          if (isUpstreamOfStagingUnit(edge.source, state.nodes, state.edges)) {
            needsConfirmation.push(c.id);
            return;
          }

          directDeletes.push(c.id);
        });

        if (needsConfirmation.length > 0) {
          // Find affected staging units
          const affectedStagingUnits = new Set<string>();
          needsConfirmation.forEach((edgeId) => {
            const edge = state.edges.find((e) => e.id === edgeId);
            if (!edge) return;

            const targetNode = nodeMap.get(edge.target);
            if (targetNode?.data.kind === 'unit' && targetNode?.data.commitStatus === 'staging') {
              affectedStagingUnits.add(edge.target);
            }

            // Also check downstream
            const downstream = collectAffectedStagingUnits([edge.source], state.nodes, state.edges);
            downstream.forEach((id) => affectedStagingUnits.add(id));
          });

          const message =
            affectedStagingUnits.size > 0
              ? `This will disconnect ${affectedStagingUnits.size} staging unit(s) from their source. Continue?`
              : `Delete ${needsConfirmation.length} connection(s)?`;

          // Apply direct deletes immediately
          const directRemoveChanges = allowedRemoves.filter((c) => directDeletes.includes(c.id));
          const newEdges =
            directRemoveChanges.length > 0
              ? applyEdgeChanges([...otherChanges, ...directRemoveChanges], state.edges)
              : otherChanges.length > 0
                ? applyEdgeChanges(otherChanges, state.edges)
                : state.edges;

          return {
            edges: newEdges,
            deletionConfirmation: {
              nodeIds: [],
              edgeIds: needsConfirmation,
              message,
              onConfirm: () => {
                set((s) => {
                  const edgesToDelete = new Set(needsConfirmation);
                  return {
                    edges: s.edges.filter((e) => !edgesToDelete.has(e.id)),
                    deletionConfirmation: null,
                  };
                });
              },
            },
          };
        }

        // No confirmation needed
        return {
          edges: applyEdgeChanges([...otherChanges, ...allowedRemoves], state.edges),
        };
      }),

    onConnect: (connection) => {
      const { nodes, edges } = get();
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);

      if (!canConnect(source, target)) {
        return;
      }

      const exists = edges.some(
        (edge) => edge.source === connection.source && edge.target === connection.target
      );

      if (exists) {
        return;
      }

      const newEdge: Edge = {
        id: nextEdgeId(),
        source: connection.source!,
        target: connection.target!,
        type: edgeType,
        animated: false,
        style: edgeStyle,
        data: { createdAt: Date.now(), edgeType: 'evolve' },
      };

      // Propagate sourceCommitHash when connecting committed → staging unit
      let updatedNodes = nodes;
      if (
        source &&
        target &&
        source.data.kind === 'unit' &&
        source.data.commitStatus === 'committed' &&
        target.data.kind === 'unit' &&
        target.data.commitStatus === 'staging'
      ) {
        updatedNodes = nodes.map((n) =>
          n.id === target.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  sourceCommitHash: source.data.commitHash ?? source.data.sourceCommitHash,
                  sourceTurnWindow: source.data.sourceTurnWindow,
                },
              }
            : n
        );
      }

      set({ nodes: updatedNodes, edges: [...edges, newEdge] });
    },
    getCommitTone: (commitId) => {
      const state = get();
      return computeUnitTone(state.nodes, state.edges, state.latestMainCommitId, commitId);
    },
    resetToSingleConversation: () => {
      resetCounters();
      // Don't create seed node with fake ID - user should use addNode to create real units
      set({
        nodes: [],
        edges: [],
        hasMainCommit: false,
        latestMainCommitId: undefined,
        hasDbPositions: false,
      });
    },

    // DEV: Load demo data to showcase 3-section layout
    loadDemoData: () => {
      const demoNode: Node<CanvasNodeData> = {
        id: 'demo-unit-1',
        type: 'unit',
        position: { x: 100, y: 100 },
        data: {
          entryId: 'demo_001',
          title: 'Legal rewrite v2',
          summary: 'Refined legal language for compliance review',
          status: 'Active',
          timestamp: '2h ago',
          tags: ['legal', 'compliance'],
          kind: 'unit',
          commitStatus: 'committed',
          commitHash: 'abc123def456789',
          branchType: 'main',
          // Sources section - 2 conversations
          sources: [
            {
              id: 'src-1',
              type: 'conversation',
              label: 'conv#34',
              title: 'Initial legal discussion',
            },
            { id: 'src-2', type: 'meeting', label: 'mtg#7', title: 'Compliance review meeting' },
          ],
          // Leaves section - 2 outputs
          leaves: [
            { id: 'leaf-1', type: 'tweet', title: 'Twitter Post' },
            { id: 'leaf-2', type: 'article', title: 'Blog Article' },
          ],
        },
      };

      const demoNode2: Node<CanvasNodeData> = {
        id: 'demo-unit-2',
        type: 'unit',
        position: { x: 500, y: 100 },
        data: {
          entryId: 'demo_002',
          title: 'Marketing copy draft',
          summary: '',
          status: 'Draft',
          timestamp: '1h ago',
          tags: ['marketing'],
          kind: 'unit',
          commitStatus: 'staging',
          branchType: 'branch',
          branchName: 'feature/marketing',
          mustHave: ['brand', 'value'],
          mustntHave: ['competitor'],
          // Sources - 1 file import
          sources: [
            { id: 'src-3', type: 'file', label: 'brief.pdf', title: 'Marketing brief document' },
          ],
          // No leaves yet (staging)
        },
      };

      set({
        nodes: [demoNode, demoNode2],
        edges: [],
        hasMainCommit: true,
        latestMainCommitId: 'demo-unit-1',
      });
    },

    // Save constraints to a unit node
    saveConversationConstraints: (unitId, constraints) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === unitId && node.data.kind === 'unit'
            ? { ...node, data: { ...node.data, constraints } }
            : node
        ),
      })),

    // Get constraints from a unit node
    getConversationConstraints: (unitId) => {
      const state = get();
      const node = state.nodes.find((n) => n.id === unitId && n.data.kind === 'unit');
      return node?.data.constraints;
    },

    // Update staging unit constraint overrides
    updatePendingCommitConstraintOverrides: (unitId, overrides) =>
      set((state) => ({
        nodes: state.nodes.map((node) => {
          if (
            node.id !== unitId ||
            node.data.kind !== 'unit' ||
            node.data.commitStatus !== 'staging'
          ) {
            return node;
          }
          const currentOverrides = node.data.constraintOverrides ?? {
            disabledClauseIds: [],
            additionalMustHave: [],
            additionalMustntHave: [],
            removedMustHave: [],
            removedMustntHave: [],
          };
          return {
            ...node,
            data: {
              ...node.data,
              constraintOverrides: { ...currentOverrides, ...overrides },
            },
          };
        }),
      })),

    // Get source unit for a staging unit (follows edges backward to parent unit)
    getSourceConversationForPendingCommit: (unitId) => {
      const state = get();
      const incomingMap = buildIncomingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      // BFS to find the first unit ancestor
      const visited = new Set<string>();
      const queue = [...(incomingMap.get(unitId) ?? [])];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = nodeMap.get(currentId);
        if (node?.data.kind === 'unit') {
          return node;
        }

        const parents = incomingMap.get(currentId) ?? [];
        parents.forEach((p) => {
          if (!visited.has(p)) queue.push(p);
        });
      }
      return undefined;
    },

    // Get effective constraints for a pending commit (conversation constraints + overrides)
    getPendingCommitEffectiveConstraints: (commitId) => {
      const state = get();
      const pendingNode = state.nodes.find(
        (n) => n.id === commitId && n.data.kind === 'unit' && n.data.commitStatus === 'staging'
      );
      if (!pendingNode) return undefined;

      // Find source conversation
      const sourceConv = get().getSourceConversationForPendingCommit(commitId);
      const baseConstraints = sourceConv?.data.constraints;
      if (!baseConstraints) return undefined;

      const overrides = pendingNode.data.constraintOverrides;

      // Apply overrides
      const clauses = baseConstraints.clauses.filter(
        (c) => !overrides?.disabledClauseIds?.includes(c.id)
      );

      const must_have = [
        ...baseConstraints.must_have.filter((kw) => !overrides?.removedMustHave?.includes(kw)),
        ...(overrides?.additionalMustHave ?? []),
      ];

      const mustnt_have = [
        ...baseConstraints.mustnt_have.filter((kw) => !overrides?.removedMustntHave?.includes(kw)),
        ...(overrides?.additionalMustntHave ?? []),
      ];

      return { clauses, must_have, mustnt_have };
    },

    // Check if a conversation has any downstream pending commits (for locking editing)
    hasDownstreamPendingCommits: (conversationId) => {
      const state = get();
      const outgoingMap = buildOutgoingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      // BFS to find any pending commit descendant
      const visited = new Set<string>();
      const queue = [...(outgoingMap.get(conversationId) ?? [])];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const node = nodeMap.get(currentId);
        if (node?.data.kind === 'unit' && node?.data.commitStatus === 'staging') {
          return true;
        }

        const children = outgoingMap.get(currentId) ?? [];
        children.forEach((c) => {
          if (!visited.has(c)) queue.push(c);
        });
      }
      return false;
    },

    // Deletion confirmation methods
    confirmDeletion: () => {
      const state = get();
      if (state.deletionConfirmation?.onConfirm) {
        state.deletionConfirmation.onConfirm();
      }
    },

    cancelDeletion: () => set({ deletionConfirmation: null }),

    // Get direct upstream source nodes (committed units) for a staging unit
    // Returns nodes that can provide source content for a staging unit
    getUpstreamSourceNodes: (nodeId) => {
      const state = get();
      const incomingMap = buildIncomingMap(state.edges);
      const nodeMap = new Map(state.nodes.map((n) => [n.id, n]));

      const sourceNodeIds = incomingMap.get(nodeId) ?? [];
      const sourceNodes: Node<CanvasNodeData>[] = [];

      for (const sourceId of sourceNodeIds) {
        const node = nodeMap.get(sourceId);
        if (!node) continue;

        // Include committed units (not staging)
        if (node.data.kind === 'unit' && node.data.commitStatus === 'committed') {
          sourceNodes.push(node);
        }
      }

      return sourceNodes;
    },
  };
});
