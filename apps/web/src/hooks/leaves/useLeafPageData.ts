'use client';

/**
 * useLeafPageData — facade for the leaf workspace page. Composes
 * seven focused sub-hooks and exposes the unified shape consumers
 * depend on.
 *
 * Before PR22 this was a 640-line god-hook. The sub-hooks are:
 *   - useLeafCore            base leaf + load lifecycle
 *   - useLeafCommit          commit + derived semanticContent/nodes/coverage
 *   - useLeafGenerate        generate flow + progress phase
 *   - useLeafValidate        validate-output flow
 *   - useLeafConstraintsEdit constraint / instruction / model editing
 *   - useLeafExport          export-to-file flow
 *   - useLeafAssertions      assertion selection + re-tune
 *
 * Facade also owns the simple (mode, setMode) local UI state.
 */

import { useState } from 'react';
import { useLeafAssertions } from '@/hooks/leaves/useLeafAssertions';
import {
  type NodeCoverageEntry as _NodeCoverageEntry,
  useLeafCommit,
} from '@/hooks/leaves/useLeafCommit';
import { useLeafConstraintsEdit } from '@/hooks/leaves/useLeafConstraintsEdit';
import { useLeafCore } from '@/hooks/leaves/useLeafCore';
import { useLeafExport } from '@/hooks/leaves/useLeafExport';
import { useLeafGenerate } from '@/hooks/leaves/useLeafGenerate';
import { useLeafValidate } from '@/hooks/leaves/useLeafValidate';

export type WorkspaceMode = 'generate' | 'display';

// Re-export types so components that import from
// `@/hooks/leaves/useLeafPageData` (e.g. LeafOutputDisplay) can keep
// using the facade module as the single public surface.
export type NodeCoverageEntry = _NodeCoverageEntry;
export { computeNodeCoverage } from '@/hooks/leaves/useLeafCommit';

import type { SemanticContent } from '@t3x-dev/core';
import type { ApiCommit, Leaf } from '@/infrastructure';
import type { ExportFormat } from '@/infrastructure/export/core';
import type { Constraint } from '@/types/api';
import type { NodeWithSource } from '@/types/sourceContext';

export interface UseLeafPageDataReturn {
  // Core data
  leaf: Leaf | null;
  loading: boolean;
  error: Error | null;
  commitData: ApiCommit | null;
  semanticContent: SemanticContent | null;
  commitLoadError: boolean;
  nodes: NodeWithSource[];

  // Saving states
  saving: boolean;
  savingInstruction: boolean;
  savingModel: boolean;
  modelError: string | null;

  // Generate states
  isGenerating: boolean;
  generatePhase: number;
  generateProgressMessages: string[];
  generateError: string | null;
  generateSuccessBanner: string | null;

  // Validate states
  isValidating: boolean;
  validateError: string | null;
  semanticWarning: boolean;

  // Export
  exportMessage: { type: 'success' | 'error'; text: string } | null;

  // Assertion & Re-tune
  selectedAssertionIds: Set<string>;
  retuning: boolean;
  leafPinned: boolean;

  // Mode & Coverage
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  nodeCoverage: Map<string, NodeCoverageEntry>;

  // Handlers
  handleUpdateConstraints: (constraints: Constraint[], optimisticLeaf?: Leaf) => Promise<void>;
  handleRemoveConstraint: (constraintId: string) => void;
  handleAddConstraint: (
    type: 'require' | 'exclude',
    value: string,
    matchMode?: 'exact' | 'semantic'
  ) => void;
  handleAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceNodeId: string
  ) => void;
  handleUpdateUserInstruction: (instruction: string) => Promise<void>;
  handleUpdateModel: (model: string | undefined) => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleValidate: () => Promise<void>;
  handleExport: (format: ExportFormat) => Promise<void>;
  toggleAssertion: (id: string) => void;
  handleRetune: () => Promise<string | undefined>;

  // Error recovery
  setError: (error: Error | null) => void;
  setLoading: (loading: boolean) => void;
  setLeaf: (leaf: Leaf | null) => void;
}

export function useLeafPageData(projectId: string, leafId: string): UseLeafPageDataReturn {
  const core = useLeafCore(leafId);
  const commit = useLeafCommit(core.leaf);
  const generate = useLeafGenerate(core.leaf, leafId, core.setLeaf);
  const validate = useLeafValidate(core.leaf, leafId, core.setLeaf);
  const constraintsEdit = useLeafConstraintsEdit(leafId, core.leafRef, core.setLeaf, core.setError);
  const exportFns = useLeafExport(core.leafRef);
  const assertions = useLeafAssertions(projectId, leafId, core.leaf);

  const [mode, setMode] = useState<WorkspaceMode>('generate');

  return {
    // Core data
    leaf: core.leaf,
    loading: core.loading,
    error: core.error,
    commitData: commit.commitData,
    semanticContent: commit.semanticContent,
    commitLoadError: commit.commitLoadError,
    nodes: commit.nodes,

    // Saving states
    saving: constraintsEdit.saving,
    savingInstruction: constraintsEdit.savingInstruction,
    savingModel: constraintsEdit.savingModel,
    modelError: constraintsEdit.modelError,

    // Generate
    isGenerating: generate.isGenerating,
    generatePhase: generate.generatePhase,
    generateProgressMessages: generate.generateProgressMessages,
    generateError: generate.generateError,
    generateSuccessBanner: generate.generateSuccessBanner,

    // Validate
    isValidating: validate.isValidating,
    validateError: validate.validateError,
    semanticWarning: validate.semanticWarning,

    // Export
    exportMessage: exportFns.exportMessage,

    // Assertion & Re-tune
    selectedAssertionIds: assertions.selectedAssertionIds,
    retuning: assertions.retuning,
    leafPinned: assertions.leafPinned,

    // Mode & Coverage
    mode,
    setMode,
    nodeCoverage: commit.nodeCoverage,

    // Handlers
    handleUpdateConstraints: constraintsEdit.handleUpdateConstraints,
    handleRemoveConstraint: constraintsEdit.handleRemoveConstraint,
    handleAddConstraint: constraintsEdit.handleAddConstraint,
    handleAddConstraintFromSource: constraintsEdit.handleAddConstraintFromSource,
    handleUpdateUserInstruction: constraintsEdit.handleUpdateUserInstruction,
    handleUpdateModel: constraintsEdit.handleUpdateModel,
    handleGenerate: generate.handleGenerate,
    handleValidate: validate.handleValidate,
    handleExport: exportFns.handleExport,
    toggleAssertion: assertions.toggleAssertion,
    handleRetune: assertions.handleRetune,

    // Error recovery
    setError: core.setError,
    setLoading: core.setLoading,
    setLeaf: core.setLeaf,
  };
}
