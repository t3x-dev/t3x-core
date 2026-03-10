'use client';

import type { Edge, Node } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_KEYWORD_THRESHOLD,
  extractPhrasesFromText,
  generateResultText,
  getMustHaveKeywordsLegacy,
  getMustntHaveKeywordsLegacy,
  type Phrase,
  type PhraseKeyword,
  type SourceBox,
} from '@/components/canvas/NodeModal/helpers';
import { useTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { useCanvasStore } from '@/store/canvasStore';
import { usePinsStore } from '@/store/pinsStore';
import type {
  AnchorCandidate,
  CanvasNodeData,
  ConfirmedAnchor,
  SourceTextBlock,
  TurnBoundary,
} from '@/types/nodes';
import {
  getMustHaveKeywords as getMustHaveKeywordsFromBlocks,
  getMustntHaveKeywords as getMustntHaveKeywordsFromBlocks,
  getSelectedText,
  tokenizeText,
} from '@/utils/tokenizer';

/**
 * Walk the canvas graph upstream from a staging node to find the nearest
 * committed unit's commitHash. Handles the case where sourceCommitHash
 * wasn't set on the node data (e.g., manual edge drag).
 */
function findUpstreamCommitHash(
  nodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[]
): string | undefined {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const stack = edges.filter((e) => e.target === nodeId).map((e) => e.source);

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = nodeMap.get(id);
    if (!n) continue;
    if (n.data.kind === 'unit' && n.data.commitStatus === 'committed' && n.data.commitHash) {
      return n.data.commitHash;
    }
    // Keep walking upstream
    for (const e of edges) {
      if (e.target === id && !visited.has(e.source)) {
        stack.push(e.source);
      }
    }
  }
  return undefined;
}

interface UsePendingCommitStateProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  onConvertDraft: (() => void) | undefined;
}

export interface UsePendingCommitStateReturn {
  // Config state
  template: string;
  setTemplate: (v: string) => void;
  cosineThreshold: number;
  setCosineThreshold: (v: number) => void;
  extractIntent: string;
  setExtractIntent: (v: string) => void;
  configLocked: boolean;
  leafConfig: api.LeafConfig | null;
  keywordsThreshold: number;
  curatePreview: api.CuratePreviewResponse | null;
  isCurateLoading: boolean;
  curateError: string | null;

  // Source state
  sourceBoxes: SourceBox[];
  textBlocks: SourceTextBlock[];
  pendingAnchors: ConfirmedAnchor[];

  // Commit state
  isCommitting: boolean;
  commitError: string | null;
  branches: api.Branch[];
  branchesLoading: boolean;
  commitSuccess: {
    commitHash: string;
    parentHash: string | null;
    diffStats: {
      sameCount: number;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
    } | null;
  } | null;
  isMainBranchInvalid: boolean;

  // Layout state
  sidebarSourceDividerPos: number;
  hoveredKeywordText: string | null;

  // Draft state
  openingAsDraft: boolean;

  // Derived values
  isMergeDraft: boolean;
  shouldShowBranchSelect: boolean;
  requireBranchName: boolean;
  allPhrases: Phrase[];
  includedPhrasesCount: number;
  mustHaveKeywordsLegacy: PhraseKeyword[];
  mustntHaveKeywordsLegacy: PhraseKeyword[];
  hasNewSourceData: boolean;
  mustHaveKeywordsNew: string[];
  mustntHaveKeywordsNew: string[];
  selectionsCount: number;
  selectedChunksCount: number;
  anchorCandidates: AnchorCandidate[];
  confirmedAnchors: ConfirmedAnchor[];
  hasSourceConversation: boolean;
  hasSourceTurnWindow: boolean;

  // Callbacks
  handleKeywordHover: (text: string | null) => void;
  handleTextBlocksChange: (updatedBlocks: SourceTextBlock[]) => void;
  handleAnchorChange: (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => void;
  handleSidebarSourceDivider: (e: React.MouseEvent) => void;
  toggleSourceBoxExpand: (boxId: string) => void;
  togglePhraseInclude: (phraseId: string) => void;
  toggleKeywordMustnt: (phraseId: string, keywordId: string) => void;
  handleProceed: () => void;
  handleReset: () => void;
  handleCommit: () => Promise<void>;
  handleSuccessClose: () => void;
  handleViewCommitDetails: () => void;
  handleCreateOutput: () => void;
  handleOpenAsDraft: () => Promise<void>;

  // Refs
  mainContentRef: React.RefObject<HTMLDivElement | null>;
  draftBodyRef: React.RefObject<HTMLDivElement | null>;
}

export function usePendingCommitState({
  node,
  onClose,
  onUpdate,
  projectId,
  onConvertDraft,
}: UsePendingCommitStateProps): UsePendingCommitStateReturn {
  const { t } = useTerminology();
  const data = node.data;

  // ========== Config state (STEP 1) ==========
  const [template, setTemplate] = useState(data.bridgePrompt || 'prose');
  const [cosineThreshold, setCosineThreshold] = useState(0.75);
  const [leafConfig, setLeafConfig] = useState<api.LeafConfig | null>(null);
  const keywordsThreshold =
    typeof leafConfig?.keyword_threshold === 'number'
      ? leafConfig.keyword_threshold
      : DEFAULT_KEYWORD_THRESHOLD;
  const [extractIntent, setExtractIntent] = useState('');
  const [curatePreview, setCuratePreview] = useState<api.CuratePreviewResponse | null>(null);
  const [previewConversationId, setPreviewConversationId] = useState<string | null>(null);
  const [isCurateLoading, setIsCurateLoading] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);
  const [configLocked, setConfigLocked] = useState(false);

  // ========== Source state ==========
  const [sourceBoxes, setSourceBoxes] = useState<SourceBox[]>([]);
  const [textBlocks, setTextBlocks] = useState<SourceTextBlock[]>(
    data.pendingSource?.textBlocks || []
  );
  const textBlocksRef = useRef(textBlocks);
  textBlocksRef.current = textBlocks;
  const pendingSourceRef = useRef(data?.pendingSource);
  pendingSourceRef.current = data?.pendingSource;
  const [pendingAnchors, setPendingAnchors] = useState<ConfirmedAnchor[]>(
    data.pendingSource?.confirmedAnchors || []
  );
  const sourceConversationIdRef = useRef<string | null>(null);

  // ========== Commit state ==========
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [branches, setBranches] = useState<api.Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<{
    commitHash: string;
    parentHash: string | null;
    diffStats: {
      sameCount: number;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
    } | null;
  } | null>(null);

  // Get main branch state from canvas store to show warning when selecting main branch
  const hasMainCommit = useCanvasStore((state) => state.hasMainCommit);
  const latestMainCommitId = useCanvasStore((state) => state.latestMainCommitId);
  // Use a targeted selector that only extracts the upstream commit hash so this
  // component does not re-render on every unrelated node/edge change.
  const upstreamCommitHash = useCanvasStore(
    useCallback(
      (s) => (node?.id ? findUpstreamCommitHash(node.id, s.nodes, s.edges) : null),
      [node?.id]
    )
  );

  // Compute whether main branch selection is invalid
  const isMainBranchInvalid = useMemo(() => {
    if (data.pendingBranch === 'branch') return false; // Not selecting main
    if (!hasMainCommit) return false; // No main commit yet, can create root

    // Try sourceCommitHash first, then fall back to reactive graph walk result
    const effectiveSourceHash = data.sourceCommitHash || upstreamCommitHash;

    if (!effectiveSourceHash) return true; // Truly no parent
    // Has parent commit: only valid if parent is HEAD of main
    return effectiveSourceHash !== latestMainCommitId;
  }, [
    data.pendingBranch,
    data.sourceCommitHash,
    hasMainCommit,
    latestMainCommitId,
    upstreamCommitHash,
  ]);

  // ========== Layout state ==========
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240);
  const [hoveredKeywordText, setHoveredKeywordText] = useState<string | null>(null);

  // ========== Refs ==========
  const mainContentRef = useRef<HTMLDivElement>(null);
  const draftBodyRef = useRef<HTMLDivElement>(null);
  const prevNodeIdRef = useRef<string | undefined>(node?.id);
  const prevSourceIdRef = useRef<string | null>(null);
  const nodeDataRef = useRef(node?.data);
  nodeDataRef.current = node?.data;
  // Tracks active drag cleanup so listeners are removed if component unmounts mid-drag
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // ========== Derived values ==========
  const isMergeDraft = data?.bridgePrompt === '/merge' && !!data?.mergeConfig;
  const shouldShowBranchSelect = !isMergeDraft;
  const requireBranchName = !isMergeDraft && data?.pendingBranch === 'branch';

  // Computed: all phrases from all source boxes (legacy system)
  const allPhrases = useMemo(() => sourceBoxes.flatMap((sb) => sb.phrases), [sourceBoxes]);

  // Computed: included phrases count (legacy)
  const includedPhrasesCount = useMemo(
    () => allPhrases.filter((p) => p.included).length,
    [allPhrases]
  );

  // Computed: must_have and mustnt_have keywords (legacy)
  const mustHaveKeywordsLegacyVal = useMemo(
    () => getMustHaveKeywordsLegacy(allPhrases),
    [allPhrases]
  );
  const mustntHaveKeywordsLegacyVal = useMemo(
    () => getMustntHaveKeywordsLegacy(allPhrases),
    [allPhrases]
  );

  // Computed: result text from included phrases (legacy)
  const resultText = useMemo(() => generateResultText(allPhrases), [allPhrases]);

  // Check if we have new-style pendingSource data
  const hasNewSourceData = textBlocks.length > 0;

  // Computed: must_have keywords from all blocks (new system)
  const mustHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap((block) =>
      getMustHaveKeywordsFromBlocks(block.tokens, block.keywords)
    );
  }, [textBlocks]);

  // Computed: mustnt_have keywords from all blocks (new system)
  const mustntHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap((block) =>
      getMustntHaveKeywordsFromBlocks(block.tokens, block.keywords)
    );
  }, [textBlocks]);

  // Computed: total selections count
  const selectionsCount = useMemo(() => {
    return textBlocks.reduce((acc, block) => acc + block.selections.length, 0);
  }, [textBlocks]);

  // Count selected chunks (for Step 1 preview display)
  const selectedChunksCount = useMemo(() => {
    if (!curatePreview) return 0;
    return curatePreview.chunks.filter((c) => c.selected).length;
  }, [curatePreview]);

  // Convert anchor candidates from API format (snake_case) to UI format (camelCase)
  const anchorCandidates = useMemo((): AnchorCandidate[] => {
    if (!curatePreview?.anchor_candidates) return [];
    return api.parseApiAnchorCandidates(curatePreview.anchor_candidates);
  }, [curatePreview?.anchor_candidates]);

  // Extract confirmed anchors from committed commit data
  const committedAnchors = useMemo((): ConfirmedAnchor[] => {
    if (!data?.anchors?.sentences) return [];
    return data.anchors.sentences.flatMap((sentence) => sentence.anchors);
  }, [data?.anchors]);

  // Merge committed anchors with pending (user-confirmed during this session)
  const confirmedAnchors = useMemo((): ConfirmedAnchor[] => {
    if (pendingAnchors.length === 0) return committedAnchors;
    if (committedAnchors.length === 0) return pendingAnchors;
    const pendingIds = new Set(pendingAnchors.map((a) => a.id));
    const merged = [...pendingAnchors, ...committedAnchors.filter((a) => !pendingIds.has(a.id))];
    return merged;
  }, [committedAnchors, pendingAnchors]);

  const hasSourceConversation = !!data?.sourceConversationId || !!data?.conversationId;
  const hasSourceTurnWindow = !!data?.sourceTurnWindow;

  // ========== Callbacks ==========

  const handleKeywordHover = useCallback((text: string | null) => {
    setHoveredKeywordText(text);
  }, []);

  // Persist text block edits (selections/keywords) back to canvas store
  const handleTextBlocksChange = useCallback(
    (updatedBlocks: SourceTextBlock[]) => {
      setTextBlocks(updatedBlocks);
      const existingPendingSource = pendingSourceRef.current;
      onUpdate({
        pendingSource: {
          textBlocks: updatedBlocks,
          confirmedAnchors: existingPendingSource?.confirmedAnchors,
          inputTextHash: existingPendingSource?.inputTextHash,
          sentences: existingPendingSource?.sentences,
        },
      });
    },
    [onUpdate]
  );

  // Handle anchor change from user interaction (click to confirm/toggle/remove)
  const handleAnchorChange = useCallback(
    (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => {
      setPendingAnchors((prev) => {
        let newAnchors: ConfirmedAnchor[];
        switch (action) {
          case 'add':
            if (prev.some((a) => a.id === anchor.id)) {
              newAnchors = prev.map((a) => (a.id === anchor.id ? anchor : a));
            } else {
              newAnchors = [...prev, anchor];
            }
            break;
          case 'remove':
            newAnchors = prev.filter((a) => a.id !== anchor.id);
            break;
          case 'update':
            newAnchors = prev.map((a) => (a.id === anchor.id ? anchor : a));
            break;
          default:
            newAnchors = prev;
        }
        // Sync to pendingSource for persistence (read from ref to avoid stale closure)
        const existingPendingSource = pendingSourceRef.current;
        onUpdate({
          pendingSource: {
            textBlocks: textBlocksRef.current,
            confirmedAnchors: newAnchors,
            inputTextHash: existingPendingSource?.inputTextHash,
            sentences: existingPendingSource?.sentences,
          },
        });
        return newAnchors;
      });
    },
    [onUpdate]
  );

  // Cleanup drag listeners on unmount to avoid orphaned document event handlers
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  // Sidebar | SOURCE divider handler
  const handleSidebarSourceDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftBodyRef.current) return;
      const rect = draftBodyRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      // Min 220px to ensure Branch Name input is fully visible
      setSidebarSourceDividerPos(Math.max(220, Math.min(400, newWidth)));
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      cleanup();
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Toggle source box expansion
  const toggleSourceBoxExpand = useCallback((boxId: string) => {
    setSourceBoxes((prev) =>
      prev.map((sb) => (sb.id === boxId ? { ...sb, expanded: !sb.expanded } : sb))
    );
  }, []);

  // Toggle phrase include/exclude (only in Step 2 when configLocked)
  const togglePhraseInclude = useCallback(
    (phraseId: string) => {
      if (!configLocked) return;

      setSourceBoxes((prev) =>
        prev.map((sb) => ({
          ...sb,
          phrases: sb.phrases.map((p) => (p.id === phraseId ? { ...p, included: !p.included } : p)),
        }))
      );
    },
    [configLocked]
  );

  // Toggle keyword must/mustnt (only when parent phrase is included)
  const toggleKeywordMustnt = useCallback(
    (phraseId: string, keywordId: string) => {
      if (!configLocked) return;

      setSourceBoxes((prev) =>
        prev.map((sb) => ({
          ...sb,
          phrases: sb.phrases.map((p) => {
            if (p.id !== phraseId || !p.included) return p;
            return {
              ...p,
              keywords: p.keywords.map((kw) =>
                kw.id === keywordId ? { ...kw, isMustnt: !kw.isMustnt } : kw
              ),
            };
          }),
        }))
      );
    },
    [configLocked]
  );

  // Handle Proceed - lock Step 1 config and enable Step 2 editing
  const handleProceed = useCallback(() => {
    if (textBlocks.length === 0 && sourceBoxes.length === 0) return;
    setConfigLocked(true);
  }, [textBlocks, sourceBoxes]);

  // Handle Reset - unlock Step 1 config and reset phrases/anchors to default
  const handleReset = useCallback(() => {
    setConfigLocked(false);
    setSourceBoxes((prev) =>
      prev.map((sb) => ({
        ...sb,
        phrases: extractPhrasesFromText(sb.content, sb.id, keywordsThreshold),
      }))
    );
    setPendingAnchors([]);
    const existingPendingSource = pendingSourceRef.current;
    onUpdate({
      pendingSource: {
        textBlocks: textBlocksRef.current,
        confirmedAnchors: [],
        inputTextHash: existingPendingSource?.inputTextHash,
        sentences: existingPendingSource?.sentences,
      },
    });
  }, [keywordsThreshold, onUpdate]);

  // Handle Commit - create commit via API
  const handleCommit = useCallback(async () => {
    if (!projectId || !data) {
      setCommitError('No project selected');
      return;
    }

    const sourceUnitBlock = textBlocks.find((block) => block.sourceNodeType === 'unit');

    setIsCommitting(true);
    setCommitError(null);

    try {
      let startTurnHash: string;
      let endTurnHash: string;

      const unitBlockConversationId = sourceUnitBlock?.sourceNodeId?.startsWith('conv_')
        ? sourceUnitBlock.sourceNodeId
        : null;
      const sourceConversationId =
        unitBlockConversationId || data.sourceConversationId || data.conversationId;
      if (sourceConversationId) {
        const turnsResponse = await api.listTurns(projectId, sourceConversationId);
        const turns = turnsResponse.turns;

        if (turns.length === 0) {
          setCommitError('Conversation has no turns');
          setIsCommitting(false);
          return;
        }

        startTurnHash = turns[0].turn_hash;
        endTurnHash = turns[turns.length - 1].turn_hash;
      } else if (data.sourceTurnWindow) {
        startTurnHash = data.sourceTurnWindow.start_turn_hash;
        endTurnHash = data.sourceTurnWindow.end_turn_hash;
      } else {
        setCommitError('Cannot commit: no source conversation or turn window available.');
        setIsCommitting(false);
        return;
      }

      // Determine branch
      let branch: string;
      if (data.pendingBranch === 'branch') {
        branch = data.pendingBranchName?.trim() || `branch-${Date.now()}`;
      } else {
        branch = 'main';
      }

      // Validate: main branch must be a linear chain
      // - If no parent (root commit): only allow if no main commit exists yet
      // - If has parent: only allow if parent is the latest main commit (HEAD of main)
      if (branch === 'main') {
        const { hasMainCommit, latestMainCommitId } = useCanvasStore.getState();
        if (!data.sourceCommitHash) {
          // Root commit: check if main branch already has a root
          if (hasMainCommit) {
            setCommitError(
              'A root commit on main branch already exists. Please select a different branch.'
            );
            setIsCommitting(false);
            return;
          }
        } else {
          // Child commit: parent must be the latest main commit (HEAD)
          if (hasMainCommit && data.sourceCommitHash !== latestMainCommitId) {
            setCommitError(
              'Can only extend main branch from its latest commit. Please select a different branch or create a new branch.'
            );
            setIsCommitting(false);
            return;
          }
        }
      }

      // Collect user selections
      let _sourceExcerpt: string[] = [];
      let _mustHave: string[] = [];
      let _mustntHave: string[] = [];

      if (textBlocks.length > 0) {
        _sourceExcerpt = textBlocks
          .map((block) => getSelectedText(block.tokens, block.selections))
          .filter((text) => text.length > 0);
        _mustHave = [...mustHaveKeywordsNew];
        _mustntHave = [...mustntHaveKeywordsNew];
      } else {
        _sourceExcerpt = allPhrases.filter((p) => p.included).map((p) => p.text);
        _mustHave = mustHaveKeywordsLegacyVal.map((kw) => kw.text);
        _mustntHave = mustntHaveKeywordsLegacyVal.map((kw) => kw.text);
      }

      // Create branch if needed
      if (branch !== 'main' && !branches.some((b) => b.name === branch)) {
        try {
          await api.createBranch(projectId, branch, 'main', undefined, false);
        } catch (branchErr) {
          const errMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
          if (!errMsg.includes('already exists')) {
            throw branchErr;
          }
        }
      }

      // Build source_refs from all upstream source nodes
      const sourceRefs: api.SourceRef[] = [];

      if (sourceConversationId) {
        sourceRefs.push({
          type: 'conversation',
          conversation_id: sourceConversationId,
          turn_window: { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
        });
      } else if (data.sourceCommitHash) {
        sourceRefs.push({
          type: 'commit',
          commit_hash: data.sourceCommitHash,
        });
      }

      // Additional sources from textBlocks (for multi-source commits)
      if (textBlocks.length > 0) {
        for (const block of textBlocks) {
          if (block.sourceNodeId && block.sourceNodeId !== sourceConversationId) {
            if (block.sourceNodeId.startsWith('conv_')) {
              sourceRefs.push({
                type: 'conversation',
                conversation_id: block.sourceNodeId,
              });
            } else if (block.sourceNodeId.startsWith('sha256:')) {
              sourceRefs.push({
                type: 'commit',
                commit_hash: block.sourceNodeId,
              });
            }
          }
        }
      }

      // Build CommitAnchors from pendingSource (v1.1)
      let _anchorsParam: api.ApiCommitAnchors | undefined;
      const pendingSource = data.pendingSource;

      if (pendingSource?.inputTextHash && pendingSource?.sentences && pendingAnchors.length > 0) {
        const sentencesWithAnchors: api.ApiSentenceWithAnchors[] = pendingSource.sentences.map(
          (sentence) => {
            const sentenceAnchors = pendingAnchors.filter((anchor) => {
              const anchorStart = anchor.globalStart ?? anchor.start;
              const anchorEnd = anchor.globalEnd ?? anchor.end;
              return anchorStart >= sentence.start && anchorEnd <= sentence.end;
            });

            const apiAnchors: api.ApiConfirmedAnchor[] = sentenceAnchors.map((anchor) => ({
              id: anchor.id,
              text: anchor.text,
              start: (anchor.globalStart ?? anchor.start) - sentence.start,
              end: (anchor.globalEnd ?? anchor.end) - sentence.start,
              type: anchor.type as api.ApiAnchorType,
              constraint: (anchor.constraint === 'mustHave'
                ? 'must_have'
                : anchor.constraint === 'mustntHave'
                  ? 'mustnt_have'
                  : anchor.constraint) as api.ApiAnchorConstraint,
            }));

            return {
              sentence_id: sentence.id,
              text: sentence.text,
              start_char: sentence.start,
              end_char: sentence.end,
              anchors: apiAnchors,
            };
          }
        );

        const nonEmptySentences = sentencesWithAnchors.filter((s) => s.anchors.length > 0);

        if (nonEmptySentences.length > 0) {
          _anchorsParam = {
            input_text_hash: pendingSource.inputTextHash,
            sentences: nonEmptySentences,
          };
        }
      }

      // Create Commit (V4 format)
      const currentPosition = node?.position;
      let commitHash: string;

      if (pendingSource?.sentences && pendingSource.sentences.length > 0) {
        const v4Sentences: api.CommitV4Sentence[] = pendingSource.sentences.map((sentence) => ({
          id: sentence.id,
          text: sentence.text,
          source_ref: {
            conversation_id: sourceConversationId || '',
            turn_hash: sentence.turn_hash || endTurnHash,
            start_char: sentence.turn_start ?? sentence.start,
            end_char: sentence.turn_end ?? sentence.end,
          },
        }));

        // Determine parent commits for the DAG
        const parentCommits: string[] = [];
        if (data.sourceCommitHash) {
          parentCommits.push(data.sourceCommitHash);
        }

        // Build complete source_refs from all pinned sources (conversations + leaves)
        const commitSourceRefs: api.CommitV4SourceRef[] = [];
        const seenRefIds = new Set<string>();

        if (sourceConversationId) {
          seenRefIds.add(sourceConversationId);
          commitSourceRefs.push({ type: 'conversation', id: sourceConversationId });
        }
        for (const block of textBlocks) {
          if (block.sourceNodeId?.startsWith('conv_') && !seenRefIds.has(block.sourceNodeId)) {
            seenRefIds.add(block.sourceNodeId);
            commitSourceRefs.push({ type: 'conversation', id: block.sourceNodeId });
          }
        }

        // Collect all pinned sources (conversations + leaves)
        const currentPins = usePinsStore.getState().pins;
        for (const pin of currentPins) {
          if (!seenRefIds.has(pin.ref_id)) {
            seenRefIds.add(pin.ref_id);
            commitSourceRefs.push({ type: pin.type, id: pin.ref_id });
          }
        }

        // Fetch semantic draft (frame data) from conversation's delta log
        let semanticContent: import('@t3x/core').SemanticContent | undefined;
        if (sourceConversationId) {
          try {
            const draft = await api.getSemanticDraft(sourceConversationId);
            if (draft && draft.frames.length > 0) {
              semanticContent = draft;
            }
          } catch {
            // No semantic data available, proceed without
          }
        }

        const commitV4 = await api.createCommitV4(projectId, v4Sentences, {
          branch,
          message: data.title,
          parents: parentCommits,
          position: currentPosition ? { x: currentPosition.x, y: currentPosition.y } : undefined,
          source_refs: commitSourceRefs.length > 0 ? commitSourceRefs : undefined,
          semantic: semanticContent,
        });

        commitHash = commitV4.hash;
      } else {
        throw new Error(
          'Cannot create commit: no sentence data available. Ensure the source has been curated with NLP extraction enabled.'
        );
      }

      // Fetch diff stats if there's a parent commit
      const parentHash = data.sourceCommitHash || null;
      let diffStats: {
        sameCount: number;
        addedCount: number;
        removedCount: number;
        modifiedCount: number;
      } | null = null;
      if (parentHash) {
        try {
          const rawDiff = await api.diffRaw(parentHash, commitHash);
          diffStats = {
            sameCount: rawDiff.stats.sameCount,
            addedCount: rawDiff.stats.addedCount,
            removedCount: rawDiff.stats.removedCount,
            modifiedCount: rawDiff.stats.modifiedCount,
          };
        } catch {
          // Diff fetch failure is non-critical, continue
        }
      }

      // Update local node ID to match API commit_hash.
      // Re-read the current node ID from the store rather than using the stale
      // closure value: by the time the async API call resolves, the canvas may
      // have already reassigned the node's ID (e.g. a concurrent update).
      if (commitHash) {
        const freshNode = useCanvasStore.getState().nodes.find((n) => n.id === node.id);
        const liveNodeId = freshNode?.id ?? node.id;
        useCanvasStore.getState().updateNodeId(liveNodeId, commitHash);
      }

      // Update local state with final values
      onUpdate({
        summary: resultText,
        bridgePrompt: template,
        isGenerated: true,
        commitHash: commitHash,
      });

      // Show success page (defer loadProjectData until user dismisses celebration)
      setCommitSuccess({ commitHash, parentHash, diffStats });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setCommitError(error.message);
    } finally {
      setIsCommitting(false);
    }
  }, [
    projectId,
    node,
    data,
    template,
    resultText,
    onUpdate,
    textBlocks,
    allPhrases,
    mustHaveKeywordsNew,
    mustntHaveKeywordsNew,
    mustHaveKeywordsLegacyVal,
    mustntHaveKeywordsLegacyVal,
    branches,
    pendingAnchors,
  ]);

  // ========== Effects ==========

  // Load Leaf config when there's an associated Leaf
  useEffect(() => {
    const leaves = node?.data?.leaves;
    if (!leaves || leaves.length === 0) {
      setLeafConfig(null);
      return;
    }

    const leafId = leaves[0].id;

    const loadLeafConfig = async () => {
      try {
        const leaf = await api.getLeaf(leafId);
        setLeafConfig(leaf.config);
      } catch (_err) {
        setLeafConfig(null);
      }
    };

    loadLeafConfig();
  }, [node?.data?.leaves]);

  // Load branches from API when opening pending commit modal
  useEffect(() => {
    if (!projectId) return;

    const loadBranches = async () => {
      setBranchesLoading(true);
      try {
        const response = await api.listBranches(projectId);
        setBranches(response.branches);
      } catch (_err) {
        setBranches([]);
      } finally {
        setBranchesLoading(false);
      }
    };

    loadBranches();
  }, [projectId]);

  // Initialize source boxes (legacy) from baseline summary
  useEffect(() => {
    if (data?.baselineSummary) {
      const draftPrefix = `${t('draft_from')} `;
      const sourceTitle = `Unit \u2013 ${data.title?.replace(draftPrefix, '') || 'Source'}`;

      const initialBox: SourceBox = {
        id: 'source-1',
        title: sourceTitle,
        type: 'unit',
        content: data.baselineSummary,
        expanded: true,
        phrases: extractPhrasesFromText(data.baselineSummary, 'source-1', keywordsThreshold),
      };

      setSourceBoxes([initialBox]);
    }
  }, [data?.baselineSummary, data?.title, data?.sourceConversationId, keywordsThreshold]);

  // Build textBlocks from own conversation (API turns) or baselineSummary fallback
  useEffect(() => {
    if (!node?.id || !projectId) return;

    const buildTextBlocks = async () => {
      const ownConversationId = data?.conversationId || data?.sourceConversationId;
      if (!ownConversationId) {
        setTextBlocks([]);
        return;
      }

      // Helper: build a textBlock from raw text
      const buildFromRawText = (fullText: string, title: string) => {
        const tokens = tokenizeText(fullText);
        // Use ref to avoid capturing a stale textBlocks value in this async closure
        const existingBlock = textBlocksRef.current.find(
          (b) => b.sourceNodeId === ownConversationId
        );
        setTextBlocks([
          {
            id: `block-self-${ownConversationId}`,
            originalText: fullText,
            tokens,
            selections: existingBlock?.selections || [],
            keywords: existingBlock?.keywords || [],
            sourceNodeId: ownConversationId,
            sourceNodeType: 'unit',
            sourceNodeTitle: title,
          },
        ]);
      };

      try {
        const turnsData = await api.listTurns(projectId, ownConversationId);
        if (turnsData.turns && turnsData.turns.length > 0) {
          const textParts: string[] = [];
          for (let i = 0; i < turnsData.turns.length; i++) {
            const turn = turnsData.turns[i];
            textParts.push(`[${turn.role}]: ${turn.content}`);
          }
          const fullText = textParts.join('\n\n');
          const tokens = tokenizeText(fullText);

          // Initialize extractIntent with first user message (if not already set)
          if (!extractIntent) {
            const firstUserTurn = turnsData.turns.find((t) => t.role === 'user');
            if (firstUserTurn) {
              const truncated = firstUserTurn.content.slice(0, 100);
              setExtractIntent(truncated + (firstUserTurn.content.length > 100 ? '...' : ''));
            }
          }

          // Build turn boundaries based on [role]: content\n\n format
          const turnBoundaries: TurnBoundary[] = [];
          let currentTokenIndex = 0;

          for (let i = 0; i < turnsData.turns.length; i++) {
            const turn = turnsData.turns[i];
            const turnText = `[${turn.role}]: ${turn.content}`;
            const turnTokens = tokenizeText(turnText);
            const turnTokenCount = turnTokens.length;

            if (turnTokenCount > 0) {
              turnBoundaries.push({
                role: turn.role as 'user' | 'assistant',
                startTokenIndex: currentTokenIndex,
                endTokenIndex: currentTokenIndex + turnTokenCount - 1,
              });
            }
            const separatorTokens = i < turnsData.turns.length - 1 ? 2 : 0;
            currentTokenIndex += turnTokenCount + separatorTokens;
          }

          // Try to preserve existing selections for this block
          // Use ref to avoid stale closure over textBlocks from the effect's capture point
          const existingBlock = textBlocksRef.current.find(
            (b) => b.sourceNodeId === ownConversationId
          );

          setTextBlocks([
            {
              id: `block-self-${ownConversationId}`,
              originalText: fullText,
              tokens,
              selections: existingBlock?.selections || [],
              keywords: existingBlock?.keywords || [],
              sourceNodeId: ownConversationId,
              sourceNodeType: 'unit',
              sourceNodeTitle: data?.title || 'Current Conversation',
              turnBoundaries,
            },
          ]);
        } else if (data?.baselineSummary) {
          // API returned no turns — use baselineSummary as fallback
          buildFromRawText(data.baselineSummary, data?.title || 'Current Conversation');
        } else {
          setTextBlocks([]);
        }
      } catch (_err) {
        // API call failed — use baselineSummary if available
        if (data?.baselineSummary) {
          buildFromRawText(data.baselineSummary, data?.title || 'Current Conversation');
        } else {
          setTextBlocks([]);
        }
      }
    };

    buildTextBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    node?.id,
    projectId,
    data?.conversationId,
    data?.sourceConversationId,
    data?.baselineSummary,
  ]);

  // Reinitialize state when node changes
  useEffect(() => {
    if (prevNodeIdRef.current !== node?.id) {
      const newAnchors = node?.data?.pendingSource?.confirmedAnchors || [];
      setPendingAnchors(newAnchors);

      setCuratePreview(null);
      setPreviewConversationId(null);
      setCurateError(null);

      prevNodeIdRef.current = node?.id;
      const newSourceId = data?.sourceConversationId || data?.conversationId || null;
      prevSourceIdRef.current = newSourceId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, data?.sourceConversationId, data?.conversationId]);

  // Clear curate state and pending anchors when conversation changes
  useEffect(() => {
    const newSourceId = data?.sourceConversationId || data?.conversationId || null;
    const sourceChanged =
      prevSourceIdRef.current !== null && prevSourceIdRef.current !== newSourceId;

    sourceConversationIdRef.current = newSourceId;

    if (sourceChanged) {
      setCuratePreview(null);
      setPreviewConversationId(null);
      setCurateError(null);
      setPendingAnchors([]);
      const currentPendingSource = nodeDataRef.current?.pendingSource;
      if (currentPendingSource?.confirmedAnchors?.length) {
        onUpdate({
          pendingSource: {
            ...currentPendingSource,
            confirmedAnchors: [],
          },
        });
      }
    }

    prevSourceIdRef.current = newSourceId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, data?.conversationId, data?.sourceConversationId, onUpdate]);

  // Debounced curate preview call when intent or cosine slider changes
  useEffect(() => {
    if (configLocked) return;
    if (!extractIntent.trim()) return;

    const sourceConversationId = data?.sourceConversationId || data?.conversationId;
    if (!projectId || !sourceConversationId) return;

    sourceConversationIdRef.current = sourceConversationId;

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsCurateLoading(true);
      setCurateError(null);

      try {
        // Build source_text fallback from local textBlocks (in case turns aren't in the DB)
        const localSourceText =
          textBlocksRef.current.length > 0
            ? textBlocksRef.current.map((b) => b.originalText).join('\n\n')
            : undefined;

        const response = await api.curatePreview(
          {
            project_id: projectId,
            source_conversation_id: sourceConversationId,
            bridge_id: template as api.BridgeTemplate,
            intent: extractIntent,
            cosine: cosineThreshold,
            unit_title: typeof data?.title === 'string' ? data.title : undefined,
            // Provide source_text as fallback — API uses source_conversation_id first,
            // falls back to source_text if conversation has no turns
            source_text: localSourceText,
          },
          controller.signal
        );

        if (sourceConversationIdRef.current !== sourceConversationId) return;

        setCuratePreview(response);
        setPreviewConversationId(sourceConversationId);
      } catch (err) {
        if (err instanceof api.ApiError && err.code === 'ABORTED') return;
        const message = err instanceof Error ? err.message : 'Failed to get curate preview';
        setCurateError(message);
      } finally {
        setIsCurateLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    projectId,
    data?.sourceConversationId,
    data?.conversationId,
    data?.title,
    extractIntent,
    template,
    cosineThreshold,
    configLocked,
  ]);

  // Auto-convert curate chunks to textBlocks.selections
  const currentSourceConversationId = data?.sourceConversationId || data?.conversationId;
  useEffect(() => {
    if (configLocked) return;
    if (!curatePreview) return;

    if (previewConversationId !== currentSourceConversationId) return;

    const sourceText = curatePreview.source_text;
    if (!sourceText || sourceText.trim().length === 0) return;

    const tokens = tokenizeText(sourceText);
    if (tokens.length === 0) return;

    // Build selections from selected chunks
    const newSelections: Array<{
      id: string;
      startIndex: number;
      endIndex: number;
      type: 'include' | 'exclude';
    }> = [];

    for (const chunk of curatePreview.chunks) {
      if (!chunk.selected) continue;

      const chunkTokens = tokens.filter(
        (token) => token.charStart < chunk.end && token.charEnd > chunk.start
      );

      if (chunkTokens.length > 0) {
        const startIndex = chunkTokens[0].index;
        const endIndex = chunkTokens[chunkTokens.length - 1].index;

        newSelections.push({
          id: `curate-${chunk.id}`,
          startIndex,
          endIndex,
          type: 'include',
        });
      }
    }

    const currentTextBlocks = textBlocksRef.current;
    const existingBlock = currentTextBlocks[0];

    const textChanged = existingBlock?.originalText !== sourceText;
    const currentSelectionIds =
      existingBlock?.selections
        ?.map((s) => `${s.startIndex}-${s.endIndex}`)
        .sort()
        .join(',') ?? '';
    const newSelectionIds = newSelections
      .map((s) => `${s.startIndex}-${s.endIndex}`)
      .sort()
      .join(',');
    const selectionsChanged = currentSelectionIds !== newSelectionIds;

    if (textChanged || selectionsChanged) {
      const updatedBlock: SourceTextBlock = {
        id: existingBlock?.id ?? 'block-conv-1',
        originalText: sourceText,
        tokens,
        selections: newSelections,
        keywords: textChanged
          ? []
          : (existingBlock?.keywords ?? []).filter((kw) =>
              newSelections.some(
                (sel) => kw.tokenIndex >= sel.startIndex && kw.tokenIndex <= sel.endIndex
              )
            ),
        sourceNodeId: existingBlock?.sourceNodeId,
        sourceNodeType: existingBlock?.sourceNodeType,
        sourceNodeTitle: existingBlock?.sourceNodeTitle,
        turnBoundaries: undefined,
      };
      setTextBlocks([updatedBlock]);

      const existingPendingSource = data?.pendingSource;
      const preserveAnchors =
        !textChanged &&
        existingPendingSource?.inputTextHash === curatePreview.input_text_hash &&
        existingPendingSource?.confirmedAnchors;

      if (!preserveAnchors) {
        setPendingAnchors([]);
      }

      onUpdate({
        pendingSource: {
          textBlocks: [updatedBlock],
          confirmedAnchors: preserveAnchors ? existingPendingSource.confirmedAnchors : [],
          inputTextHash: curatePreview.input_text_hash,
          sentences: curatePreview.chunks.map((chunk) => ({
            id: chunk.id,
            text: chunk.text,
            start: chunk.start,
            end: chunk.end,
            turn_hash: chunk.turn_hash,
            turn_start: chunk.turn_start,
            turn_end: chunk.turn_end,
          })),
        },
      });
    }
  }, [
    curatePreview,
    configLocked,
    previewConversationId,
    currentSourceConversationId,
    data?.pendingSource,
    onUpdate,
  ]);

  // ========== B-7: Handle success page actions ==========
  const handleSuccessClose = useCallback(() => {
    // Refresh canvas data now that user has seen the celebration
    useCanvasStore.getState().loadProjectData(projectId);
    onClose();
  }, [projectId, onClose]);

  const handleViewCommitDetails = useCallback(() => {
    useCanvasStore.getState().loadProjectData(projectId);
    onConvertDraft?.();
  }, [projectId, onConvertDraft]);

  const handleCreateOutput = useCallback(() => {
    useCanvasStore.getState().loadProjectData(projectId);
    onConvertDraft?.();
    // Open leaf panel after canvas state is updated
    if (node?.id) {
      queueMicrotask(() => {
        useCanvasStore.getState().openLeafPanel(commitSuccess?.commitHash || node.id);
      });
    }
  }, [projectId, onConvertDraft, node?.id, commitSuccess?.commitHash]);

  // ========== B-8: Open as Draft ==========
  const [openingAsDraft, setOpeningAsDraft] = useState(false);

  const handleOpenAsDraft = useCallback(async () => {
    setOpeningAsDraft(true);
    try {
      // Collect sentences from the current staging
      const draftSentences: api.DraftSentence[] = [];

      if (hasNewSourceData) {
        // New system: extract from textBlocks selections
        const sourceConvId = data.sourceConversationId || data.conversationId || '';
        for (const block of textBlocks) {
          const text = getSelectedText(block.tokens, block.selections);
          if (text.trim()) {
            draftSentences.push({
              id: `ds_${Math.random().toString(36).slice(2, 14)}`,
              text: text.trim(),
              origin: { type: 'selected' },
              source: {
                conversation_id: sourceConvId,
                turn_hash: '',
                role: 'user',
                start_char: 0,
                end_char: text.trim().length,
              },
              position: draftSentences.length,
              included: true,
            });
          }
        }
      } else {
        // Legacy system: extract from allPhrases
        for (const phrase of allPhrases.filter((p) => p.included)) {
          draftSentences.push({
            id: `ds_${Math.random().toString(36).slice(2, 14)}`,
            text: phrase.text,
            origin: { type: 'selected' },
            position: draftSentences.length,
            included: true,
          });
        }
      }

      const newDraft = await api.createDraftV3({
        project_id: projectId,
        title: data.title || t('draft_from_canvas'),
        parent_commit_hash: data.sourceCommitHash || undefined,
        target_branch:
          data.pendingBranch === 'branch' ? data.pendingBranchName || 'branch' : 'main',
      });

      if (draftSentences.length > 0) {
        await api.updateDraftV3(newDraft.id, {
          sentences: draftSentences,
          if_revision: 1,
        });
      }

      // Navigate to draft page
      const routeProject = data.projectId || projectId;
      window.location.href = `/project/${routeProject}/draft/${newDraft.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setOpeningAsDraft(false);
    }
  }, [projectId, data, hasNewSourceData, textBlocks, allPhrases]);

  return {
    // Config state
    template,
    setTemplate,
    cosineThreshold,
    setCosineThreshold,
    extractIntent,
    setExtractIntent,
    configLocked,
    leafConfig,
    keywordsThreshold,
    curatePreview,
    isCurateLoading,
    curateError,

    // Source state
    sourceBoxes,
    textBlocks,
    pendingAnchors,

    // Commit state
    isCommitting,
    commitError,
    branches,
    branchesLoading,
    commitSuccess,
    isMainBranchInvalid,

    // Layout state
    sidebarSourceDividerPos,
    hoveredKeywordText,

    // Draft state
    openingAsDraft,

    // Derived values
    isMergeDraft,
    shouldShowBranchSelect,
    requireBranchName,
    allPhrases,
    includedPhrasesCount,
    mustHaveKeywordsLegacy: mustHaveKeywordsLegacyVal,
    mustntHaveKeywordsLegacy: mustntHaveKeywordsLegacyVal,
    hasNewSourceData,
    mustHaveKeywordsNew,
    mustntHaveKeywordsNew,
    selectionsCount,
    selectedChunksCount,
    anchorCandidates,
    confirmedAnchors,
    hasSourceConversation,
    hasSourceTurnWindow,

    // Callbacks
    handleKeywordHover,
    handleTextBlocksChange,
    handleAnchorChange,
    handleSidebarSourceDivider,
    toggleSourceBoxExpand,
    togglePhraseInclude,
    toggleKeywordMustnt,
    handleProceed,
    handleReset,
    handleCommit,
    handleSuccessClose,
    handleViewCommitDetails,
    handleCreateOutput,
    handleOpenAsDraft,

    // Refs
    mainContentRef,
    draftBodyRef,
  };
}
