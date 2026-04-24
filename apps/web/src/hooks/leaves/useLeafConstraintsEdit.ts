'use client';

/**
 * useLeafConstraintsEdit — owns constraint editing (optimistic-update
 * with AbortController), user-instruction update, and model update.
 * Mutates the leaf via updateLeaf and writes back through setLeaf.
 *
 * Extracted from useLeafPageData (PR22).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { setLeafSemanticPointIncluded } from '@/domain/leaf/semanticPoints';
import { updateLeaf } from '@/infrastructure';
import type { Constraint, Leaf } from '@/types/api';

export interface UseLeafConstraintsEditReturn {
  saving: boolean;
  savingInstruction: boolean;
  savingModel: boolean;
  savingSemanticPoints: boolean;
  modelError: string | null;
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
  handleSetSemanticPointIncluded: (pointId: string, included: boolean) => Promise<void>;
}

export function useLeafConstraintsEdit(
  leafId: string,
  leafRef: React.MutableRefObject<Leaf | null>,
  setLeaf: (leaf: Leaf | null) => void,
  setError: (error: Error | null) => void
): UseLeafConstraintsEditReturn {
  const [saving, setSaving] = useState(false);
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savingSemanticPoints, setSavingSemanticPoints] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const constraintAbortRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount.
  useEffect(() => {
    return () => {
      constraintAbortRef.current?.abort();
    };
  }, []);

  const handleUpdateConstraints = useCallback(
    async (constraints: Constraint[], optimisticLeaf?: Leaf) => {
      constraintAbortRef.current?.abort();
      const controller = new AbortController();
      constraintAbortRef.current = controller;

      const previousLeaf = leafRef.current;
      if (optimisticLeaf) {
        setLeaf(optimisticLeaf);
      }

      try {
        setSaving(true);
        const updated = await updateLeaf(leafId, { constraints });
        if (!controller.signal.aborted) {
          setLeaf(updated);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          if (optimisticLeaf && previousLeaf) {
            setLeaf(previousLeaf);
          }
          setError(err instanceof Error ? err : new Error('Failed to update constraints'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setSaving(false);
        }
      }
    },
    [leafId, leafRef, setLeaf, setError]
  );

  const handleRemoveConstraint = useCallback(
    (constraintId: string) => {
      const current = leafRef.current;
      if (!current || saving) return;
      const updatedConstraints = current.constraints.filter((c) => c.id !== constraintId);
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints, leafRef]
  );

  const handleAddConstraint = useCallback(
    (type: 'require' | 'exclude', value: string, matchMode: 'exact' | 'semantic' = 'exact') => {
      const current = leafRef.current;
      if (!current || saving || !value.trim()) return;
      const newConstraint: Constraint = {
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        type,
        value: value.trim(),
        match_mode: matchMode,
      };
      const updatedConstraints = [...current.constraints, newConstraint];
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints, leafRef]
  );

  const handleAddConstraintFromSource = useCallback(
    (type: 'require' | 'exclude', value: string, sourceNodeId: string) => {
      const current = leafRef.current;
      if (!current || saving || !value.trim()) return;
      const base = {
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        value: value.trim(),
        match_mode: 'exact' as const,
        description: `Selected from node ${sourceNodeId}`,
      };
      const newConstraint: Constraint =
        type === 'require'
          ? { ...base, type: 'require', source_node: { frame_type: sourceNodeId } }
          : { ...base, type: 'exclude', reason: `Excluded from node ${sourceNodeId}` };
      const updatedConstraints = [...current.constraints, newConstraint];
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints, leafRef]
  );

  const handleUpdateUserInstruction = useCallback(
    async (instruction: string) => {
      const current = leafRef.current;
      if (!current) return;
      setSavingInstruction(true);
      try {
        const updatedConfig = {
          ...current.config,
          user_instruction: instruction || undefined,
        };
        const updated = await updateLeaf(leafId, { config: updatedConfig });
        setLeaf(updated);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update instruction'));
      } finally {
        setSavingInstruction(false);
      }
    },
    [leafId, leafRef, setLeaf, setError]
  );

  const handleUpdateModel = useCallback(
    async (model: string | undefined) => {
      const current = leafRef.current;
      if (!current) return;
      setSavingModel(true);
      setModelError(null);
      try {
        const updatedConfig = { ...current.config, model: model ?? undefined };
        const updated = await updateLeaf(leafId, { config: updatedConfig });
        setLeaf(updated);
      } catch (err) {
        setModelError(err instanceof Error ? err.message : 'Failed to update model');
      } finally {
        setSavingModel(false);
      }
    },
    [leafId, leafRef, setLeaf]
  );

  const handleSetSemanticPointIncluded = useCallback(
    async (pointId: string, included: boolean) => {
      const current = leafRef.current;
      if (!current) return;

      const previousLeaf = current;
      const updatedConfig = setLeafSemanticPointIncluded(current.config ?? {}, pointId, included);
      const optimisticLeaf = { ...current, config: updatedConfig };

      setLeaf(optimisticLeaf);
      setSavingSemanticPoints(true);

      try {
        const updated = await updateLeaf(leafId, { config: updatedConfig });
        setLeaf(updated);
      } catch (err) {
        setLeaf(previousLeaf);
        setError(err instanceof Error ? err : new Error('Failed to update semantic points'));
      } finally {
        setSavingSemanticPoints(false);
      }
    },
    [leafId, leafRef, setLeaf, setError]
  );

  return {
    saving,
    savingInstruction,
    savingModel,
    savingSemanticPoints,
    modelError,
    handleUpdateConstraints,
    handleRemoveConstraint,
    handleAddConstraint,
    handleAddConstraintFromSource,
    handleUpdateUserInstruction,
    handleUpdateModel,
    handleSetSemanticPointIncluded,
  };
}
