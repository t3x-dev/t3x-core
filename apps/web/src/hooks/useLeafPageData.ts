'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiCommit, Constraint, Leaf } from '@/lib/api';
import {
  ApiError,
  generateLeafOutput,
  getApiCommit,
  getLeaf,
  getSemanticContent,
  updateLeaf,
  validateLeafOutput,
} from '@/lib/api';
import { type ExportFormat, exportLeaf } from '@/lib/export';
import { createRetuneSession } from '@/lib/retune';
import { usePinsStore } from '@/store/pinsStore';
import type { SentenceWithSource } from '@/types/sourceContext';

// ── Sentence coverage types ──

export type WorkspaceMode = 'generate' | 'display';

export interface SentenceCoverageEntry {
  reflected: boolean;
  matchStart?: number;
  matchEnd?: number;
  snippet?: string;
}

/**
 * Compute sentence-to-output mapping.
 * For each sentence, tokenize into 3+ word ngrams and search output text.
 */
export function computeSentenceCoverage(
  sentences: SentenceWithSource[],
  output: string | null
): Map<string, SentenceCoverageEntry> {
  const result = new Map<string, SentenceCoverageEntry>();
  if (!output || sentences.length === 0) {
    for (const s of sentences) {
      result.set(s.id, { reflected: false });
    }
    return result;
  }

  const lowerOutput = output.toLowerCase();

  for (const s of sentences) {
    const words = s.text.split(/\s+/).filter((w) => w.length > 0);
    let bestMatch: { start: number; end: number; snippet: string } | null = null;

    // Try decreasing ngram sizes: 5, 4, 3 words
    for (let n = Math.min(5, words.length); n >= 3; n--) {
      if (bestMatch) break;
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words
          .slice(i, i + n)
          .join(' ')
          .toLowerCase();
        const idx = lowerOutput.indexOf(phrase);
        if (idx !== -1) {
          const snippetStart = Math.max(0, idx - 10);
          const snippetEnd = Math.min(output.length, idx + phrase.length + 10);
          bestMatch = {
            start: idx,
            end: idx + phrase.length,
            snippet: output.slice(snippetStart, snippetEnd),
          };
          break;
        }
      }
    }

    if (bestMatch) {
      result.set(s.id, {
        reflected: true,
        matchStart: bestMatch.start,
        matchEnd: bestMatch.end,
        snippet: bestMatch.snippet,
      });
    } else {
      result.set(s.id, { reflected: false });
    }
  }

  return result;
}

export interface UseLeafPageDataReturn {
  // Core data
  leaf: Leaf | null;
  loading: boolean;
  error: Error | null;
  commitData: ApiCommit | null;
  semanticContent: SemanticContent | null;
  commitLoadError: boolean;
  sentences: SentenceWithSource[];

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
  sentenceCoverage: Map<string, SentenceCoverageEntry>;
  sentenceConfidence: Map<string, number>;

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
    sourceSentenceId: string
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
  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const leafRef = useRef<Leaf | null>(null);
  const constraintAbortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState(0);
  const generateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [semanticWarning, setSemanticWarning] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [commitData, setCommitData] = useState<ApiCommit | null>(null);
  const [commitLoadError, setCommitLoadError] = useState(false);
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [generateSuccessBanner, setGenerateSuccessBanner] = useState<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cleanup banner/export timers on unmount to avoid setState on unmounted component
  useEffect(() => {
    return () => {
      clearTimeout(bannerTimerRef.current);
      clearTimeout(exportTimerRef.current);
    };
  }, []);

  // Assertion selection & Re-tune state
  const [selectedAssertionIds, setSelectedAssertionIds] = useState<Set<string>>(new Set());
  const [retuning, setRetuning] = useState(false);
  const { fetchPins, isPinned, getPinByRef, invalidatePins } = usePinsStore();
  const leafPinned = isPinned('leaf', leafId);
  const existingPin = getPinByRef('leaf', leafId);

  // Model error
  const [modelError, setModelError] = useState<string | null>(null);

  // Mode & Coverage
  const [mode, setMode] = useState<WorkspaceMode>('generate');

  // Keep leafRef in sync with leaf state
  useEffect(() => {
    leafRef.current = leaf;
  }, [leaf]);

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      constraintAbortRef.current?.abort();
    };
  }, []);

  // Load leaf data
  useEffect(() => {
    if (!leafId) return;

    const loadLeaf = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeaf(leafId);
        setLeaf(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load leaf'));
      } finally {
        setLoading(false);
      }
    };

    loadLeaf();
  }, [leafId]);

  // Ensure pins are loaded for this project
  useEffect(() => {
    if (projectId) fetchPins(projectId);
  }, [projectId, fetchPins]);

  // Initialize selected assertions: default to failed ones from runner_assertions
  useEffect(() => {
    const source = leaf?.runner_assertions ?? leaf?.assertions;
    if (source) {
      const failedIds = source.filter((a) => !a.passed).map((a) => a.id);
      setSelectedAssertionIds(new Set(failedIds));
    }
  }, [leaf?.runner_assertions, leaf?.assertions]);

  // Toggle a single assertion checkbox
  const toggleAssertion = useCallback((id: string) => {
    setSelectedAssertionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Re-tune: pin selected assertions, create new conversation
  // Returns conversationId for navigation (caller handles routing)
  const handleRetune = useCallback(async (): Promise<string | undefined> => {
    if (!leaf?.commit_hash || selectedAssertionIds.size === 0) return undefined;

    setRetuning(true);
    try {
      const { conversationId } = await createRetuneSession({
        projectId,
        leafId,
        commitHash: leaf.commit_hash,
        selectedAssertionIds: Array.from(selectedAssertionIds),
        existingPinId: existingPin?.id,
      });
      // Invalidate so fetchPins bypasses the "already initialized" guard
      invalidatePins();
      await fetchPins(projectId);
      return conversationId;
    } catch (_err) {
      // stay on page
      return undefined;
    } finally {
      setRetuning(false);
    }
  }, [
    projectId,
    leafId,
    leaf?.commit_hash,
    selectedAssertionIds,
    existingPin,
    fetchPins,
    invalidatePins,
  ]);

  // Generate progress phase messages
  const generateProgressMessages = useMemo(
    () => [
      'Preparing context...',
      'Generating output...',
      'Validating constraints...',
      'Finalizing...',
    ],
    []
  );

  // Cycle through generate phases
  useEffect(() => {
    if (!isGenerating) {
      setGeneratePhase(0);
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
      return;
    }
    generateTimerRef.current = setInterval(() => {
      setGeneratePhase((p) => Math.min(p + 1, generateProgressMessages.length - 1));
    }, 8000);
    return () => {
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
    };
  }, [isGenerating, generateProgressMessages]);

  // Load parent commit data for source content display
  useEffect(() => {
    if (!leaf?.commit_hash) return;
    getApiCommit(leaf.commit_hash)
      .then(setCommitData)
      .catch(() => {
        setCommitLoadError(true);
      });
  }, [leaf?.commit_hash]);

  // Derive SemanticContent from ApiCommit
  const semanticContent = useMemo(
    () => (commitData ? getSemanticContent(commitData) : null),
    [commitData]
  );

  // Memoize sentences to prevent unnecessary re-renders in LeafConstraintSourceContext
  const sentences = useMemo((): SentenceWithSource[] => {
    if (!semanticContent) return [];
    const { treesToNodes } = require('@/lib/treeCompat');
    const nodes = treesToNodes(semanticContent.trees);
    return nodes.map((f: { id: string; type: string; slots: Record<string, unknown> }) => ({
      id: f.id,
      text: `[${f.type}] ${Object.entries(f.slots)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('; ')}`,
      source: undefined, // tree source tracing handled differently
    }));
  }, [semanticContent]);

  // Memoize confidence scores from commit data
  const sentenceConfidence = useMemo((): Map<string, number> => {
    if (!semanticContent) return new Map();
    const { treesToNodes } = require('@/lib/treeCompat');
    const nodes = treesToNodes(semanticContent.trees);
    const m = new Map<string, number>();
    for (const f of nodes) {
      if (f.confidence != null) m.set(f.id, f.confidence);
    }
    return m;
  }, [semanticContent]);

  // Compute sentence coverage (for Display Mode)
  const sentenceCoverage = useMemo(
    () => computeSentenceCoverage(sentences, leaf?.output ?? null),
    [sentences, leaf?.output]
  );

  // Handle constraint update (with optimistic update and abort support)
  const handleUpdateConstraints = useCallback(
    async (constraints: Constraint[], optimisticLeaf?: Leaf) => {
      // Abort any in-flight constraint update
      constraintAbortRef.current?.abort();
      const controller = new AbortController();
      constraintAbortRef.current = controller;

      // Capture pre-optimistic value before applying optimistic update
      const previousLeaf = leafRef.current;

      // Apply optimistic update immediately if provided
      if (optimisticLeaf) {
        setLeaf(optimisticLeaf);
      }

      try {
        setSaving(true);
        const updated = await updateLeaf(leafId, { constraints });
        // Sync with server state unless this request was superseded
        if (!controller.signal.aborted) {
          setLeaf(updated);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          // Revert to pre-optimistic state on error
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
    [leafId]
  );

  // Remove constraint with optimistic update
  const handleRemoveConstraint = useCallback(
    (constraintId: string) => {
      const current = leafRef.current;
      if (!current || saving) return;
      const updatedConstraints = current.constraints.filter((c) => c.id !== constraintId);
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints]
  );

  // Add new constraint with optimistic update
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
    [saving, handleUpdateConstraints]
  );

  // Add constraint with source sentence tracing (with optimistic update)
  const handleAddConstraintFromSource = useCallback(
    (type: 'require' | 'exclude', value: string, sourceSentenceId: string) => {
      const current = leafRef.current;
      if (!current || saving || !value.trim()) return;
      const base = {
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        value: value.trim(),
        match_mode: 'exact' as const,
        description: `Selected from sentence ${sourceSentenceId}`,
      };
      const newConstraint: Constraint =
        type === 'require'
          ? { ...base, type: 'require', source_sentence_id: sourceSentenceId }
          : { ...base, type: 'exclude', reason: `Excluded from sentence ${sourceSentenceId}` };
      const updatedConstraints = [...current.constraints, newConstraint];
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints]
  );

  // Handle user instruction update
  const handleUpdateUserInstruction = useCallback(
    async (instruction: string) => {
      const current = leafRef.current;
      if (!current) return;

      setSavingInstruction(true);
      try {
        const updatedConfig = {
          ...current.config,
          user_instruction: instruction || undefined, // Remove if empty
        };
        const updated = await updateLeaf(leafId, { config: updatedConfig });
        setLeaf(updated);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update instruction'));
      } finally {
        setSavingInstruction(false);
      }
    },
    [leafId]
  );

  // Handle model update
  const handleUpdateModel = useCallback(
    async (model: string | undefined) => {
      const current = leafRef.current;
      if (!current) return;

      setSavingModel(true);
      setModelError(null);
      try {
        const updatedConfig = {
          ...current.config,
          model: model ?? undefined,
        };
        const updated = await updateLeaf(leafId, { config: updatedConfig });
        setLeaf(updated);
      } catch (err) {
        setModelError(err instanceof Error ? err.message : 'Failed to update model');
      } finally {
        setSavingModel(false);
      }
    },
    [leafId]
  );

  // Handle generate output (with auto-validation)
  const handleGenerate = useCallback(async () => {
    if (!leaf) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const _result = await generateLeafOutput(leafId);
      // Update local leaf data with generated output + auto-validation assertions
      // The API now auto-validates and stores assertions, so re-fetch leaf to get full state
      const updatedLeaf = await getLeaf(leafId);
      setLeaf(updatedLeaf);

      // Milestone feedback: show success banner with word count
      if (updatedLeaf.output) {
        const wordCount = updatedLeaf.output.trim().split(/\s+/).length;
        setGenerateSuccessBanner(`Output ready — ${wordCount} words`);
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setGenerateSuccessBanner(null), 3000);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Generation failed';
      setGenerateError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [leaf, leafId]);

  // Handle validate output
  const handleValidate = useCallback(async () => {
    if (!leaf || !leaf.output) return;

    setIsValidating(true);
    setValidateError(null);
    setSemanticWarning(false);

    try {
      const result = await validateLeafOutput(leafId);
      // Update local leaf data with validation results
      setLeaf(result.leaf);

      // Check if any constraints use semantic matching and show warning
      const hasSemanticConstraints = leaf.constraints.some((c) => c.match_mode === 'semantic');
      if (hasSemanticConstraints) {
        setSemanticWarning(true);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Validation failed';
      setValidateError(message);
    } finally {
      setIsValidating(false);
    }
  }, [leaf, leafId]);

  // Handle export
  const handleExport = useCallback(async (format: ExportFormat) => {
    const current = leafRef.current;
    if (!current) return;

    try {
      const result = await exportLeaf(current, format);
      setExportMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });

      // Auto-clear success message after 3 seconds
      if (result.success) {
        clearTimeout(exportTimerRef.current);
        exportTimerRef.current = setTimeout(() => setExportMessage(null), 3000);
      }
    } catch {
      setExportMessage({ type: 'error', text: 'Export failed' });
    }
  }, []);

  return {
    // Core data
    leaf,
    loading,
    error,
    commitData,
    commitLoadError,
    sentences,
    semanticContent,

    // Saving states
    saving,
    savingInstruction,
    savingModel,
    modelError,

    // Generate states
    isGenerating,
    generatePhase,
    generateProgressMessages,
    generateError,
    generateSuccessBanner,

    // Validate states
    isValidating,
    validateError,
    semanticWarning,

    // Export
    exportMessage,

    // Assertion & Re-tune
    selectedAssertionIds,
    retuning,
    leafPinned,

    // Mode & Coverage
    mode,
    setMode,
    sentenceCoverage,
    sentenceConfidence,

    // Handlers
    handleUpdateConstraints,
    handleRemoveConstraint,
    handleAddConstraint,
    handleAddConstraintFromSource,
    handleUpdateUserInstruction,
    handleUpdateModel,
    handleGenerate,
    handleValidate,
    handleExport,
    toggleAssertion,
    handleRetune,

    // Error recovery
    setError,
    setLoading,
    setLeaf,
  };
}
