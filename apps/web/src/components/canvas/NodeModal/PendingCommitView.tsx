'use client';

import type { Node } from '@xyflow/react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Loader2,
  Lock,
  MessageSquarePlus,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
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
import { PendingSourceEditor } from '../SelectableTextBlock';
import {
  bridgeTemplates,
  DEFAULT_KEYWORD_THRESHOLD,
  extractPhrasesFromText,
  generateResultText,
  getMustHaveKeywordsLegacy,
  getMustntHaveKeywordsLegacy,
  renderPhraseWithKeywords,
  type SourceBox,
} from './helpers';
import type { NodeQuickAction } from './NodeModal';

interface PendingCommitViewProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  routeProjectId: string | undefined;
  onConvertDraft: (() => void) | undefined;
  onBranchChange: ((branch: 'main' | 'branch') => void) | undefined;
  onBranchNameChange: ((name: string) => void) | undefined;
  quickActions: NodeQuickAction[] | undefined;
  onHideCommitConfig: () => void;
}

export function PendingCommitView({
  node,
  onClose,
  onUpdate,
  projectId,
  onConvertDraft,
  onBranchChange,
  onBranchNameChange,
  quickActions: _quickActions,
}: PendingCommitViewProps) {
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

  // Compute whether main branch selection is invalid
  const isMainBranchInvalid = useMemo(() => {
    if (data.pendingBranch === 'branch') return false; // Not selecting main
    if (!hasMainCommit) return false; // No main commit yet, can create root
    if (!data.sourceCommitHash) return true; // Has main commit but trying to create another root
    // Has parent commit: only valid if parent is HEAD of main
    return data.sourceCommitHash !== latestMainCommitId;
  }, [data.pendingBranch, data.sourceCommitHash, hasMainCommit, latestMainCommitId]);

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
  const mustHaveKeywordsLegacy = useMemo(() => getMustHaveKeywordsLegacy(allPhrases), [allPhrases]);
  const mustntHaveKeywordsLegacy = useMemo(
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
      const existingPendingSource = node?.data?.pendingSource;
      onUpdate({
        pendingSource: {
          textBlocks: updatedBlocks,
          confirmedAnchors: existingPendingSource?.confirmedAnchors,
          inputTextHash: existingPendingSource?.inputTextHash,
          sentences: existingPendingSource?.sentences,
        },
      });
    },
    [onUpdate, node?.data?.pendingSource]
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
        // Sync to pendingSource for persistence
        const existingPendingSource = node?.data?.pendingSource;
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
    [onUpdate, node?.data?.pendingSource]
  );

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

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

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
    const existingPendingSource = node?.data?.pendingSource;
    onUpdate({
      pendingSource: {
        textBlocks: textBlocksRef.current,
        confirmedAnchors: [],
        inputTextHash: existingPendingSource?.inputTextHash,
        sentences: existingPendingSource?.sentences,
      },
    });
  }, [keywordsThreshold, onUpdate, node?.data?.pendingSource]);

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
        _mustHave = mustHaveKeywordsLegacy.map((kw) => kw.text);
        _mustntHave = mustntHaveKeywordsLegacy.map((kw) => kw.text);
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

        const commitV4 = await api.createCommitV4(projectId, v4Sentences, {
          branch,
          message: data.title,
          parents: parentCommits,
          position: currentPosition ? { x: currentPosition.x, y: currentPosition.y } : undefined,
          source_refs: commitSourceRefs.length > 0 ? commitSourceRefs : undefined,
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

      // Update local node ID to match API commit_hash
      if (node && commitHash) {
        useCanvasStore.getState().updateNodeId(node.id, commitHash);
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
    mustHaveKeywordsLegacy,
    mustntHaveKeywordsLegacy,
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
      const sourceTitle = `Unit \u2013 ${data.title?.replace('Draft from ', '') || 'Source'}`;

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

  // Build textBlocks from own conversation
  useEffect(() => {
    if (!node?.id || !projectId) return;

    const buildTextBlocks = async () => {
      const ownConversationId = data?.conversationId || data?.sourceConversationId;
      if (!ownConversationId) {
        setTextBlocks([]);
        return;
      }

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
          const existingBlock = textBlocks.find((b) => b.sourceNodeId === ownConversationId);

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
        } else {
          setTextBlocks([]);
        }
      } catch (_err) {
        setTextBlocks([]);
      }
    };

    buildTextBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, projectId, data?.conversationId, data?.sourceConversationId]);

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
        const response = await api.curatePreview(
          {
            project_id: projectId,
            source_conversation_id: sourceConversationId,
            bridge_id: template as api.BridgeTemplate,
            intent: extractIntent,
            cosine: cosineThreshold,
            unit_title: typeof data?.title === 'string' ? data.title : undefined,
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
    // Open leaf panel after a tick so canvas state is updated
    if (node?.id) {
      setTimeout(() => {
        useCanvasStore.getState().openLeafPanel(commitSuccess?.commitHash || node.id);
      }, 100);
    }
  }, [projectId, onConvertDraft, node?.id, commitSuccess?.commitHash]);

  // ========== JSX ==========

  // B-7: Commit success page
  if (commitSuccess) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
        role="dialog"
        aria-modal="true"
        onClick={handleSuccessClose}
      >
        <div
          className={cn(
            'flex flex-col w-[95vw] max-w-[520px] rounded-2xl overflow-hidden relative',
            glass.cardBase,
            glass.highlight
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            onClick={handleSuccessClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="flex flex-col items-center gap-5 px-8 py-10">
            {/* Success icon — blue gradient badge + checkmark draw animation */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path
                  d="M9 16.5L14 21.5L23 11"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength="1"
                  className="[stroke-dasharray:1] [stroke-dashoffset:1] animate-[strokeDraw_0.4s_ease-out_0.3s_forwards]"
                />
              </svg>
            </div>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                Knowledge saved
              </h2>
              <p className="text-sm text-[var(--text-tertiary)] font-mono">
                {commitSuccess.commitHash.slice(0, 12)}...
              </p>
            </div>

            {/* Diff stats summary */}
            {commitSuccess.diffStats && (
              <div className="w-full flex items-center justify-center gap-4 py-3 px-4 bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)]">
                <span className="flex items-center gap-1 text-sm text-[var(--diff-added-accent)] font-medium">
                  <Plus size={14} />
                  {commitSuccess.diffStats.addedCount} added
                </span>
                <span className="flex items-center gap-1 text-sm text-[var(--diff-modified-accent)] font-medium">
                  <Pencil size={14} />
                  {commitSuccess.diffStats.modifiedCount} modified
                </span>
                <span className="flex items-center gap-1 text-sm text-[var(--diff-removed-accent)] font-medium">
                  <Minus size={14} />
                  {commitSuccess.diffStats.removedCount} removed
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="w-full flex flex-col gap-2 mt-2">
              <Button onClick={handleViewCommitDetails} variant="outline" className="w-full gap-2">
                <GitCompare size={16} />
                <span>View {t('commit')} Details</span>
              </Button>
              <Button
                onClick={handleCreateOutput}
                className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                <span>Create Output</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'flex flex-col w-[95vw] max-w-[1400px] h-[85vh] rounded-2xl overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-[0.85rem] font-bold text-[var(--accent-conversation)] bg-[var(--hover-bg)] px-2.5 py-1 rounded-md">
              t3x
            </div>
            <h2 className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
              Commit: {data.title || 'Untitled'}
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{data.entryId}</span>
            <Badge
              variant="outline"
              className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider border-dashed border-[var(--color-border)] bg-[var(--color-text-muted)]/15"
            >
              pending
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={20} />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden" ref={draftBodyRef}>
          {/* ========== LEFT SIDEBAR: Config Zone (STEP 1 + STEP 2) ========== */}
          <aside
            className="min-w-[220px] max-w-[400px] p-5 bg-[var(--surface-app)] flex flex-col overflow-y-auto shrink-0"
            style={{ width: sidebarSourceDividerPos }}
          >
            {/* STEP 1: Configure (or Merge for merge drafts) */}
            <div
              className={cn(
                'flex flex-col gap-[var(--space-group)] flex-1 min-h-0 overflow-y-auto',
                (configLocked || isMergeDraft) && 'opacity-95'
              )}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                  {isMergeDraft ? 'MERGE' : 'STEP 1'}
                </span>
                <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-primary)]">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      !configLocked && !isMergeDraft
                        ? 'bg-emerald-500 dark:bg-emerald-400'
                        : 'bg-[var(--text-tertiary)]'
                    )}
                  />
                  {isMergeDraft ? 'Analyze & Resolve' : 'Configure'}
                  {configLocked && !isMergeDraft && (
                    <Lock size={12} className="text-[var(--text-tertiary)] ml-1" />
                  )}
                </span>
              </div>

              {/* Merge Draft: Legacy three-way merge UI removed */}
              {isMergeDraft ? (
                <div className="flex flex-col gap-3 p-3 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-lg flex-1 min-h-0 overflow-y-auto">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-secondary)]">
                    <GitCompare size={16} />
                    <span>
                      Merge: {data?.mergeConfig?.sourceCommitTitle} →{' '}
                      {data?.mergeConfig?.targetCommitTitle}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    Use the MergePanel for two-way merge operations.
                  </div>
                </div>
              ) : !configLocked ? (
                /* Unlocked state: Show editable controls */
                <div className="flex flex-col gap-[var(--space-group)]">
                  {/* Branch Selection - from real API data */}
                  {shouldShowBranchSelect && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide flex items-center">
                        {t('branch')}
                        {branchesLoading && <Loader2 size={12} className="animate-spin ml-1" />}
                      </label>
                      <select
                        className="w-full py-2 px-3 border border-[var(--stroke-default)] rounded-md text-[0.85rem] bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
                        value={
                          // Default to 'main' when pendingBranch is undefined or 'main'
                          data.pendingBranch !== 'branch'
                            ? 'main'
                            : data.pendingBranchName &&
                                branches.some((b) => b.name === data.pendingBranchName)
                              ? data.pendingBranchName
                              : '__new__'
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'main') {
                            onBranchChange?.('main');
                            onBranchNameChange?.('');
                          } else if (value === '__new__') {
                            onBranchChange?.('branch');
                            onBranchNameChange?.('');
                          } else {
                            onBranchChange?.('branch');
                            onBranchNameChange?.(value);
                          }
                        }}
                        disabled={branchesLoading}
                      >
                        <option value="main">main</option>
                        {branches
                          .filter((b) => b.name !== 'main')
                          .map((branch) => (
                            <option key={branch.branch_id} value={branch.name}>
                              {branch.name}
                              {branch.is_current ? ' (current)' : ''}
                            </option>
                          ))}
                        <option value="__new__">+ New {t('branch').toLowerCase()}...</option>
                      </select>
                      {/* Warning when main branch selection is invalid */}
                      {isMainBranchInvalid && (
                        <div className="flex items-start gap-2 mt-1.5 p-2 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/25 rounded text-[var(--status-warning)] text-xs">
                          <AlertCircle size={14} className="mt-0.5 shrink-0" />
                          <span>
                            {!data.sourceCommitHash
                              ? 'A root commit on main branch already exists.'
                              : 'Can only extend main branch from its latest commit.'}{' '}
                            Please select a different branch.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Branch Name - only shown when creating new branch */}
                  {requireBranchName &&
                    data.pendingBranch === 'branch' &&
                    !branches.some((b) => b.name === data.pendingBranchName) && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                          New {t('branch')} Name
                        </label>
                        <Input
                          type="text"
                          value={data.pendingBranchName || ''}
                          onChange={(e) => onBranchNameChange?.(e.target.value)}
                          placeholder="Enter new branch name"
                        />
                      </div>
                    )}

                  {/* Template */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Template
                    </label>
                    <select
                      className="w-full py-2 px-3 border border-[var(--stroke-default)] rounded-md text-[0.85rem] bg-[var(--surface-card)] text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/30"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                    >
                      {bridgeTemplates.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Extract Intent */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      What to extract
                    </label>
                    <Textarea
                      className="w-full text-sm min-h-[60px] resize-none"
                      placeholder="Describe what you want to extract from this conversation..."
                      value={extractIntent}
                      onChange={(e) => setExtractIntent(e.target.value)}
                    />
                    {!extractIntent.trim() && (
                      <span className="text-xs text-[var(--status-warning)]">
                        Required: describe what to extract
                      </span>
                    )}
                  </div>

                  {/* Cosine Threshold */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                      Filter Strictness
                    </label>
                    <input
                      type="range"
                      className="w-full h-1.5 rounded-sm bg-[var(--stroke-divider)] accent-indigo-500 dark:accent-indigo-400 cursor-pointer"
                      min="0"
                      max="1"
                      step="0.05"
                      value={cosineThreshold}
                      onChange={(e) => setCosineThreshold(Number.parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
                      <span>More content</span>
                      <span className="font-medium text-[var(--text-secondary)]">
                        {(100 - cosineThreshold * 60).toFixed(0)}%
                      </span>
                      <span>Less content</span>
                    </div>
                  </div>

                  {/* Curate Preview Status */}
                  {(isCurateLoading || curatePreview || curateError) && (
                    <div className="flex flex-col gap-1.5 p-2 bg-[var(--surface-app)] rounded-md border border-[var(--stroke-divider)]">
                      <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                        Preview
                      </span>
                      {isCurateLoading ? (
                        <div className="flex items-center gap-2 text-[0.8rem] text-[var(--text-tertiary)]">
                          <Loader2 size={14} className="animate-spin" />
                          <span>Computing embeddings...</span>
                        </div>
                      ) : curateError ? (
                        <div className="flex items-center gap-2 text-[0.8rem] text-[var(--status-error)]">
                          <AlertCircle size={14} />
                          <span>{curateError}</span>
                        </div>
                      ) : curatePreview ? (
                        <div className="flex items-center gap-2 text-[0.8rem] text-[var(--text-secondary)]">
                          <span>Auto-selected:</span>
                          <span className="font-medium text-[var(--status-success)]">
                            {selectedChunksCount} / {curatePreview.chunks.length} sentences
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Proceed Button */}
                  <div className="flex gap-2 mt-2">
                    <Button
                      onClick={handleProceed}
                      disabled={textBlocks.length === 0 && sourceBoxes.length === 0}
                      title="Lock configuration and proceed to curation"
                      className="flex-1 gap-1.5 bg-emerald-500 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      <Check size={16} />
                      <span>Proceed</span>
                    </Button>
                  </div>
                </div>
              ) : (
                /* Locked state: Show read-only summary */
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 p-3 bg-[var(--surface-app)] rounded-lg border border-[var(--stroke-divider)]">
                    {shouldShowBranchSelect && (
                      <div className="flex items-center gap-2 text-[0.85rem]">
                        <span className="text-[var(--text-tertiary)] min-w-[70px]">
                          {t('branch')}:
                        </span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {data.pendingBranch || 'branch'}
                        </span>
                      </div>
                    )}
                    {requireBranchName && (
                      <div className="flex items-center gap-2 text-[0.85rem]">
                        <span className="text-[var(--text-tertiary)] min-w-[70px]">Name:</span>
                        <span className="text-[var(--text-primary)] font-medium">
                          {data.pendingBranchName || '-'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[0.85rem]">
                      <span className="text-[var(--text-tertiary)] min-w-[70px]">Template:</span>
                      <span className="text-[var(--text-primary)] font-medium">{template}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[0.85rem]">
                      <span className="text-[var(--text-tertiary)] min-w-[70px]">Cosine:</span>
                      <span className="text-[var(--text-primary)] font-medium">
                        {cosineThreshold.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    title="Unlock configuration (will reset Step 2 changes)"
                    className="gap-2"
                  >
                    <RotateCcw size={16} />
                    <span>Reset</span>
                  </Button>
                </div>
              )}
            </div>

            <div className="h-px bg-[var(--stroke-divider)] my-5" />

            {/* STEP 2: Curate */}
            <div
              className={cn(
                'flex flex-col gap-[var(--space-group)]',
                !configLocked && 'opacity-50 pointer-events-none'
              )}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
                  STEP 2
                </span>
                <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-[var(--text-primary)]">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      configLocked ? 'bg-emerald-500' : 'bg-[var(--stroke-divider)]'
                    )}
                  />
                  Curate
                </span>
              </div>

              {!configLocked ? (
                /* Disabled state: Show hint */
                <div className="flex items-center gap-2 p-[var(--space-group)] bg-[var(--surface-app)] rounded-lg text-[var(--text-tertiary)] text-[0.85rem]">
                  <Lock size={16} />
                  <span>Complete Step 1 first</span>
                </div>
              ) : (
                /* Enabled state: Show stats and commit button */
                <>
                  <div className="flex gap-4">
                    {hasNewSourceData ? (
                      <>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {selectionsCount} selections
                        </span>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {mustHaveKeywordsNew.length} must
                        </span>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {mustntHaveKeywordsNew.length} mustnt
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {includedPhrasesCount} phrases
                        </span>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {mustHaveKeywordsLegacy.length} must
                        </span>
                        <span className="text-[0.85rem] text-[var(--text-secondary)]">
                          {mustntHaveKeywordsLegacy.length} mustnt
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-sm text-[var(--text-tertiary)]">
                    {hasNewSourceData
                      ? 'Drag to select text \u00b7 Click to mark keywords'
                      : 'Click phrases in SOURCE to toggle inclusion'}
                  </p>

                  {/* Commit error */}
                  {commitError && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-md text-[var(--status-error)] text-sm">
                      <AlertCircle size={14} />
                      <span>{commitError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 mt-2">
                    {isMergeDraft ? (
                      /* Legacy merge UI disabled - use MergePanel for two-way merge */
                      <div className="text-sm text-[var(--color-text-muted)] text-center py-2">
                        Use MergePanel for merge operations
                      </div>
                    ) : hasSourceConversation || hasSourceTurnWindow ? (
                      /* Commit Button - directly enabled when selections are made */
                      <Button
                        onClick={handleCommit}
                        disabled={
                          (hasNewSourceData ? selectionsCount === 0 : includedPhrasesCount === 0) ||
                          isCommitting
                        }
                        title={
                          hasNewSourceData
                            ? selectionsCount === 0
                              ? 'Select some text first'
                              : ''
                            : includedPhrasesCount === 0
                              ? 'Include some phrases first'
                              : ''
                        }
                        className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                      >
                        {isCommitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Creating...</span>
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            <span>{t('commitAction')}</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      /* No valid source - cannot commit */
                      <div className="flex items-start gap-2 p-3 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/25 rounded-md text-[var(--status-warning)]">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-sm">Cannot commit</span>
                          <span className="text-xs text-[var(--status-warning)]">
                            {!data.sourceConversationId && !data.sourceTurnWindow
                              ? 'Source commit is missing turn window data (legacy commit). Please create a new conversation from this commit first, then create a commit from that conversation.'
                              : 'No source conversation or turn window available.'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Sidebar | SOURCE Divider */}
          <div
            className="w-1.5 bg-[var(--stroke-divider)] cursor-col-resize shrink-0 hover:bg-[var(--hover-bg-strong)] active:bg-blue-500 dark:active:bg-blue-400 transition-colors relative group"
            onMouseDown={handleSidebarSourceDivider}
          >
            <div className="draft-svtz__divider-handle" />
          </div>

          {/* ========== MAIN CONTENT: SOURCE ========== */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-[var(--surface-card)] overflow-hidden"
            ref={mainContentRef}
          >
            {/* SOURCE Column - Full Width */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] shrink-0">
                <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {isMergeDraft ? 'MERGE CONTENT' : 'SOURCE'}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-[var(--space-group)]">
                {/* Merge draft - legacy three-way merge UI removed */}
                {isMergeDraft ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-tertiary)]">
                    <GitCompare
                      size={48}
                      strokeWidth={1}
                      className="text-[var(--color-border)] mb-[var(--space-group)]"
                    />
                    <h4 className="font-semibold text-[var(--text-secondary)] mb-[var(--space-item)]">
                      Merge via MergePanel
                    </h4>
                    <p className="text-sm text-[var(--text-tertiary)] mb-[var(--space-section)]">
                      Use the MergePanel component for two-way merge operations.
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-[var(--status-info-muted)] text-[var(--status-info)]">
                          SOURCE
                        </Badge>
                        <span className="text-[var(--text-secondary)]">
                          {data?.mergeConfig?.sourceCommitTitle}
                        </span>
                      </div>
                      <span className="text-[var(--text-tertiary)]">&rarr;</span>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-[var(--accent-pending)]/10 text-[var(--accent-pending)]">
                          TARGET
                        </Badge>
                        <span className="text-[var(--text-secondary)]">
                          {data?.mergeConfig?.targetCommitTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : hasNewSourceData ? (
                  /* New free-form text selection UI */
                  <PendingSourceEditor
                    blocks={textBlocks}
                    onChange={handleTextBlocksChange}
                    readOnly={!configLocked}
                    anchorCandidates={anchorCandidates}
                    confirmedAnchors={confirmedAnchors}
                    anchorThreshold={keywordsThreshold}
                    onAnchorChange={handleAnchorChange}
                  />
                ) : sourceBoxes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
                    <MessageSquarePlus
                      size={32}
                      strokeWidth={1}
                      className="mb-[var(--space-item)]"
                    />
                    <p className="font-medium text-[var(--text-tertiary)]">No source content</p>
                    <span className="text-sm">Connect upstream conversation or commit</span>
                  </div>
                ) : (
                  /* Legacy phrase-based UI */
                  sourceBoxes.map((box) => (
                    <div
                      key={box.id}
                      className="bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-lg mb-3 overflow-hidden"
                    >
                      {/* Source Box Header */}
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-app)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                        onClick={() => toggleSourceBoxExpand(box.id)}
                      >
                        <span className="text-[var(--text-tertiary)]">
                          {box.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <span className="flex-1 text-[0.85rem] font-medium text-[var(--text-secondary)]">
                          {box.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[0.65rem] text-[var(--status-info)] border-[var(--status-info)]/20 bg-[var(--status-info-muted)]"
                        >
                          {box.type}
                        </Badge>
                      </div>
                      {/* Source Box Body with Phrases and Keyword Highlighting */}
                      {box.expanded && (
                        <div className="p-3 text-[0.9rem] leading-[1.8] text-[var(--text-secondary)]">
                          {box.phrases.map((phrase) => {
                            const canToggle = configLocked;
                            return (
                              <div
                                key={phrase.id}
                                className={cn(
                                  'inline-block py-1.5 px-2.5 m-1 rounded-md transition-colors cursor-pointer leading-[1.6] max-w-full',
                                  phrase.included
                                    ? 'bg-[var(--status-success-muted)] border border-[var(--status-success)]/20 hover:bg-green-200 dark:hover:bg-green-700'
                                    : 'bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 hover:bg-red-200 dark:hover:bg-red-700',
                                  !canToggle && 'opacity-70 cursor-default'
                                )}
                                onClick={(e) => {
                                  if (canToggle && e.target === e.currentTarget) {
                                    togglePhraseInclude(phrase.id);
                                  }
                                }}
                                title={
                                  !canToggle
                                    ? 'Complete Step 1 to edit'
                                    : phrase.included
                                      ? 'Click to exclude phrase'
                                      : 'Click to include phrase'
                                }
                              >
                                {/* Render phrase text with clickable keywords */}
                                {renderPhraseWithKeywords(
                                  phrase,
                                  canToggle,
                                  () => togglePhraseInclude(phrase.id),
                                  (kwId) => toggleKeywordMustnt(phrase.id, kwId),
                                  hoveredKeywordText,
                                  handleKeywordHover
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legend */}
        <footer className="flex items-center justify-center gap-6 px-6 py-3 bg-[var(--surface-app)] border-t border-[var(--stroke-divider)] text-xs text-[var(--text-tertiary)] shrink-0">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[var(--status-success-muted)] border border-[var(--status-success)]/20" />
            green bg = included phrase
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-[var(--status-error-muted)] border border-[var(--status-error)]/20" />
            red bg = excluded phrase
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-green-600 dark:bg-green-500" />
            green text = must-have keyword
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-red-600 dark:bg-red-500" />
            red text = mustnt-have keyword
          </span>
        </footer>
      </div>
    </div>
  );
}
