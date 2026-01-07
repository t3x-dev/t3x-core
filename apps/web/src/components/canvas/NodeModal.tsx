import type { Node } from '@xyflow/react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  GitCommit,
  GitCompare,
  GitMerge,
  Link2,
  Loader2,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Settings,
  Tag,
  X,
} from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import * as api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
  SourceTextBlock,
  TurnBoundary,
} from '@/types/nodes';
import {
  getMustHaveKeywords as getMustHaveKeywordsFromBlocks,
  getMustntHaveKeywords as getMustntHaveKeywordsFromBlocks,
  getSelectedText,
  tokenizeText,
} from '@/utils/tokenizer';
import { PendingSourceEditor } from './SelectableTextBlock';

const bridgeTemplates = [
  { id: 'prose', name: 'prose', description: 'General prose extraction' },
  { id: 'plan', name: 'plan', description: 'Extract action items and planning structure' },
  { id: 'story', name: 'story', description: 'Narrative extraction with flow preservation' },
  { id: 'summary', name: 'summary', description: 'Concise summary of key points' },
  { id: 'refine', name: 'refine', description: 'Polish and tighten existing content' },
];

// Phrase type for extraction results
// Two states: included (浅绿) or excluded (浅红)
interface Phrase {
  id: string;
  text: string;
  included: boolean; // true = include (浅绿), false = exclude (浅红)
  sourceBoxId: string;
  keywords: PhraseKeyword[]; // Keywords within this phrase
}

// Keyword within a phrase
// Two states: must (深绿) or mustnt (深红)
// Only editable when parent phrase is included
interface PhraseKeyword {
  id: string;
  text: string;
  originalWord: string; // Original word with punctuation
  startIndex: number; // Position in phrase text
  isMustnt: boolean; // false = must_have (深绿), true = mustnt_have (深红)
}

// Source box type for SOURCE column
interface SourceBox {
  id: string;
  title: string;
  type: 'unit';
  content: string;
  expanded: boolean;
  phrases: Phrase[];
}

export type NodeQuickAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

interface NodeModalProps {
  node?: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  onConvertDraft?: () => void;
  draftBranchMode?: 'force-main' | 'select' | 'branch-only' | 'blocked';
  onBranchChange?: (branch: 'main' | 'branch') => void;
  onBranchNameChange?: (name: string) => void;
  quickActions?: NodeQuickAction[];
  onSaveConstraints?: (constraints: ConversationConstraints) => void;
  effectiveConstraints?: {
    clauses: ConversationConstraints['clauses'];
    must_have: string[];
    mustnt_have: string[];
  };
  onUpdateConstraintOverrides?: (overrides: Partial<DraftConstraintOverrides>) => void;
  isConversationLocked?: boolean;
}

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'have',
  'been',
  'will',
  'would',
  'could',
  'should',
  'about',
  'which',
  'their',
  'there',
  'where',
  'when',
  'what',
  'were',
  'they',
  'into',
  'also',
  'more',
  'some',
  'than',
  'very',
  'just',
  'only',
  'over',
  'such',
  'like',
  'then',
  'most',
  'your',
  'other',
  'first',
  'can',
  'are',
  'was',
  'has',
  'had',
  'but',
  'not',
  'you',
  'all',
  'any',
  'its',
  'may',
  'how',
  'out',
  'who',
  'get',
  'our',
  'one',
  'two',
]);

// Extract keywords from a single phrase
function extractKeywordsFromPhrase(
  phraseText: string,
  phraseId: string,
  minWordLength: number = 4
): PhraseKeyword[] {
  const keywords: PhraseKeyword[] = [];
  const seenWords = new Set<string>();

  // Match words with their positions
  const wordRegex = /\b\w+\b/g;
  let match;

  while ((match = wordRegex.exec(phraseText)) !== null) {
    const word = match[0];
    const cleanWord = word.toLowerCase();

    if (
      cleanWord.length >= minWordLength &&
      !STOP_WORDS.has(cleanWord) &&
      !seenWords.has(cleanWord)
    ) {
      seenWords.add(cleanWord);
      keywords.push({
        id: `kw-${phraseId}-${match.index}`,
        text: cleanWord,
        originalWord: word,
        startIndex: match.index,
        isMustnt: false, // Default to must_have (深绿)
      });
    }
  }

  return keywords;
}

// Mock phrase extraction from text (in real app this would come from backend)
function extractPhrasesFromText(
  text: string,
  sourceBoxId: string,
  keywordsThreshold: number = 0.6
): Phrase[] {
  if (!text) return [];

  // Minimum word length based on threshold (higher threshold = longer words)
  const minWordLength = Math.floor(3 + keywordsThreshold * 3); // 3-6 chars

  // Split into sentences and create phrases
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  return sentences.slice(0, 8).map((sentence, idx) => {
    const phraseId = `phrase-${sourceBoxId}-${idx}`;
    const trimmedText = sentence.trim();
    return {
      id: phraseId,
      text: trimmedText,
      included: true, // default to included (浅绿)
      sourceBoxId,
      keywords: extractKeywordsFromPhrase(trimmedText, phraseId, minWordLength),
    };
  });
}

// Generate result text from included phrases (excludes mustnt keywords)
function generateResultText(phrases: Phrase[]): string {
  const includedPhrases = phrases.filter((p) => p.included);
  if (includedPhrases.length === 0) return '';

  return includedPhrases.map((p) => p.text).join('. ') + '.';
}

// Get all must_have keywords from included phrases (legacy phrase-based system)
function getMustHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases.filter((p) => p.included).flatMap((p) => p.keywords.filter((kw) => !kw.isMustnt));
}

// Get all mustnt_have keywords from included phrases (legacy phrase-based system)
function getMustntHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases.filter((p) => p.included).flatMap((p) => p.keywords.filter((kw) => kw.isMustnt));
}

// Helper to render phrase text with clickable keywords
// - Click on non-keyword text: toggle phrase include/exclude
// - Click on keyword: toggle keyword must/mustnt (only when phrase is included)
function renderPhraseWithKeywords(
  phrase: Phrase,
  canToggle: boolean,
  onPhraseClick: () => void,
  onKeywordClick: (keywordId: string) => void,
  hoveredKeywordText: string | null,
  onKeywordHover: (text: string | null) => void
): React.ReactNode[] {
  const { text, keywords, included } = phrase;

  if (keywords.length === 0) {
    // No keywords, entire phrase is clickable
    return [
      <span
        key="text"
        className="draft-svtz__phrase-text"
        onClick={(e) => {
          e.stopPropagation();
          if (canToggle) onPhraseClick();
        }}
        title={
          !canToggle
            ? 'Complete Step 1 to edit'
            : included
              ? 'Click to exclude phrase'
              : 'Click to include phrase'
        }
      >
        {text}
      </span>,
    ];
  }

  // Sort keywords by position
  const sortedKeywords = [...keywords].sort((a, b) => a.startIndex - b.startIndex);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedKeywords.forEach((kw, idx) => {
    // Add text before this keyword (clickable to toggle phrase)
    if (kw.startIndex > lastIndex) {
      const beforeText = text.slice(lastIndex, kw.startIndex);
      parts.push(
        <span
          key={`text-${idx}`}
          className="draft-svtz__phrase-text"
          onClick={(e) => {
            e.stopPropagation();
            if (canToggle) onPhraseClick();
          }}
          title={
            !canToggle
              ? 'Complete Step 1 to edit'
              : included
                ? 'Click to exclude phrase'
                : 'Click to include phrase'
          }
        >
          {beforeText}
        </span>
      );
    }

    // Add keyword (clickable to toggle must/mustnt, only when phrase is included)
    const keywordEndIndex = kw.startIndex + kw.originalWord.length;
    const isHovered = hoveredKeywordText === kw.text.toLowerCase();
    parts.push(
      <span
        key={`kw-${kw.id}`}
        className={`draft-svtz__keyword ${kw.isMustnt ? 'draft-svtz__keyword--mustnt' : 'draft-svtz__keyword--must'} ${!included ? 'draft-svtz__keyword--disabled' : ''} ${isHovered ? 'draft-svtz__keyword--hovered' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (canToggle && included) onKeywordClick(kw.id);
        }}
        onMouseEnter={() => onKeywordHover(kw.text.toLowerCase())}
        onMouseLeave={() => onKeywordHover(null)}
        title={
          !canToggle
            ? 'Complete Step 1 to edit'
            : !included
              ? 'Include phrase first to edit keywords'
              : kw.isMustnt
                ? 'Click to change to must-have'
                : 'Click to change to mustnt-have'
        }
      >
        {text.slice(kw.startIndex, keywordEndIndex)}
      </span>
    );

    lastIndex = keywordEndIndex;
  });

  // Add remaining text after last keyword
  if (lastIndex < text.length) {
    parts.push(
      <span
        key="text-end"
        className="draft-svtz__phrase-text"
        onClick={(e) => {
          e.stopPropagation();
          if (canToggle) onPhraseClick();
        }}
        title={
          !canToggle
            ? 'Complete Step 1 to edit'
            : included
              ? 'Click to exclude phrase'
              : 'Click to include phrase'
        }
      >
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts;
}

export function NodeModal({
  node,
  onClose,
  onUpdate,
  onConvertDraft,
  draftBranchMode: _draftBranchMode,
  onBranchChange,
  onBranchNameChange,
  quickActions,
}: NodeModalProps) {
  // ========== ALL HOOKS MUST BE AT THE TOP - before any conditional returns ==========

  // ========== Single View Two Zones State ==========
  // Config state (STEP 1)
  const [template, setTemplate] = useState(node?.data.bridgePrompt || 'prose');
  const [cosineThreshold, setCosineThreshold] = useState(0.75);
  const [keywordsThreshold, setKeywordsThreshold] = useState(0.6);

  // Extract intent - user describes what to extract (initialized from first user message)
  const [extractIntent, setExtractIntent] = useState('');

  // Curate preview state (cosine-based chunk selection)
  const [curatePreview, setCuratePreview] = useState<api.CuratePreviewResponse | null>(null);
  const [previewConversationId, setPreviewConversationId] = useState<string | null>(null);
  const [isCurateLoading, setIsCurateLoading] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);

  // Step 1 locked state - when true, config is frozen and Step 2 becomes editable
  const [configLocked, setConfigLocked] = useState(false);

  // Source boxes with phrases (SOURCE column) - baseline from Step 1
  const [sourceBoxes, setSourceBoxes] = useState<SourceBox[]>([]);

  // New: Text blocks for free-form selection (from pendingSource)
  const [textBlocks, setTextBlocks] = useState<SourceTextBlock[]>(
    node?.data.pendingSource?.textBlocks || []
  );
  // Ref to access latest textBlocks in auto-convert useEffect without adding it to dependencies
  const textBlocksRef = useRef(textBlocks);
  textBlocksRef.current = textBlocks;

  // Ref to track current sourceConversationId for stale request detection
  const sourceConversationIdRef = useRef<string | null>(null);

  // Draft validation state
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<api.Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Commit state
  const [isCommitting, setIsCommitting] = useState(false);

  // For staging units: toggle between conversation view and commit config view
  const [showCommitConfig, setShowCommitConfig] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    missing: string[];
    forbidden: string[];
  } | null>(null);

  // Validation derived from draft
  const validationPassed = currentDraft?.validation?.passed ?? false;

  // Get projectId and edges from canvasStore
  const projectId = useCanvasStore((state) => state.projectId);
  const _edges = useCanvasStore((state) => state.edges);
  const _getUpstreamSourceNodes = useCanvasStore((state) => state.getUpstreamSourceNodes);

  // Branches state for Step 1 dropdown
  const [branches, setBranches] = useState<api.Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Diff state for committed commit comparison
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [diffTargetCommit, setDiffTargetCommit] = useState<string>('');
  const [diffResult, setDiffResult] = useState<api.DiffResult | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Merge state for merge drafts
  const [mergeResult, setMergeResult] = useState<api.MergeResult | null>(null);
  const [isMergeAnalyzing, setIsMergeAnalyzing] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  // Conflict resolutions: facet -> 'source' | 'target' | 'custom'
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<
      string,
      {
        choice: 'source' | 'target' | 'custom';
        customText?: string;
      }
    >
  >({});

  // Check if all conflicts are resolved (needed before handleCommit)
  const allConflictsResolved = useMemo(() => {
    if (!mergeResult || mergeResult.status !== 'conflicts') return true;
    return mergeResult.conflicts.every((conflict) => {
      const resolution = conflictResolutions[conflict.facet];
      if (!resolution) return false;
      // For delete_modify / modify_delete conflicts, one side may legitimately be null/empty
      // Only require non-empty text for 'custom' choice
      if (resolution.choice === 'custom' && !resolution.customText?.trim()) return false;
      // For source/target choices, just require a choice was made (empty text is valid for deletions)
      return true;
    });
  }, [mergeResult, conflictResolutions]);

  // Get all committed commits for diff target selection
  // Use nodes directly and filter in useMemo to avoid infinite loop from .filter() creating new arrays
  const nodes = useCanvasStore((state) => state.nodes);
  const allCommittedCommits = useMemo(
    () => nodes.filter((n) => n.data.kind === 'unit' && n.data.commitStatus === 'committed'),
    [nodes]
  );

  // Divider positions
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240); // pixels for sidebar width

  // Hovered keyword (for cross-area highlighting)
  const [hoveredKeywordText, setHoveredKeywordText] = useState<string | null>(null);

  // Sidebar state for conversation
  const [showSettings, setShowSettings] = useState(false);

  // Chat state for conversation
  // Extended to include rings data from Core RingOutput
  const [chatMessages, setChatMessages] = useState<
    {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      rings?: api.RingsData | null;
    }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Chat pagination state
  const CHAT_PAGE_SIZE = 100;
  const [chatOffset, setChatOffset] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  // Resizable sidebar state (conversation)
  const [sidebarWidth, setSidebarWidth] = useState(280);

  // Commit resizable state
  const [commitLeftWidth, setCommitLeftWidth] = useState(280);
  const [commitRightWidth, setCommitRightWidth] = useState(280);

  // Refs
  const mainContentRef = useRef<HTMLDivElement>(null);
  const draftBodyRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const commitContainerRef = useRef<HTMLDivElement>(null);

  // Handler for keyword hover
  const handleKeywordHover = useCallback((text: string | null) => {
    setHoveredKeywordText(text);
  }, []);

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

  // ========== New free-form selection computed values ==========
  // Check if we have new-style pendingSource data
  const hasNewSourceData = textBlocks.length > 0;

  // Computed: must_have keywords from all blocks
  const mustHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap((block) =>
      getMustHaveKeywordsFromBlocks(block.tokens, block.keywords)
    );
  }, [textBlocks]);

  // Computed: mustnt_have keywords from all blocks
  const mustntHaveKeywordsNew = useMemo(() => {
    return textBlocks.flatMap((block) =>
      getMustntHaveKeywordsFromBlocks(block.tokens, block.keywords)
    );
  }, [textBlocks]);

  // Computed: total selections count
  const selectionsCount = useMemo(() => {
    return textBlocks.reduce((acc, block) => acc + block.selections.length, 0);
  }, [textBlocks]);

  // Persist text block edits (selections/keywords) back to canvas store
  const handleTextBlocksChange = useCallback(
    (updatedBlocks: SourceTextBlock[]) => {
      setTextBlocks(updatedBlocks);
      onUpdate({
        pendingSource: {
          textBlocks: updatedBlocks,
        },
      });
    },
    [onUpdate]
  );

  // Derive node-dependent values
  const data = node?.data;
  const isUnit = data?.kind === 'unit';
  const isStagingUnit = isUnit && data?.commitStatus === 'staging';
  const isCommittedUnit = isUnit && data?.commitStatus === 'committed';
  // In Unit model:
  // - Staging units show conversation view by default, can switch to commit config view
  // - Committed units show committed commit view (facets, source excerpts, etc.)
  const _isCommit = isUnit;
  // Show conversation view only for staging units not in commit config mode
  const isConversation = isStagingUnit && !showCommitConfig;
  const isPendingCommit = isStagingUnit && showCommitConfig;
  const isCommittedCommit = isCommittedUnit;
  const isMergeDraft = isPendingCommit && data?.bridgePrompt === '/merge' && !!data?.mergeConfig;
  // Always show branch select for pending commits (except merge drafts)
  // Previously only shown for 'select' or 'branch-only' modes, but users want control
  const shouldShowBranchSelect = isPendingCommit && !isMergeDraft;
  // Show branch name input when user selects "+ New branch..." (pendingBranch === 'branch')
  const requireBranchName = !isMergeDraft && isPendingCommit && data?.pendingBranch === 'branch';

  // Load branches from API when opening pending commit modal
  useEffect(() => {
    if (!isPendingCommit || !projectId) return;

    const loadBranches = async () => {
      setBranchesLoading(true);
      try {
        const response = await api.listBranches(projectId);
        setBranches(response.branches);
      } catch (err) {
        console.error('Failed to load branches:', err);
        // Fallback to empty - user can still type branch name manually
        setBranches([]);
      } finally {
        setBranchesLoading(false);
      }
    };

    loadBranches();
  }, [isPendingCommit, projectId]);

  // Initialize source boxes (legacy) and textBlocks from baseline summary
  // Note: setState in effect is intentional here for initialization based on props
  useEffect(() => {
    if (isPendingCommit && data?.baselineSummary) {
      const sourceTitle = `Unit – ${data.title?.replace('Draft from ', '') || 'Source'}`;

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
  }, [
    isPendingCommit,
    data?.baselineSummary,
    data?.title,
    data?.sourceConversationId,
    keywordsThreshold,
  ]);

  // Build textBlocks from own conversation
  // Commit config view always loads source content from its own conversation
  useEffect(() => {
    if (!isPendingCommit || !node?.id || !projectId) return;

    const buildTextBlocks = async () => {
      const ownConversationId = data?.conversationId || data?.sourceConversationId;
      if (!ownConversationId) {
        setTextBlocks([]);
        return;
      }

      try {
        const turnsData = await api.listTurns(projectId, ownConversationId);
        if (turnsData.turns && turnsData.turns.length > 0) {
          // Use [role]: content\n\n format to match backend curate API
          // This ensures offset consistency between frontend tokenization and backend Ring3 segments
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
              // Truncate to first 100 chars if too long
              const truncated = firstUserTurn.content.slice(0, 100);
              setExtractIntent(truncated + (firstUserTurn.content.length > 100 ? '...' : ''));
            }
          }

          // Build turn boundaries based on [role]: content\n\n format
          const turnBoundaries: TurnBoundary[] = [];
          let currentTokenIndex = 0;

          for (let i = 0; i < turnsData.turns.length; i++) {
            const turn = turnsData.turns[i];
            // Include [role]: prefix in tokenization
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
            // +2 for \n\n separator (except last turn has no separator)
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
      } catch (err) {
        console.warn('Failed to fetch conversation turns:', err);
        setTextBlocks([]);
      }
    };

    buildTextBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPendingCommit, node?.id, projectId, data?.conversationId, data?.sourceConversationId]);

  // Clear curate state when conversation changes to avoid stale data on new content
  useEffect(() => {
    const newSourceId = data?.sourceConversationId || data?.conversationId || null;
    sourceConversationIdRef.current = newSourceId; // Invalidate in-flight requests
    setCuratePreview(null);
    setPreviewConversationId(null);
    setCurateError(null);
  }, [projectId, data?.conversationId, data?.sourceConversationId]);

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Debounced curate preview call when intent or cosine slider changes
  useEffect(() => {
    // Only call when we have the necessary data and config is NOT locked yet
    // (Once locked, user moves to Step 2 - no need to keep calling preview)
    if (configLocked) return;

    // Need intent to be set
    if (!extractIntent.trim()) return;

    // Get source conversation ID
    const sourceConversationId = data?.sourceConversationId || data?.conversationId;
    if (!projectId || !sourceConversationId) return;

    // Track current conversation to detect stale responses
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

        // Guard: only update if still on the same conversation (stale request check)
        if (sourceConversationIdRef.current !== sourceConversationId) return;

        setCuratePreview(response);
        setPreviewConversationId(sourceConversationId);
      } catch (err) {
        // Ignore abort errors (from debounce/unmount)
        if (err instanceof api.ApiError && err.code === 'ABORTED') return;
        const message = err instanceof Error ? err.message : 'Failed to get curate preview';
        setCurateError(message);
        console.error('Curate preview error:', err);
      } finally {
        setIsCurateLoading(false);
      }
    }, 500); // 500ms debounce (longer for typing)

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

  // Count selected chunks (for Step 1 preview display)
  const selectedChunksCount = useMemo(() => {
    if (!curatePreview) return 0;
    return curatePreview.chunks.filter((c) => c.selected).length;
  }, [curatePreview]);

  // Auto-convert curate chunks to textBlocks.selections
  // When curate preview updates, automatically select the relevant tokens
  // Only runs in Step 1 (before config is locked) to avoid overwriting user's manual edits in Step 2
  const currentSourceConversationId = data?.sourceConversationId || data?.conversationId;
  useEffect(() => {
    if (configLocked) return; // Don't override user's manual selections in Step 2
    if (!curatePreview || curatePreview.chunks.length === 0) return;

    // Guard: skip if preview is for a different conversation (stale data)
    if (previewConversationId !== currentSourceConversationId) return;

    // Use ref to get latest textBlocks (avoids stale closure issue)
    const currentTextBlocks = textBlocksRef.current;
    if (currentTextBlocks.length === 0) return;

    const block = currentTextBlocks[0];
    if (!block.tokens || block.tokens.length === 0) return;

    // Build selections from selected chunks
    const newSelections: Array<{ id: string; startIndex: number; endIndex: number; type: 'include' | 'exclude' }> = [];

    for (const chunk of curatePreview.chunks) {
      if (!chunk.selected) continue;

      // Find tokens that overlap with this chunk
      const chunkTokens = block.tokens.filter(
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

    // Only update if selections actually changed (avoid infinite loop)
    const currentSelectionIds = block.selections.map((s) => `${s.startIndex}-${s.endIndex}`).sort().join(',');
    const newSelectionIds = newSelections.map((s) => `${s.startIndex}-${s.endIndex}`).sort().join(',');

    if (currentSelectionIds !== newSelectionIds) {
      const updatedBlock = {
        ...block,
        selections: newSelections,
        // Keep existing keywords that are within the new selections
        keywords: block.keywords.filter((kw) =>
          newSelections.some((sel) => kw.tokenIndex >= sel.startIndex && kw.tokenIndex <= sel.endIndex)
        ),
      };
      setTextBlocks([updatedBlock]);
    }
  }, [curatePreview, configLocked, textBlocks.length, textBlocks[0]?.originalText, previewConversationId, currentSourceConversationId]);

  const addCommitAction = useMemo(
    () => quickActions?.find((a) => a.key === 'add-commit'),
    [quickActions]
  );

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      // Clamp between 200 and 500px
      setSidebarWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Commit left divider handler
  const handleCommitLeftDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return;
      const rect = commitContainerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      setCommitLeftWidth(Math.max(200, Math.min(400, newWidth)));
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

  // Commit right divider handler
  const handleCommitRightDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!commitContainerRef.current) return;
      const rect = commitContainerRef.current.getBoundingClientRect();
      const newWidth = rect.right - moveEvent.clientX;
      setCommitRightWidth(Math.max(200, Math.min(400, newWidth)));
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

  // ========== Single View Two Zones Handlers ==========

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
  // Phrase: include (浅绿) ↔ exclude (浅红)
  const togglePhraseInclude = useCallback(
    (phraseId: string) => {
      if (!configLocked) return; // Only allow in Step 2

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
  // Keyword: must_have (深绿) ↔ mustnt_have (深红)
  const toggleKeywordMustnt = useCallback(
    (phraseId: string, keywordId: string) => {
      if (!configLocked) return; // Only allow in Step 2

      setSourceBoxes((prev) =>
        prev.map((sb) => ({
          ...sb,
          phrases: sb.phrases.map((p) => {
            if (p.id !== phraseId || !p.included) return p; // Only toggle if phrase is included
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

  // Initialize source boxes from baseline summary
  useEffect(() => {
    if (isPendingCommit && data.baselineSummary) {
      const sourceTitle = `Unit – ${data.title?.replace('Draft from ', '') || 'Source'}`;

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
  }, [
    isPendingCommit,
    data?.baselineSummary,
    data?.title,
    data?.sourceConversationId,
    keywordsThreshold,
  ]);

  // Handle Proceed - lock Step 1 config and enable Step 2 editing
  const handleProceed = useCallback(() => {
    // Allow proceeding if either textBlocks or sourceBoxes has content
    if (textBlocks.length === 0 && sourceBoxes.length === 0) return;
    setConfigLocked(true);
  }, [textBlocks, sourceBoxes]);

  // Handle Reset - unlock Step 1 config and reset phrases to default
  const handleReset = useCallback(() => {
    setConfigLocked(false);
    // Re-extract to reset all phrase/keyword states
    setSourceBoxes((prev) =>
      prev.map((sb) => ({
        ...sb,
        phrases: extractPhrasesFromText(sb.content, sb.id, keywordsThreshold),
      }))
    );
  }, [keywordsThreshold]);

  // Check if this pending commit has a source conversation (from conversation) or not (from commit)
  const hasSourceConversation = !!data?.sourceConversationId || !!data?.conversationId;
  const effectiveSourceConversationId = data?.sourceConversationId || data?.conversationId;
  if (isPendingCommit) {
    console.log(
      '[NodeModal] hasSourceConversation:',
      hasSourceConversation,
      'effectiveSourceId:',
      effectiveSourceConversationId,
      '(sourceConversationId:',
      data?.sourceConversationId,
      '| conversationId:',
      data?.conversationId + ')'
    );
  }
  // Check if this commit-derived pending has inherited turn_window for direct commit
  const hasSourceTurnWindow = !!data?.sourceTurnWindow;

  // Local validation state for commit-derived pending commits
  const [localValidationPassed, setLocalValidationPassed] = useState<boolean | null>(null);
  const [localValidationErrors, setLocalValidationErrors] = useState<{
    missing: string[];
    forbidden: string[];
  } | null>(null);

  // Reset local validation when selections or keywords change
  // This ensures user must re-validate after modifying source selection
  useEffect(() => {
    if (localValidationPassed !== null) {
      setLocalValidationPassed(null);
      setLocalValidationErrors(null);
    }
    // Only reset when actual content changes, not on initial render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Track selection changes via these derived values
    selectionsCount,
    mustHaveKeywordsNew.length,
    mustntHaveKeywordsNew.length,
    includedPhrasesCount,
    mustHaveKeywordsLegacy.length,
    mustntHaveKeywordsLegacy.length,
  ]);

  // Helper: normalize keyword for comparison (lowercase, trim, remove punctuation)
  // Use Unicode-aware regex to preserve CJK characters
  const normalizeKeyword = (kw: string) =>
    kw
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s]/gu, '');

  // Handle local validation for commit-derived pending commits
  // This validates must_have/mustnt_have keywords against selected source text
  const handleLocalValidation = useCallback(() => {
    // Get selected source text and normalize
    let selectedText = '';
    if (textBlocks.length > 0) {
      selectedText = textBlocks
        .map((block) => getSelectedText(block.tokens, block.selections))
        .filter((text) => text.length > 0)
        .join(' ');
    } else {
      selectedText = allPhrases
        .filter((p) => p.included)
        .map((p) => p.text)
        .join(' ');
    }

    // Normalize selected text (lowercase, remove punctuation for matching)
    // Use Unicode-aware regex to preserve CJK characters
    const normalizedText = selectedText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');

    if (!normalizedText.trim()) {
      setLocalValidationPassed(false);
      setLocalValidationErrors({ missing: ['No source text selected'], forbidden: [] });
      return;
    }

    // Get must_have and mustnt_have keywords, normalized
    const mustHave =
      textBlocks.length > 0 ? mustHaveKeywordsNew : mustHaveKeywordsLegacy.map((kw) => kw.text);
    const mustntHave =
      textBlocks.length > 0 ? mustntHaveKeywordsNew : mustntHaveKeywordsLegacy.map((kw) => kw.text);

    // Validate must_have: all keywords must be present in selected text
    const missingKeywords = mustHave.filter((kw) => {
      const normalized = normalizeKeyword(kw);
      return normalized.length > 0 && !normalizedText.includes(normalized);
    });

    // Validate mustnt_have: none of these keywords should be present
    const forbiddenKeywords = mustntHave.filter((kw) => {
      const normalized = normalizeKeyword(kw);
      return normalized.length > 0 && normalizedText.includes(normalized);
    });

    const passed = missingKeywords.length === 0 && forbiddenKeywords.length === 0;
    setLocalValidationPassed(passed);
    setLocalValidationErrors(
      passed ? null : { missing: missingKeywords, forbidden: forbiddenKeywords }
    );
  }, [
    textBlocks,
    allPhrases,
    mustHaveKeywordsNew,
    mustntHaveKeywordsNew,
    mustHaveKeywordsLegacy,
    mustntHaveKeywordsLegacy,
  ]);

  // Handle Generate Draft - call Draft API for validation
  // Only available for pending commits created from conversations
  // Validate pending commit - generate LLM draft and check keyword constraints
  const handleValidatePendingCommit = useCallback(async () => {
    if (!projectId || !data) {
      setDraftError('No project selected');
      return;
    }

    // Get source unit ID - prefer from textBlocks (dynamic), fallback to data.sourceConversationId (static)
    // This allows commits created from other commits to work when a unit is later connected
    const sourceUnitBlock = textBlocks.find((block) => block.sourceNodeType === 'unit');
    const sourceConversationId = sourceUnitBlock?.sourceNodeId || data.sourceConversationId;
    if (!sourceConversationId) {
      // This shouldn't happen - button should be hidden for commit-derived pending commits
      setDraftError('No source conversation - validation not available');
      return;
    }

    setIsGeneratingDraft(true);
    setDraftError(null);
    setCurrentDraft(null);
    setValidationErrors(null);

    try {
      // Get selected text from textBlocks (unified selection system)
      let selectedText = '';

      if (textBlocks.length > 0) {
        selectedText = textBlocks
          .map((block) => getSelectedText(block.tokens, block.selections))
          .filter((text) => text.length > 0)
          .join('\n');
      } else {
        // Fallback: use legacy phrases selection
        selectedText = allPhrases
          .filter((p) => p.included)
          .map((p) => p.text)
          .join('\n');
      }

      if (!selectedText.trim()) {
        setDraftError('Please select some source text first');
        setIsGeneratingDraft(false);
        return;
      }

      // Use extractIntent as the LLM intent
      const intentForLLM = extractIntent.trim() || 'Extract key content';

      // Map template to bridge_id
      const bridgeId =
        template === 'prose' ||
        template === 'plan' ||
        template === 'story' ||
        template === 'summary' ||
        template === 'refine' ||
        template === 'explain' ||
        template === 'clarify'
          ? (template as 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify')
          : 'summary';

      const draft = await api.createDraft(
        projectId,
        sourceConversationId,
        bridgeId,
        intentForLLM,
        undefined, // baseCommitHash
        undefined, // turnAnchorHash
        selectedText, // selected_text from curate preview
        { cosine: cosineThreshold, keepRatio: curatePreview?.keep_ratio }
      );

      setCurrentDraft(draft);

      // Set validation errors if validation failed
      if (draft.validation && !draft.validation.passed) {
        setValidationErrors({
          missing: draft.validation.missing_keywords,
          forbidden: draft.validation.forbidden_keywords,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDraftError(error.message);
    } finally {
      setIsGeneratingDraft(false);
    }
  }, [projectId, data, template, textBlocks, allPhrases, extractIntent]);

  // Handle Commit - create commit via API (or merge for merge drafts)
  const handleCommit = useCallback(async () => {
    if (!projectId || !data) {
      setCommitError('No project selected');
      return;
    }

    // Get source unit ID - prefer from textBlocks (dynamic), fallback to data.sourceConversationId (static)
    // This allows commits created from other commits to work when a unit is later connected
    const sourceUnitBlock = textBlocks.find((block) => block.sourceNodeType === 'unit');
    const sourceConversationId = sourceUnitBlock?.sourceNodeId || data.sourceConversationId;
    if (!sourceConversationId) {
      setCommitError('No source conversation found. Please connect a conversation to this commit.');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);
    setValidationErrors(null);

    try {
      // Check if this is a merge draft
      const isMerge = data.bridgePrompt === '/merge' && !!data.mergeConfig;

      if (isMerge) {
        // Merge commit flow
        if (!mergeResult) {
          setCommitError('Please analyze the merge first');
          setIsCommitting(false);
          return;
        }
        if (!allConflictsResolved) {
          setCommitError('Please resolve all conflicts first');
          setIsCommitting(false);
          return;
        }

        const { sourceCommitHash, targetCommitHash } = data.mergeConfig!;

        // Build resolved facets from auto-merged + conflict resolutions
        const resolvedFacets: api.ResolvedFacet[] = [];

        // Add auto-merged facets
        for (const auto of mergeResult.auto_merged_facets) {
          resolvedFacets.push({
            facet: auto.facet,
            text: auto.merged_text,
            source: auto.source, // backend returns 'base' | 'source' | 'target' | 'llm' | 'manual'
            keywords: auto.keywords || [],
          });
        }

        // Add resolved conflicts
        for (const conflict of mergeResult.conflicts) {
          const resolution = conflictResolutions[conflict.facet];
          if (!resolution) continue;

          // For delete_modify / modify_delete conflicts, one side may be null
          let text: string | null;
          if (resolution.choice === 'source') {
            text = conflict.source_text;
          } else if (resolution.choice === 'target') {
            text = conflict.target_text;
          } else {
            text = resolution.customText || '';
          }

          resolvedFacets.push({
            facet: conflict.facet,
            text,
            source: resolution.choice,
            keywords: [],
          });
        }

        // Determine branch
        // If user selected 'branch' mode, use their branch name or generate one
        const branch =
          data.pendingBranch === 'branch'
            ? data.pendingBranchName?.trim() || `branch-${Date.now()}`
            : 'main';

        console.log('[handleCommit:merge] Branch decision:', {
          pendingBranch: data.pendingBranch,
          pendingBranchName: data.pendingBranchName,
          computedBranch: branch,
          existingBranches: branches.map((b) => b.name),
          branchExists: branches.some((b) => b.name === branch),
        });

        // Create branch if needed (new branch that doesn't exist yet)
        if (branch !== 'main' && !branches.some((b) => b.name === branch)) {
          console.log('[handleCommit:merge] Creating new branch:', branch);
          try {
            await api.createBranch(projectId, branch, 'main', undefined, false);
            console.log('[handleCommit:merge] Branch created successfully:', branch);
          } catch (branchErr) {
            // Ignore if branch already exists (race condition)
            const errMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
            console.log('[handleCommit:merge] Branch creation error:', errMsg);
            if (!errMsg.includes('already exists')) {
              throw branchErr;
            }
          }
        } else {
          console.log('[handleCommit:merge] Skipping branch creation:', {
            branch,
            isMain: branch === 'main',
            exists: branches.some((b) => b.name === branch),
          });
        }

        // Create merge commit
        const currentPosition = node?.position;
        const commit = await api.createMergeCommit(
          projectId,
          sourceCommitHash!,
          targetCommitHash!,
          branch,
          data.title ||
            `Merge ${data.mergeConfig?.sourceCommitTitle} into ${data.mergeConfig?.targetCommitTitle}`,
          resolvedFacets,
          currentPosition ? { x: currentPosition.x, y: currentPosition.y } : undefined
        );

        // Trigger convert to committed state BEFORE updating node ID
        // (onConvertDraft closure captures the old node.id, so must be called first)
        onConvertDraft?.();

        // Update local node ID to match API commit_hash
        if (node && commit.commit_hash) {
          useCanvasStore.getState().updateNodeId(node.id, commit.commit_hash);
        }

        // Update local state with final values
        onUpdate({
          commitHash: commit.commit_hash,
          isMergeCommit: true,
        });

        // Refresh canvas data
        useCanvasStore.getState().loadProjectData(projectId);

        setIsCommitting(false);
        return;
      }

      // Regular commit flow
      let startTurnHash: string;
      let endTurnHash: string;

      // Determine turn_window: from source conversation or inherited from parent commit
      // For staging units, use conversationId if sourceConversationId is not set
      const sourceConversationId = data.sourceConversationId || data.conversationId;
      if (sourceConversationId) {
        // Case 1: Pending commit from conversation - fetch turns
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
        // Case 2: Pending commit from commit - use inherited turn_window
        startTurnHash = data.sourceTurnWindow.start_turn_hash;
        endTurnHash = data.sourceTurnWindow.end_turn_hash;
      } else {
        // Case 3: No valid source - cannot commit
        setCommitError('Cannot commit: no source conversation or turn window available.');
        setIsCommitting(false);
        return;
      }

      // 2. Determine branch
      // User's explicit choice (pendingBranch) takes priority
      let branch: string;
      if (data.pendingBranch === 'branch') {
        branch = data.pendingBranchName?.trim() || `branch-${Date.now()}`;
      } else {
        branch = 'main';
      }

      console.log('[handleCommit] Branch decision:', {
        pendingBranch: data.pendingBranch,
        pendingBranchName: data.pendingBranchName,
        computedBranch: branch,
        existingBranches: branches.map((b) => b.name),
        branchExists: branches.some((b) => b.name === branch),
      });

      // 3. Collect user selections
      // Get source excerpts (included phrases) from textBlocks or legacy allPhrases
      let sourceExcerpt: string[] = [];
      let mustHave: string[] = [];
      let mustntHave: string[] = [];

      if (textBlocks.length > 0) {
        // New system: get selected text from each block
        sourceExcerpt = textBlocks
          .map((block) => getSelectedText(block.tokens, block.selections))
          .filter((text) => text.length > 0);
        mustHave = [...mustHaveKeywordsNew];
        mustntHave = [...mustntHaveKeywordsNew];
      } else {
        // Legacy system: get included phrases
        sourceExcerpt = allPhrases.filter((p) => p.included).map((p) => p.text);
        mustHave = mustHaveKeywordsLegacy.map((kw) => kw.text);
        mustntHave = mustntHaveKeywordsLegacy.map((kw) => kw.text);
      }

      // 4. Create branch if needed (new branch that doesn't exist yet)
      if (branch !== 'main' && !branches.some((b) => b.name === branch)) {
        console.log('[handleCommit] Creating new branch:', branch);
        try {
          await api.createBranch(projectId, branch, 'main', undefined, false);
          console.log('[handleCommit] Branch created successfully:', branch);
        } catch (branchErr) {
          // Ignore if branch already exists (race condition)
          const errMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
          console.log('[handleCommit] Branch creation error:', errMsg);
          if (!errMsg.includes('already exists')) {
            throw branchErr;
          }
        }
      } else {
        console.log('[handleCommit] Skipping branch creation:', {
          branch,
          isMain: branch === 'main',
          exists: branches.some((b) => b.name === branch),
        });
      }

      // 5. Build source_refs from all upstream source nodes
      const sourceRefs: api.SourceRef[] = [];

      // Primary source: the conversation with turn_window
      sourceRefs.push({
        type: 'conversation',
        conversation_id: sourceConversationId,
        turn_window: { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
      });

      // Debug: Log textBlocks info
      console.log('[handleCommit] Building sourceRefs:', {
        sourceConversationId,
        textBlocksCount: textBlocks.length,
        textBlocks: textBlocks.map((b) => ({
          id: b.id,
          sourceNodeId: b.sourceNodeId,
          sourceNodeType: b.sourceNodeType,
          sourceNodeTitle: b.sourceNodeTitle,
        })),
      });

      // Additional sources from textBlocks (for multi-source commits)
      if (textBlocks.length > 0) {
        textBlocks.forEach((block) => {
          console.log('[handleCommit] Checking block:', {
            blockSourceNodeId: block.sourceNodeId,
            sourceConversationId,
            isMatch: block.sourceNodeId === sourceConversationId,
            willAdd: block.sourceNodeId && block.sourceNodeId !== sourceConversationId,
          });
          if (block.sourceNodeId && block.sourceNodeId !== sourceConversationId) {
            // In the unit model, source blocks come from units
            // Determine if it's a conversation ID or commit hash based on format
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
        });
      }

      console.log('[handleCommit] Final sourceRefs:', sourceRefs);

      // 6. Create Commit directly (Ring data already extracted during turn creation)
      // Get the current node position to save with the commit
      const currentPosition = node?.position;
      const commit = await api.createCommit(
        projectId,
        { start_turn_hash: startTurnHash, end_turn_hash: endTurnHash },
        branch,
        data.title,
        {
          sourceExcerpt,
          mustHave,
          mustntHave,
          position: currentPosition ? { x: currentPosition.x, y: currentPosition.y } : undefined,
          sourceRefs,
        }
      );

      // 7. Trigger convert to committed state BEFORE updating node ID
      // (onConvertDraft closure captures the old node.id, so must be called first)
      onConvertDraft?.();

      // 8. Update local node ID to match API commit_hash (before refresh)
      // This ensures edges are preserved when loadProjectData rebuilds the canvas
      if (node && commit.commit_hash) {
        useCanvasStore.getState().updateNodeId(node.id, commit.commit_hash);
      }

      // 9. Update local state with final values
      onUpdate({
        summary: resultText,
        bridgePrompt: template,
        isGenerated: true,
        commitHash: commit.commit_hash,
      });

      // 9. Refresh canvas data
      useCanvasStore.getState().loadProjectData(projectId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setCommitError(error.message);
      console.error('Failed to create commit:', error);
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
    onConvertDraft,
    textBlocks,
    allPhrases,
    mustHaveKeywordsNew,
    mustntHaveKeywordsNew,
    mustHaveKeywordsLegacy,
    mustntHaveKeywordsLegacy,
    mergeResult,
    conflictResolutions,
    allConflictsResolved,
    branches,
  ]);

  // Handle Diff - compare two commits
  const handleDiff = useCallback(async () => {
    if (!data?.commitHash || !diffTargetCommit) {
      setDiffError('Please select a commit to compare with');
      return;
    }

    if (data.commitHash === diffTargetCommit) {
      setDiffError('Cannot compare a commit with itself');
      return;
    }

    setIsDiffLoading(true);
    setDiffError(null);
    setDiffResult(null);

    try {
      const result = await api.diff(data.commitHash, diffTargetCommit);
      setDiffResult(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDiffError(error.message);
    } finally {
      setIsDiffLoading(false);
    }
  }, [data?.commitHash, diffTargetCommit]);

  // Handle Merge Analysis - analyze merge conflicts
  const handleMergeAnalysis = useCallback(async () => {
    if (!projectId || !data?.mergeConfig) {
      setMergeError('No merge configuration available');
      return;
    }

    const { baseCommitHash, sourceCommitHash, targetCommitHash } = data.mergeConfig;
    if (!baseCommitHash || !sourceCommitHash || !targetCommitHash) {
      setMergeError('Missing commit hashes for merge analysis');
      return;
    }

    setIsMergeAnalyzing(true);
    setMergeError(null);
    setMergeResult(null);
    setConflictResolutions({});

    try {
      const result = await api.merge(projectId, baseCommitHash, sourceCommitHash, targetCommitHash);
      setMergeResult(result);

      // Auto-resolve clean merges (no user action needed)
      // For conflicts, user must choose
      if (result.status === 'conflicts') {
        // Initialize conflict resolutions with 'target' as default
        const initialResolutions: Record<
          string,
          { choice: 'source' | 'target' | 'custom'; customText?: string }
        > = {};
        result.conflicts.forEach((conflict) => {
          initialResolutions[conflict.facet] = { choice: 'target' };
        });
        setConflictResolutions(initialResolutions);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setMergeError(error.message);
    } finally {
      setIsMergeAnalyzing(false);
    }
  }, [projectId, data?.mergeConfig]);

  // Scroll to bottom when new messages added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Chat loading state - disable send while loading history
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Track previous conversationId to detect first-time assignment
  const prevConversationIdRef = useRef<string | undefined>(undefined);

  // Load chat history from backend when modal opens for conversation
  useEffect(() => {
    const abortController = new AbortController();
    const currentConversationId = data?.conversationId;
    const prevConversationId = prevConversationIdRef.current;
    prevConversationIdRef.current = currentConversationId;

    const loadChatHistory = async () => {
      if (!data || data.kind !== 'unit' || !projectId || !currentConversationId) return;

      // If conversationId just changed from undefined to a value and we already have messages,
      // this means we just created the conversation during an active chat session.
      // Don't reload - the messages are already in state.
      if (prevConversationId === undefined && chatMessagesRef.current.length > 0) {
        console.log(
          '[loadChatHistory] Skipping reload - conversation just created during active chat'
        );
        return;
      }

      // Cancel any pending loadMore request when switching conversations
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;

      // Clear old messages and reset pagination state
      setChatMessages([]);
      setChatOffset(0);
      setChatHasMore(false);
      setIsChatLoading(true);
      try {
        // Fetch newest CHAT_PAGE_SIZE messages first (order=desc), then reverse for display
        const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, 0, {
          signal: abortController.signal,
          order: 'desc',
        });

        // Check if conversation changed during request (race condition fix)
        if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
          return;
        }

        // Reverse the array since we fetched newest first (order=desc)
        // but need to display oldest first in the chat UI
        const messages = response.turns
          .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
          .map((turn) => ({
            id: turn.turn_hash,
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
            // Parse rings data from API response
            rings: api.parseRingsData((turn as api.TurnDetail).rings),
          }))
          .reverse();
        setChatMessages(messages);

        // Check if there are more messages to load
        // If we got exactly CHAT_PAGE_SIZE turns, there might be more
        setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);
        setChatOffset(response.turns.length);
      } catch (err) {
        // Only log non-abort errors (ABORTED is expected when switching conversations)
        const isAbortError =
          abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
        if (!isAbortError) {
          console.error('Failed to load chat history:', err);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsChatLoading(false);
        }
      }
    };

    loadChatHistory();

    return () => {
      abortController.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [data?.kind, data?.conversationId, projectId]);

  // Load more (older) messages when scrolling to top
  const loadMoreMessages = useCallback(async () => {
    if (!projectId || !data?.conversationId || isLoadingMore || !chatHasMore) return;

    // Cancel any pending load more request
    loadMoreAbortRef.current?.abort();
    const abortController = new AbortController();
    loadMoreAbortRef.current = abortController;

    const currentConversationId = data?.conversationId;
    const container = messagesContainerRef.current;

    // Capture scroll position before loading
    const scrollHeightBefore = container?.scrollHeight ?? 0;

    setIsLoadingMore(true);
    try {
      const response = await api.listTurns(
        projectId,
        currentConversationId,
        CHAT_PAGE_SIZE,
        chatOffset,
        {
          order: 'desc',
          signal: abortController.signal,
        }
      );

      // Check for race condition: conversation changed or request aborted
      if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
        return;
      }

      if (response.turns.length === 0) {
        setChatHasMore(false);
        return;
      }

      // Older messages (fetched in desc order, need to reverse)
      const olderMessages = response.turns
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn) => ({
          id: turn.turn_hash,
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
          // Parse rings data from API response
          rings: api.parseRingsData((turn as api.TurnDetail).rings),
        }))
        .reverse();

      // Prepend older messages to the beginning
      setChatMessages((prev) => [...olderMessages, ...prev]);
      setChatOffset((prev) => prev + response.turns.length);
      setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);

      // Preserve scroll position after prepending
      // Use requestAnimationFrame to wait for DOM update
      requestAnimationFrame(() => {
        if (container && data?.conversationId === currentConversationId) {
          const scrollHeightAfter = container.scrollHeight;
          const heightDiff = scrollHeightAfter - scrollHeightBefore;
          container.scrollTop = container.scrollTop + heightDiff;
        }
      });
    } catch (err) {
      // Ignore abort errors
      const isAbortError =
        abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
      if (!isAbortError) {
        console.error('Failed to load more messages:', err);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingMore(false);
      }
    }
  }, [projectId, data?.conversationId, chatOffset, chatHasMore, isLoadingMore]);

  // Handle scroll to detect when user reaches top
  const handleChatScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      // Load more when scrolled near the top (within 50px)
      if (target.scrollTop < 50 && chatHasMore && !isLoadingMore && !isChatLoading) {
        loadMoreMessages();
      }
    },
    [chatHasMore, isLoadingMore, isChatLoading, loadMoreMessages]
  );

  // Chat streaming state
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);

  // Capture current values for use in async callback (avoid stale closures)
  const conversationIdRef = useRef(data?.conversationId);
  const nodeKindRef = useRef(data?.kind);
  const chatMessagesRef = useRef(chatMessages);
  useEffect(() => {
    conversationIdRef.current = data?.conversationId;
    nodeKindRef.current = data?.kind;
  }, [data?.conversationId, data?.kind]);
  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatStreaming || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatError(null);

    // Add user message to chat
    const newUserMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: userMessage,
    };
    setChatMessages((prev) => [...prev, newUserMessage]);

    // If no projectId, we can still chat (just won't save turns)
    // For now, we'll use the chat API directly

    setIsChatStreaming(true);
    setStreamingContent('');

    try {
      // Build messages array from chat history (use ref to get latest)
      const currentMessages = chatMessagesRef.current;
      const messages: api.ChatMessage[] = [
        ...currentMessages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      // Use streaming chat
      let fullResponse = '';
      let addedFinalMessage = false;

      for await (const event of api.chatStream({ messages })) {
        if (event.type === 'token' && event.content) {
          fullResponse += event.content;
          setStreamingContent(fullResponse);
        } else if (event.type === 'done') {
          // Update fullResponse with done event content if available (ensures we have complete response)
          if (event.content) {
            fullResponse = event.content;
          }
          // Add assistant message to chat (only once)
          if (!addedFinalMessage) {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}`,
                role: 'assistant' as const,
                content: fullResponse,
              },
            ]);
            setStreamingContent('');
            addedFinalMessage = true;
          }
        } else if (event.type === 'error') {
          setChatError(event.message || 'Unknown error');
        }
      }

      // If we didn't get a done event but have content, add it
      if (fullResponse && !addedFinalMessage) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant' as const,
            content: fullResponse,
          },
        ]);
        setStreamingContent('');
      }

      // If projectId is available and this is a conversation node, save the turns
      // Use refs to get current values (avoiding stale closure)
      let currentConversationId = conversationIdRef.current;
      const currentKind = nodeKindRef.current;
      console.log('[handleSendMessage] Save turns check:', {
        projectId,
        currentKind,
        currentConversationId,
        fullResponseLength: fullResponse.length,
        fullResponsePreview: fullResponse.slice(0, 100),
        addedFinalMessage,
      });
      if (projectId && currentKind === 'unit') {
        try {
          // If no conversationId yet, create one first
          if (!currentConversationId) {
            console.log('[handleSendMessage] Creating new conversation...');
            const newConv = await api.createConversation(
              projectId,
              data?.title || 'Untitled Conversation'
            );
            currentConversationId = newConv.conversation_id;
            // Update the node with the new conversationId and sourceConversationId
            onUpdate({
              conversationId: currentConversationId,
              sourceConversationId: currentConversationId,
            });
            conversationIdRef.current = currentConversationId;
            // Also update the node ID in the store to match conversation ID
            if (node?.id && node.id !== currentConversationId) {
              useCanvasStore.getState().updateNodeId(node.id, currentConversationId);
            }
            console.log('[handleSendMessage] Created conversation:', currentConversationId);
          }

          // Save user turn
          console.log('[handleSendMessage] Saving user turn...');
          await api.createTurn(projectId, currentConversationId, 'user', userMessage);
          console.log('[handleSendMessage] User turn saved');
          // Save assistant turn
          if (fullResponse) {
            console.log('[handleSendMessage] Saving assistant turn...', {
              length: fullResponse.length,
            });
            try {
              await api.createTurn(projectId, currentConversationId, 'assistant', fullResponse);
              console.log('[handleSendMessage] Assistant turn saved successfully');
            } catch (assistantErr) {
              console.error('[handleSendMessage] Failed to save assistant turn:', assistantErr);
            }
          } else {
            console.warn('[handleSendMessage] No fullResponse to save as assistant turn');
          }
        } catch (err) {
          console.error('[handleSendMessage] Failed to save turns:', err);
          // Don't show error to user - chat still worked
        }
      } else {
        console.log('[handleSendMessage] Skipping turn save - conditions not met');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setChatError(error.message);
      console.error('Chat error:', error);
    } finally {
      setIsChatStreaming(false);
      setStreamingContent(''); // Clear any residual streaming content
    }
  }, [chatInput, isChatStreaming, isChatLoading, projectId, data?.title, onUpdate]); // chatMessages accessed via ref to avoid frequent rebuilds

  const handleChatKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============================================
  // CONVERSATION NODE - Sidebar left, Chat interface right
  // ============================================
  if (isConversation) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col w-[95vw] max-w-[1400px] h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top Bar */}
          <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[0.95rem] font-semibold text-gray-800">
                {isStagingUnit ? 'Unit (Staging)' : 'Unit'}: {data.title || 'Untitled'}
              </h2>
              <span className="text-xs text-gray-400 font-mono">{data.entryId}</span>
              {isStagingUnit && (
                <Badge
                  variant="outline"
                  className="text-[0.65rem] text-slate-500 uppercase tracking-wider border-dashed border-slate-400/40 bg-slate-500/15"
                >
                  staging
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
                title="Edit Meta"
                className="h-9 w-9"
              >
                <Settings size={18} />
              </Button>
              {/* For staging units: show Commit button to enter commit config view */}
              {isStagingUnit && (
                <Button
                  onClick={() => {
                    console.log(
                      '[NodeModal] Commit button clicked - switching to commit config view'
                    );
                    setShowCommitConfig(true);
                  }}
                  title="Configure and commit this unit"
                  className="gap-1.5"
                >
                  <Check size={16} />
                  <span>Commit</span>
                </Button>
              )}
              {/* For committed units: show Create Unit button */}
              {addCommitAction && !isStagingUnit && (
                <Button
                  onClick={() => {
                    addCommitAction.onClick();
                    onClose();
                  }}
                  disabled={addCommitAction.disabled}
                  title="Create a new unit from this one"
                  className="gap-1.5"
                >
                  <GitCommit size={16} />
                  <span>Create Unit</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="h-9 w-9 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </Button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden min-h-0" ref={containerRef}>
            {/* Left Sidebar - Metadata */}
            <aside
              className={cn(
                'min-w-[200px] p-5 overflow-y-auto shrink-0 bg-gray-50',
                showSettings ? 'block' : 'hidden md:block'
              )}
              style={{ width: sidebarWidth }}
            >
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Metadata
                </h4>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                  <Input
                    type="text"
                    value={data.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags</label>
                  <Input
                    type="text"
                    value={data.tags.join(', ')}
                    onChange={(e) =>
                      onUpdate({
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="tag1, tag2, ..."
                  />
                </div>
              </div>

              <div className="h-px bg-gray-200 my-4" />

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Info
                </h4>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  <span>Created: {data.timestamp}</span>
                </div>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Link2 size={14} className="text-gray-400 shrink-0" />
                  <span>Upstream: {data.baselineSummary ? 'Connected' : 'None (root)'}</span>
                </div>
              </div>
            </aside>

            {/* Draggable Divider */}
            <div
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors relative group"
              onMouseDown={handleDividerMouseDown}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-10 bg-gray-400 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Main Content - Chat Interface */}
            <div className="flex-1 min-w-0 flex flex-col h-full">
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-6 flex flex-col gap-4"
                onScroll={handleChatScroll}
              >
                {isChatLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center gap-2">
                    <Loader2 size={48} strokeWidth={1} className="animate-spin" />
                    <p className="text-base font-medium text-gray-500">Loading conversation...</p>
                  </div>
                ) : chatMessages.length === 0 && !isChatStreaming ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center gap-2">
                    <MessageSquarePlus size={48} strokeWidth={1} />
                    <p className="text-base font-medium text-gray-500">No messages yet</p>
                    <span className="text-[0.85rem] text-gray-400">
                      Type a message below to start the conversation
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Load more indicator at top */}
                    {isLoadingMore && (
                      <div className="flex items-center justify-center gap-2 py-3 text-gray-500 text-[13px]">
                        <Loader2 size={16} className="animate-spin" />
                        <span>Loading older messages...</span>
                      </div>
                    )}
                    {chatHasMore && !isLoadingMore && (
                      <div className="flex items-center justify-center gap-2 py-3 text-gray-500 text-[13px]">
                        <Button variant="outline" size="sm" onClick={loadMoreMessages}>
                          Load older messages
                        </Button>
                      </div>
                    )}
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'max-w-[80%] py-3 px-4 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-200',
                          msg.role === 'user'
                            ? 'self-end bg-blue-500 text-white rounded-br-sm'
                            : 'self-start bg-gray-100 text-gray-800 rounded-bl-sm'
                        )}
                      >
                        <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        {/* Ring 1 Meta: topic and timeAnchor */}
                        {(msg.rings?.ring1?.topic || msg.rings?.ring1?.timeAnchor) && (
                          <div className="mt-2 pt-2 border-t border-gray-200/50 flex flex-wrap gap-2 text-[0.7rem]">
                            {msg.rings.ring1.topic && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                <Tag size={10} />
                                {msg.rings.ring1.topic}
                              </span>
                            )}
                            {msg.rings.ring1.timeAnchor && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                <Clock size={10} />
                                {msg.rings.ring1.timeAnchor}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Ring 1 Keywords - with polarity colors and entity types */}
                        {msg.rings?.ring1?.keywords && msg.rings.ring1.keywords.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {msg.rings.ring1.keywords.map((kw, idx) => (
                              <span
                                key={`${kw.text}-${idx}`}
                                className={cn(
                                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.7rem] font-medium',
                                  // Polarity colors
                                  kw.polarity === 1 && 'bg-green-100 text-green-700',
                                  kw.polarity === 0 && 'bg-gray-100 text-gray-600',
                                  kw.polarity === -1 && 'bg-red-100 text-red-700'
                                )}
                                title={`${kw.lemma} (${kw.pos})${kw.entityType ? ` [${kw.entityType}]` : ''}`}
                              >
                                {/* Entity type icon */}
                                {kw.entityType === 'LOCATION' && <span>📍</span>}
                                {kw.entityType === 'PERSON' && <span>👤</span>}
                                {kw.entityType === 'DATE' && <span>📅</span>}
                                {kw.entityType === 'ORGANIZATION' && <span>🏢</span>}
                                {kw.entityType === 'EVENT' && <span>🎉</span>}
                                {kw.entityType === 'NUMBER' && <span>#</span>}
                                {kw.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Ring 1 Preference Keywords - highlighted separately */}
                        {msg.rings?.ring1?.preferenceKeywords && msg.rings.ring1.preferenceKeywords.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="text-[0.65rem] text-gray-400 mr-1">偏好:</span>
                            {msg.rings.ring1.preferenceKeywords.map((kw, idx) => (
                              <span
                                key={`pref-${kw.text}-${idx}`}
                                className={cn(
                                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.7rem] font-medium border',
                                  kw.polarity === 1 && 'bg-green-50 text-green-700 border-green-300',
                                  kw.polarity === -1 && 'bg-red-50 text-red-700 border-red-300'
                                )}
                              >
                                {kw.polarity === 1 ? '✓' : '✗'} {kw.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Ring 2 Facets - structured semantic data */}
                        {msg.rings?.ring2?.facets && msg.rings.ring2.facets.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {msg.rings.ring2.facets.map((facet, idx) => (
                              <span
                                key={`facet-${facet.key}-${idx}`}
                                className={cn(
                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-medium',
                                  // Facet type colors
                                  facet.facetType === 'intent_seed' && 'bg-indigo-100 text-indigo-700',
                                  facet.facetType === 'time_window' && 'bg-cyan-100 text-cyan-700',
                                  facet.facetType === 'preference_soft' && 'bg-amber-100 text-amber-700',
                                  facet.facetType === 'unknown_slot' && 'bg-slate-100 text-slate-600'
                                )}
                                title={`${facet.facetType}: ${facet.key} = ${JSON.stringify(facet.value)} (${Math.round(facet.confidence * 100)}%)`}
                              >
                                {/* Facet type icon */}
                                {facet.facetType === 'intent_seed' && '🎯'}
                                {facet.facetType === 'time_window' && '⏰'}
                                {facet.facetType === 'preference_soft' && '💡'}
                                {facet.facetType === 'unknown_slot' && '❓'}
                                <span className="font-semibold">{facet.key}:</span>
                                <span>{String(facet.value)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Ring 3 Segments - sentence-level breakdown */}
                        {msg.rings?.ring3?.segments && msg.rings.ring3.segments.length > 1 && (
                          <div className="mt-1 space-y-0.5">
                            <span className="text-[0.6rem] text-gray-400">句子分段:</span>
                            <div className="flex flex-col gap-0.5">
                              {msg.rings.ring3.segments.map((seg, idx) => (
                                <div
                                  key={seg.segmentId}
                                  className="flex items-start gap-1 text-[0.65rem]"
                                  title={`字符 ${seg.startChar}-${seg.endChar}`}
                                >
                                  <span className="text-gray-400 shrink-0">{idx + 1}.</span>
                                  <span className="text-gray-600">{seg.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Streaming response */}
                    {isChatStreaming && streamingContent && (
                      <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-blue-50 text-gray-800">
                        <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                          {streamingContent}
                          <span className="animate-pulse text-blue-500">▊</span>
                        </div>
                      </div>
                    )}
                    {/* Loading indicator when streaming starts */}
                    {isChatStreaming && !streamingContent && (
                      <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Loader2 size={16} className="animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    )}
                    {/* Chat error */}
                    {chatError && (
                      <div className="flex items-center gap-2 py-3 px-4 mx-6 my-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-[0.85rem]">
                        <AlertCircle size={16} />
                        <span>{chatError}</span>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3 items-end">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                  rows={3}
                  disabled={isChatStreaming || isChatLoading}
                  className="flex-1 resize-none"
                />
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isChatStreaming || isChatLoading}
                  className="h-11 w-11 rounded-xl shrink-0"
                >
                  {isChatStreaming || isChatLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Send size={20} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // PENDING COMMIT - Single View Two Zones Design (editable)
  // ============================================
  if (isPendingCommit) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col w-[95vw] max-w-[1400px] h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top Bar */}
          <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="text-[0.85rem] font-bold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-md">
                t3x
              </div>
              <h2 className="text-[0.95rem] font-semibold text-gray-800">
                Commit: {data.title || 'Untitled'}
              </h2>
              <span className="text-xs text-gray-400 font-mono">{data.entryId}</span>
              <Badge
                variant="outline"
                className="text-[0.65rem] text-slate-500 uppercase tracking-wider border-dashed border-slate-400/40 bg-slate-500/15"
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
                className="h-9 w-9 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </Button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0 overflow-hidden" ref={draftBodyRef}>
            {/* ========== LEFT SIDEBAR: Config Zone (STEP 1 + STEP 2) ========== */}
            <aside
              className="min-w-[220px] max-w-[400px] p-5 bg-gray-50 flex flex-col overflow-y-auto shrink-0"
              style={{ width: sidebarSourceDividerPos }}
            >
              {/* STEP 1: Configure (or Merge for merge drafts) */}
              <div
                className={cn(
                  'flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto',
                  (configLocked || isMergeDraft) && 'opacity-95'
                )}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[0.7rem] font-bold text-gray-500 uppercase tracking-widest">
                    {isMergeDraft ? 'MERGE' : 'STEP 1'}
                  </span>
                  <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-gray-800">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        !configLocked && !isMergeDraft ? 'bg-emerald-500' : 'bg-gray-500'
                      )}
                    />
                    {isMergeDraft ? 'Analyze & Resolve' : 'Configure'}
                    {configLocked && !isMergeDraft && (
                      <Lock size={12} className="text-gray-400 ml-1" />
                    )}
                  </span>
                </div>

                {/* Merge Draft: Show merge-specific UI */}
                {isMergeDraft ? (
                  <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex-1 min-h-0 overflow-y-auto">
                    {/* Merge info header */}
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                      <GitCompare size={16} />
                      <span>
                        Merge: {data?.mergeConfig?.sourceCommitTitle} →{' '}
                        {data?.mergeConfig?.targetCommitTitle}
                      </span>
                    </div>

                    {/* Merge error */}
                    {mergeError && (
                      <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                        <AlertCircle size={14} />
                        <span>{mergeError}</span>
                      </div>
                    )}

                    {/* Analyze button - only show if not analyzed yet */}
                    {!mergeResult && (
                      <Button
                        onClick={handleMergeAnalysis}
                        disabled={isMergeAnalyzing}
                        className="w-full gap-2"
                      >
                        {isMergeAnalyzing ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <GitCompare size={16} />
                            <span>Analyze Merge</span>
                          </>
                        )}
                      </Button>
                    )}

                    {/* Merge result */}
                    {mergeResult && (
                      <div className="flex flex-col gap-3">
                        {/* Status badge */}
                        <div
                          className={cn(
                            'flex items-center gap-2 py-2 px-3 rounded-md text-[0.85rem] font-medium',
                            mergeResult.status === 'clean'
                              ? 'bg-green-50 border border-green-200 text-green-700'
                              : 'bg-yellow-50 border border-yellow-300 text-amber-700'
                          )}
                        >
                          {mergeResult.status === 'clean' ? (
                            <>
                              <Check size={14} />
                              <span>Clean merge - no conflicts</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={14} />
                              <span>
                                {mergeResult.conflicts.length} conflict(s) need resolution
                              </span>
                            </>
                          )}
                        </div>

                        {/* Auto-merged facets summary */}
                        {mergeResult.auto_merged_facets.length > 0 && (
                          <div className="text-sm text-slate-500">
                            <span>
                              {mergeResult.auto_merged_facets.length} facet(s) auto-merged
                            </span>
                          </div>
                        )}

                        {/* Conflicts list */}
                        {mergeResult.conflicts.length > 0 && (
                          <div className="flex flex-col gap-3">
                            <div className="font-semibold text-[0.85rem] text-slate-600">
                              Resolve Conflicts:
                            </div>
                            {mergeResult.conflicts.map((conflict) => (
                              <div
                                key={conflict.facet}
                                className="p-3 bg-white border border-slate-200 rounded-md"
                              >
                                <div className="font-semibold text-[0.85rem] text-slate-800 mb-2">
                                  {conflict.facet}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors">
                                    <input
                                      type="radio"
                                      name={`conflict-${conflict.facet}`}
                                      checked={
                                        conflictResolutions[conflict.facet]?.choice === 'source'
                                      }
                                      onChange={() =>
                                        setConflictResolutions((prev) => ({
                                          ...prev,
                                          [conflict.facet]: { choice: 'source' },
                                        }))
                                      }
                                      className="mt-0.5"
                                    />
                                    <span className="font-medium text-sm text-slate-600 min-w-[50px]">
                                      Source
                                    </span>
                                    <span className="text-xs text-slate-400 truncate flex-1">
                                      {conflict.source_text
                                        ? `${conflict.source_text.slice(0, 50)}...`
                                        : '(deleted)'}
                                    </span>
                                  </label>
                                  <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors">
                                    <input
                                      type="radio"
                                      name={`conflict-${conflict.facet}`}
                                      checked={
                                        conflictResolutions[conflict.facet]?.choice === 'target'
                                      }
                                      onChange={() =>
                                        setConflictResolutions((prev) => ({
                                          ...prev,
                                          [conflict.facet]: { choice: 'target' },
                                        }))
                                      }
                                      className="mt-0.5"
                                    />
                                    <span className="font-medium text-sm text-slate-600 min-w-[50px]">
                                      Target
                                    </span>
                                    <span className="text-xs text-slate-400 truncate flex-1">
                                      {conflict.target_text
                                        ? `${conflict.target_text.slice(0, 50)}...`
                                        : '(deleted)'}
                                    </span>
                                  </label>
                                  <label className="flex items-start gap-2 cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors">
                                    <input
                                      type="radio"
                                      name={`conflict-${conflict.facet}`}
                                      checked={
                                        conflictResolutions[conflict.facet]?.choice === 'custom'
                                      }
                                      onChange={() =>
                                        setConflictResolutions((prev) => ({
                                          ...prev,
                                          [conflict.facet]: {
                                            choice: 'custom',
                                            customText: prev[conflict.facet]?.customText || '',
                                          },
                                        }))
                                      }
                                      className="mt-0.5"
                                    />
                                    <span className="font-medium text-sm text-slate-600 min-w-[50px]">
                                      Custom
                                    </span>
                                  </label>
                                  {conflictResolutions[conflict.facet]?.choice === 'custom' && (
                                    <Textarea
                                      placeholder="Enter custom resolution..."
                                      value={conflictResolutions[conflict.facet]?.customText || ''}
                                      onChange={(e) =>
                                        setConflictResolutions((prev) => ({
                                          ...prev,
                                          [conflict.facet]: {
                                            choice: 'custom',
                                            customText: e.target.value,
                                          },
                                        }))
                                      }
                                      className="min-h-[60px] text-sm mt-1"
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Re-analyze button */}
                        <Button
                          variant="secondary"
                          onClick={handleMergeAnalysis}
                          disabled={isMergeAnalyzing}
                          className="w-full gap-2"
                        >
                          <RotateCcw size={14} />
                          <span>Re-analyze</span>
                        </Button>
                      </div>
                    )}

                    {/* Commit button for merge */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        onClick={handleCommit}
                        disabled={!mergeResult || !allConflictsResolved || isCommitting}
                        title={
                          !mergeResult
                            ? 'Analyze merge first'
                            : !allConflictsResolved
                              ? 'Resolve all conflicts first'
                              : ''
                        }
                        className="flex-1 gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                      >
                        {isCommitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Committing...</span>
                          </>
                        ) : (
                          <>
                            <GitCommit size={16} />
                            <span>Commit Merge</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : !configLocked ? (
                  /* Unlocked state: Show editable controls */
                  <div className="flex flex-col gap-4">
                    {/* Branch Selection - from real API data */}
                    {shouldShowBranchSelect && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center">
                          Branch
                          {branchesLoading && <Loader2 size={12} className="animate-spin ml-1" />}
                        </label>
                        <select
                          className="w-full py-2 px-3 border border-gray-300 rounded-md text-[0.85rem] bg-white text-gray-800 cursor-pointer focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                          value={
                            // Map the value to a valid option
                            data.pendingBranch === 'main'
                              ? 'main'
                              : data.pendingBranchName &&
                                  branches.some((b) => b.name === data.pendingBranchName)
                                ? data.pendingBranchName
                                : data.pendingBranchName
                                  ? '__new__'
                                  : // Has custom name, show as new branch
                                    '__new__' // Default: new branch mode
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
                          <option value="__new__">+ New branch...</option>
                        </select>
                      </div>
                    )}

                    {/* Branch Name - only shown when creating new branch */}
                    {requireBranchName &&
                      data.pendingBranch === 'branch' &&
                      !branches.some((b) => b.name === data.pendingBranchName) && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            New Branch Name
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
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Template
                      </label>
                      <select
                        className="w-full py-2 px-3 border border-gray-300 rounded-md text-[0.85rem] bg-white text-gray-800 cursor-pointer focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        What to extract
                      </label>
                      <Textarea
                        className="w-full text-sm min-h-[60px] resize-none"
                        placeholder="Describe what you want to extract from this conversation..."
                        value={extractIntent}
                        onChange={(e) => setExtractIntent(e.target.value)}
                      />
                      {!extractIntent.trim() && (
                        <span className="text-xs text-amber-600">
                          Required: describe what to extract
                        </span>
                      )}
                    </div>

                    {/* Cosine Threshold */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Filter Strictness
                      </label>
                      <input
                        type="range"
                        className="w-full h-1.5 rounded-sm bg-gray-200 accent-indigo-500 cursor-pointer"
                        min="0"
                        max="1"
                        step="0.05"
                        value={cosineThreshold}
                        onChange={(e) => setCosineThreshold(parseFloat(e.target.value))}
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>More content</span>
                        <span className="font-medium text-gray-600">{(100 - cosineThreshold * 60).toFixed(0)}%</span>
                        <span>Less content</span>
                      </div>
                    </div>

                    {/* Keywords Threshold */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Keywords
                      </label>
                      <input
                        type="range"
                        className="w-full h-1.5 rounded-sm bg-gray-200 accent-indigo-500 cursor-pointer"
                        min="0"
                        max="1"
                        step="0.05"
                        value={keywordsThreshold}
                        onChange={(e) => setKeywordsThreshold(parseFloat(e.target.value))}
                      />
                      <span className="text-[0.85rem] font-semibold text-gray-600 text-right">
                        {keywordsThreshold.toFixed(2)}
                      </span>
                    </div>

                    {/* Curate Preview Status */}
                    {(isCurateLoading || curatePreview || curateError) && (
                      <div className="flex flex-col gap-1.5 p-2 bg-gray-50 rounded-md border border-gray-200">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Preview
                        </span>
                        {isCurateLoading ? (
                          <div className="flex items-center gap-2 text-[0.8rem] text-gray-500">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Computing embeddings...</span>
                          </div>
                        ) : curateError ? (
                          <div className="flex items-center gap-2 text-[0.8rem] text-red-500">
                            <AlertCircle size={14} />
                            <span>{curateError}</span>
                          </div>
                        ) : curatePreview ? (
                          <div className="flex items-center gap-2 text-[0.8rem] text-gray-600">
                            <span>Auto-selected:</span>
                            <span className="font-medium text-emerald-600">
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
                        className="flex-1 gap-1.5 bg-emerald-500 hover:bg-emerald-600"
                      >
                        <Check size={16} />
                        <span>Proceed</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Locked state: Show read-only summary */
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      {shouldShowBranchSelect && (
                        <div className="flex items-center gap-2 text-[0.85rem]">
                          <span className="text-gray-500 min-w-[70px]">Branch:</span>
                          <span className="text-gray-800 font-medium">
                            {data.pendingBranch || 'branch'}
                          </span>
                        </div>
                      )}
                      {requireBranchName && (
                        <div className="flex items-center gap-2 text-[0.85rem]">
                          <span className="text-gray-500 min-w-[70px]">Name:</span>
                          <span className="text-gray-800 font-medium">
                            {data.pendingBranchName || '-'}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[0.85rem]">
                        <span className="text-gray-500 min-w-[70px]">Template:</span>
                        <span className="text-gray-800 font-medium">{template}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[0.85rem]">
                        <span className="text-gray-500 min-w-[70px]">Cosine:</span>
                        <span className="text-gray-800 font-medium">
                          {cosineThreshold.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[0.85rem]">
                        <span className="text-gray-500 min-w-[70px]">Keywords:</span>
                        <span className="text-gray-800 font-medium">
                          {keywordsThreshold.toFixed(2)}
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

              <div className="h-px bg-gray-200 my-5" />

              {/* STEP 2: Curate */}
              <div
                className={cn(
                  'flex flex-col gap-4',
                  !configLocked && 'opacity-50 pointer-events-none'
                )}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[0.7rem] font-bold text-gray-500 uppercase tracking-widest">
                    STEP 2
                  </span>
                  <span className="flex items-center gap-2 text-[0.95rem] font-semibold text-gray-800">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        configLocked ? 'bg-emerald-500' : 'bg-gray-300'
                      )}
                    />
                    Curate
                  </span>
                </div>

                {!configLocked ? (
                  /* Disabled state: Show hint */
                  <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg text-gray-400 text-[0.85rem]">
                    <Lock size={16} />
                    <span>Complete Step 1 first</span>
                  </div>
                ) : (
                  /* Enabled state: Show stats and commit button */
                  <>
                    <div className="flex gap-4">
                      {hasNewSourceData ? (
                        <>
                          <span className="text-[0.85rem] text-gray-600">
                            {selectionsCount} selections
                          </span>
                          <span className="text-[0.85rem] text-gray-600">
                            {mustHaveKeywordsNew.length} must
                          </span>
                          <span className="text-[0.85rem] text-gray-600">
                            {mustntHaveKeywordsNew.length} mustnt
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[0.85rem] text-gray-600">
                            {includedPhrasesCount} phrases
                          </span>
                          <span className="text-[0.85rem] text-gray-600">
                            {mustHaveKeywordsLegacy.length} must
                          </span>
                          <span className="text-[0.85rem] text-gray-600">
                            {mustntHaveKeywordsLegacy.length} mustnt
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-sm text-gray-400">
                      {hasNewSourceData
                        ? 'Drag to select text · Click to mark keywords'
                        : 'Click phrases in SOURCE to toggle inclusion'}
                    </p>

                    {/* Draft error */}
                    {draftError && (
                      <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                        <AlertCircle size={14} />
                        <span>{draftError}</span>
                      </div>
                    )}

                    {/* Validation result */}
                    {currentDraft && (
                      <div
                        className={cn(
                          'flex items-start gap-2 py-2 px-3 rounded-md text-sm',
                          validationPassed
                            ? 'bg-green-50 border border-green-200 text-green-700'
                            : 'bg-red-50 border border-red-200 text-red-700'
                        )}
                      >
                        {validationPassed ? (
                          <>
                            <Check size={14} className="mt-0.5" />
                            <span>Validation passed</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} className="mt-0.5" />
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">Validation Failed</span>
                              {validationErrors?.missing && validationErrors.missing.length > 0 && (
                                <span className="text-xs text-red-600">
                                  Missing: {validationErrors.missing.join(', ')}
                                </span>
                              )}
                              {validationErrors?.forbidden &&
                                validationErrors.forbidden.length > 0 && (
                                  <span className="text-xs text-red-600">
                                    Forbidden: {validationErrors.forbidden.join(', ')}
                                  </span>
                                )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Commit error */}
                    {commitError && (
                      <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                        <AlertCircle size={14} />
                        <span>{commitError}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 mt-2">
                      {/* Show different buttons based on source type */}
                      {isMergeDraft ? (
                        /* Merge draft - analyze and commit */
                        <Button
                          onClick={handleCommit}
                          disabled={!mergeResult || !allConflictsResolved || isCommitting}
                          title={
                            !mergeResult
                              ? 'Analyze merge first'
                              : !allConflictsResolved
                                ? 'Resolve all conflicts first'
                                : ''
                          }
                          className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                        >
                          {isCommitting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Creating merge commit...</span>
                            </>
                          ) : (
                            <>
                              <GitMerge size={16} />
                              <span>Create Merge Commit</span>
                            </>
                          )}
                        </Button>
                      ) : hasSourceConversation ? (
                        <>
                          {/* Generate Draft Button - only for conversation-derived pending commits */}
                          <Button
                            variant="secondary"
                            onClick={handleValidatePendingCommit}
                            disabled={
                              (hasNewSourceData
                                ? selectionsCount === 0
                                : includedPhrasesCount === 0) || isGeneratingDraft
                            }
                            className="w-full gap-2"
                          >
                            {isGeneratingDraft ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                <span>Validating...</span>
                              </>
                            ) : (
                              <>
                                <GitBranch size={16} />
                                <span>{currentDraft ? 'Re-validate' : 'Validate'}</span>
                              </>
                            )}
                          </Button>

                          {/* Commit Button - only enabled after validation passed */}
                          {/* For merge drafts: enabled after merge analysis + conflicts resolved */}
                          <Button
                            onClick={handleCommit}
                            disabled={
                              isMergeDraft
                                ? !mergeResult || !allConflictsResolved || isCommitting
                                : !validationPassed || isCommitting
                            }
                            title={
                              isMergeDraft
                                ? !mergeResult
                                  ? 'Analyze merge first'
                                  : !allConflictsResolved
                                    ? 'Resolve all conflicts first'
                                    : ''
                                : !currentDraft
                                  ? 'Run validation first'
                                  : !validationPassed
                                    ? 'Validation must pass before committing'
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
                                <span>Commit</span>
                              </>
                            )}
                          </Button>
                        </>
                      ) : hasSourceTurnWindow ? (
                        /* Commit-derived pending commits with inherited turn_window - local validation */
                        <>
                          {/* Local Validate Button */}
                          <Button
                            variant="secondary"
                            onClick={handleLocalValidation}
                            disabled={
                              hasNewSourceData ? selectionsCount === 0 : includedPhrasesCount === 0
                            }
                            className="w-full gap-2"
                          >
                            <GitBranch size={16} />
                            <span>
                              {localValidationPassed !== null ? 'Re-validate' : 'Validate'}
                            </span>
                          </Button>

                          {/* Local Validation Result */}
                          {localValidationPassed !== null && (
                            <div
                              className={cn(
                                'flex items-start gap-2 py-2 px-3 rounded-md text-sm',
                                localValidationPassed
                                  ? 'bg-green-50 border border-green-200 text-green-700'
                                  : 'bg-red-50 border border-red-200 text-red-700'
                              )}
                            >
                              {localValidationPassed ? (
                                <>
                                  <Check size={14} className="mt-0.5" />
                                  <span>Local validation passed</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle size={14} className="mt-0.5" />
                                  <div className="flex flex-col gap-1">
                                    <span>Local validation failed</span>
                                    {localValidationErrors?.missing &&
                                      localValidationErrors.missing.length > 0 && (
                                        <span className="text-xs">
                                          Missing: {localValidationErrors.missing.join(', ')}
                                        </span>
                                      )}
                                    {localValidationErrors?.forbidden &&
                                      localValidationErrors.forbidden.length > 0 && (
                                        <span className="text-xs">
                                          Forbidden: {localValidationErrors.forbidden.join(', ')}
                                        </span>
                                      )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Commit Button - enabled after local validation passed */}
                          {/* For merge drafts: enabled after merge analysis + conflicts resolved */}
                          <Button
                            onClick={handleCommit}
                            disabled={
                              isMergeDraft
                                ? !mergeResult || !allConflictsResolved || isCommitting
                                : localValidationPassed !== true || isCommitting
                            }
                            title={
                              isMergeDraft
                                ? !mergeResult
                                  ? 'Analyze merge first'
                                  : !allConflictsResolved
                                    ? 'Resolve all conflicts first'
                                    : ''
                                : localValidationPassed === null
                                  ? 'Run validation first'
                                  : localValidationPassed
                                    ? ''
                                    : 'Validation must pass before committing'
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
                                <span>Commit</span>
                              </>
                            )}
                          </Button>
                        </>
                      ) : (
                        /* No valid source - cannot commit */
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700">
                          <AlertCircle size={14} className="mt-0.5 shrink-0" />
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-sm">Cannot commit</span>
                            <span className="text-xs text-amber-600">
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
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors relative group"
              onMouseDown={handleSidebarSourceDivider}
            >
              <div className="draft-svtz__divider-handle" />
            </div>

            {/* ========== MAIN CONTENT: SOURCE ========== */}
            <div
              className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden"
              ref={mainContentRef}
            >
              {/* SOURCE Column - Full Width */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {isMergeDraft ? 'MERGE CONTENT' : 'SOURCE'}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Merge draft - show merge analysis results */}
                  {isMergeDraft ? (
                    <div>
                      {!mergeResult ? (
                        /* Before analysis - show prompt */
                        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                          <GitCompare size={48} strokeWidth={1} className="text-gray-300 mb-4" />
                          <h4 className="font-semibold text-gray-700 mb-2">
                            Merge Analysis Required
                          </h4>
                          <p className="text-sm text-gray-500 mb-6">
                            Click &quot;Analyze Merge&quot; in the sidebar to compare semantic
                            content between commits.
                          </p>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-100 text-blue-700">SOURCE</Badge>
                              <span className="text-gray-600">
                                {data?.mergeConfig?.sourceCommitTitle}
                              </span>
                            </div>
                            <span className="text-gray-400">→</span>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-orange-100 text-orange-700">TARGET</Badge>
                              <span className="text-gray-600">
                                {data?.mergeConfig?.targetCommitTitle}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* After analysis - show merge results */
                        <div className="flex flex-col gap-4">
                          {/* Auto-merged facets */}
                          {mergeResult.auto_merged_facets.length > 0 && (
                            <div className="border border-green-200 rounded-lg overflow-hidden">
                              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border-b border-green-200 text-green-700 font-medium text-sm">
                                <Check size={16} />
                                <span>Auto-merged ({mergeResult.auto_merged_facets.length})</span>
                              </div>
                              <div className="flex flex-col divide-y divide-gray-100">
                                {mergeResult.auto_merged_facets.map((facet, idx) => (
                                  <div key={idx} className="p-3 bg-white">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium text-sm text-gray-800">
                                        {facet.facet}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'text-[0.65rem]',
                                          facet.source === 'source'
                                            ? 'text-blue-600 border-blue-300'
                                            : 'text-orange-600 border-orange-300'
                                        )}
                                      >
                                        from {facet.source}
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      {facet.merged_text || '(deleted)'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Conflicts */}
                          {mergeResult.conflicts.length > 0 && (
                            <div className="border border-amber-300 rounded-lg overflow-hidden">
                              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-700 font-medium text-sm">
                                <AlertCircle size={16} />
                                <span>Conflicts ({mergeResult.conflicts.length})</span>
                              </div>
                              <div className="flex flex-col divide-y divide-gray-100">
                                {mergeResult.conflicts.map((conflict, idx) => (
                                  <div key={idx} className="p-3 bg-white">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-medium text-sm text-gray-800">
                                        {conflict.facet}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[0.65rem] text-amber-600 border-amber-300"
                                      >
                                        {conflict.conflict_type}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="p-2 bg-blue-50/50 rounded border border-blue-100">
                                        <Badge className="bg-blue-100 text-blue-700 text-[0.6rem] mb-1.5">
                                          SOURCE
                                        </Badge>
                                        <div className="text-sm text-gray-600">
                                          {conflict.source_text || '(deleted)'}
                                        </div>
                                      </div>
                                      <div className="p-2 bg-orange-50/50 rounded border border-orange-100">
                                        <Badge className="bg-orange-100 text-orange-700 text-[0.6rem] mb-1.5">
                                          TARGET
                                        </Badge>
                                        <div className="text-sm text-gray-600">
                                          {conflict.target_text || '(deleted)'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Clean merge message */}
                          {mergeResult.status === 'clean' &&
                            mergeResult.auto_merged_facets.length === 0 && (
                              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                                <Check size={48} strokeWidth={1} className="text-green-300 mb-4" />
                                <h4 className="font-semibold text-gray-700 mb-2">
                                  No Changes Detected
                                </h4>
                                <p className="text-sm text-gray-500">
                                  The source and target commits have identical semantic content.
                                </p>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  ) : hasNewSourceData ? (
                    /* New free-form text selection UI */
                    <PendingSourceEditor
                      blocks={textBlocks}
                      onChange={handleTextBlocksChange}
                      readOnly={!configLocked}
                    />
                  ) : sourceBoxes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <MessageSquarePlus size={32} strokeWidth={1} className="mb-2" />
                      <p className="font-medium text-gray-500">No source content</p>
                      <span className="text-sm">Connect upstream conversation or commit</span>
                    </div>
                  ) : (
                    /* Legacy phrase-based UI */
                    sourceBoxes.map((box) => (
                      <div
                        key={box.id}
                        className="bg-white border border-gray-200 rounded-lg mb-3 overflow-hidden"
                      >
                        {/* Source Box Header */}
                        <div
                          className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleSourceBoxExpand(box.id)}
                        >
                          <span className="text-gray-500">
                            {box.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className="flex-1 text-[0.85rem] font-medium text-gray-700">
                            {box.title}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[0.65rem] text-blue-600 border-blue-300 bg-blue-50"
                          >
                            {box.type}
                          </Badge>
                        </div>
                        {/* Source Box Body with Phrases and Keyword Highlighting */}
                        {box.expanded && (
                          <div className="p-3 text-[0.9rem] leading-[1.8] text-gray-700">
                            {box.phrases.map((phrase) => {
                              const canToggle = configLocked; // Only allow toggling when Step 1 is locked
                              return (
                                <div
                                  key={phrase.id}
                                  className={cn(
                                    'inline-block py-1.5 px-2.5 m-1 rounded-md transition-colors cursor-pointer leading-[1.6] max-w-full',
                                    phrase.included
                                      ? 'bg-green-100 border border-green-300 hover:bg-green-200'
                                      : 'bg-red-100 border border-red-300 hover:bg-red-200',
                                    !canToggle && 'opacity-70 cursor-default'
                                  )}
                                  onClick={(e) => {
                                    // Only toggle if clicking the phrase background (not a keyword)
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
          <footer className="flex items-center justify-center gap-6 px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 shrink-0">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              green bg = included phrase
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-red-100 border border-red-300" />
              red bg = excluded phrase
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-green-600" />
              green text = must-have keyword
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-red-600" />
              red text = mustnt-have keyword
            </span>
          </footer>
        </div>
      </div>
    );
  }

  // ============================================
  // COMMITTED COMMIT - Read-only frozen version
  // ============================================
  if (isCommittedCommit) {
    const branchLabel = data.branchType === 'branch' ? data.branchName?.trim() || 'branch' : 'main';

    // Get keywords and source excerpt from committed data (stored in database)
    // These come from data.mustHave, data.mustntHave, data.sourceExcerpt fields
    const commitMustHave = data.mustHave || [];
    const commitMustntHave = data.mustntHave || [];
    const commitSourceExcerpt = data.sourceExcerpt || [];
    const commitFacets = data.facetSnapshot || [];

    // Group facets by type for display
    const facetsByType = commitFacets.reduce(
      (acc, facet) => {
        const type = facet.facet || 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(facet);
        return acc;
      },
      {} as Record<string, typeof commitFacets>
    );

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col w-[95vw] max-w-[1400px] h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Top Bar */}
          <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[0.95rem] font-semibold text-gray-800">
                Commit: {data.title || 'Untitled'}
              </h2>
              <span className="text-xs text-gray-400 font-mono">{data.entryId}</span>
              <Badge
                className={cn(
                  'text-[0.65rem] gap-1',
                  branchLabel === 'main'
                    ? 'bg-green-100 text-green-700 border-green-300'
                    : 'bg-purple-100 text-purple-700 border-purple-300'
                )}
              >
                <GitBranch size={12} />
                {branchLabel}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {quickActions?.map((action) => (
                <Button
                  key={action.key}
                  variant="outline"
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  disabled={action.disabled}
                  className="gap-1.5 h-9"
                >
                  {action.icon}
                  <span>{action.label}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="h-9 w-9 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </Button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden min-h-0" ref={commitContainerRef}>
            {/* Left Sidebar - Meta & Lineage */}
            <aside
              className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-gray-50"
              style={{ width: commitLeftWidth }}
            >
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Version Info
                </h4>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <GitBranch size={14} className="text-gray-400 shrink-0" />
                  <span>
                    Branch: <strong>{branchLabel}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  <span>{data.timestamp}</span>
                </div>
                <div className="flex items-center gap-2 text-[0.85rem] text-gray-600 mb-2">
                  <Tag size={14} className="text-gray-400 shrink-0" />
                  <span>{data.tags.length > 0 ? data.tags.join(', ') : 'No tags'}</span>
                </div>
              </div>

              <div className="h-px bg-gray-200 my-4" />

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Lineage
                </h4>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[0.85rem]">
                    <span className="text-gray-500">From Draft:</span>
                    <span className="text-gray-700 font-mono text-xs">{data.entryId}</span>
                  </div>
                  {data.baselineSummary && (
                    <div className="flex items-center gap-2 text-[0.85rem]">
                      <span className="text-gray-500">Upstream:</span>
                      <span className="text-gray-700">Connected</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Left Divider */}
            <div
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors"
              onMouseDown={handleCommitLeftDivider}
            />

            {/* Main Content - Source Excerpt & Generated Output */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Source Excerpt - User's semantic selections */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-700">Source Excerpt</h3>
                  <Badge variant="outline" className="text-[0.65rem] text-gray-400">
                    Read-only
                  </Badge>
                </div>
                <div className="p-3 bg-white border border-gray-200 rounded-md min-h-[80px]">
                  {commitSourceExcerpt.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {commitSourceExcerpt.map((excerpt, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-100"
                        >
                          <span className="text-gray-400 font-bold shrink-0">•</span>
                          <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                            {excerpt}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                      <span>No source excerpt recorded</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Generated Output - LLM generated content */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-700">Generated Output</h3>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-[0.9rem] leading-relaxed text-gray-700">
                  {data.summary || 'No generated content.'}
                </div>
              </div>

              {data.status && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-gray-700">Intent</h3>
                  </div>
                  <div className="p-3 bg-white border border-gray-200 rounded-md text-[0.9rem] text-gray-700">
                    {data.status}
                  </div>
                </div>
              )}

              {/* Facets - Extracted semantic data */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm text-gray-700">Facets</h3>
                  <span className="text-xs text-gray-400">{commitFacets.length} extracted</span>
                </div>
                <div>
                  {commitFacets.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {Object.entries(facetsByType).map(([type, facets]) => (
                        <div
                          key={type}
                          className="bg-white border border-gray-200 rounded-md overflow-hidden"
                        >
                          <h5 className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-700">
                            <span>
                              {type === 'keyword' && '\u{1F3F7}\u{FE0F}'}
                              {type === 'preference' && '\u{1F496}'}
                              {type === 'intent_seed' && '\u{1F3AF}'}
                              {type === 'time_window' && '\u{23F0}'}
                              {type === 'preference_soft' && '\u{1F4A1}'}
                              {type === 'unknown_slot' && '\u{2753}'}
                              {type === 'segment' && '\u{1F4DD}'}
                              {type === 'topic' && '\u{1F4CC}'}
                              {type === 'time_anchor' && '\u{1F4C6}'}
                              {type === 'facet' && '\u{2728}'}
                            </span>
                            {type}
                            <span className="text-xs text-gray-400">({facets.length})</span>
                          </h5>
                          <div className="p-2 flex flex-wrap gap-2">
                            {facets.map((facet, idx) => {
                              // Determine background color based on polarity
                              const polarityClass =
                                facet.polarity === 1
                                  ? 'bg-green-100 text-green-700'
                                  : facet.polarity === -1
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-50 text-gray-700';

                              // Entity type icon mapping
                              const entityIcon =
                                facet.entity_type === 'LOCATION'
                                  ? '\u{1F4CD}'
                                  : facet.entity_type === 'PERSON'
                                    ? '\u{1F464}'
                                    : facet.entity_type === 'DATE'
                                      ? '\u{1F4C5}'
                                      : facet.entity_type === 'ORGANIZATION'
                                        ? '\u{1F3E2}'
                                        : facet.entity_type === 'EVENT'
                                          ? '\u{1F389}'
                                          : facet.entity_type === 'NUMBER'
                                            ? '#'
                                            : null;

                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm',
                                    polarityClass
                                  )}
                                  title={
                                    facet.turn_hash
                                      ? `From turn: ${facet.turn_hash.slice(0, 12)}...`
                                      : undefined
                                  }
                                >
                                  {entityIcon && <span>{entityIcon}</span>}
                                  {facet.text && <span>{facet.text}</span>}
                                  {facet.key && facet.value !== undefined && !facet.text && (
                                    <span>
                                      <span className="opacity-70">{facet.key}:</span>
                                      <span className="ml-0.5">{String(facet.value)}</span>
                                    </span>
                                  )}
                                  {facet.confidence !== undefined && facet.confidence < 1 && (
                                    <span className="text-xs opacity-60 font-medium">
                                      {Math.round(facet.confidence * 100)}%
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                      <span>No facets extracted</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Divider */}
            <div
              className="w-1.5 bg-gray-200 cursor-col-resize shrink-0 hover:bg-gray-300 active:bg-blue-500 transition-colors"
              onMouseDown={handleCommitRightDivider}
            />

            {/* Right Sidebar - Constraints Summary */}
            <aside
              className="min-w-[200px] p-5 overflow-y-auto shrink-0 bg-gray-50"
              style={{ width: commitRightWidth }}
            >
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Constraints
                </h4>

                <div className="mb-4">
                  <h5 className="text-xs font-medium text-green-600 mb-2">Must-have</h5>
                  {commitMustHave.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {commitMustHave.map((w, i) => (
                        <Badge
                          key={i}
                          className="text-[0.7rem] bg-green-100 text-green-700 border-green-300"
                        >
                          {w}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                </div>

                <div className="mb-4">
                  <h5 className="text-xs font-medium text-red-600 mb-2">Mustn&apos;t-have</h5>
                  {commitMustntHave.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {commitMustntHave.map((w, i) => (
                        <Badge
                          key={i}
                          className="text-[0.7rem] bg-red-100 text-red-700 border-red-300"
                        >
                          {w}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-200 my-4" />

              {/* Diff Section */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <GitCompare size={14} />
                  Compare
                </h4>

                {!showDiffPanel ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowDiffPanel(true)}
                    disabled={allCommittedCommits.length <= 1}
                    title={
                      allCommittedCommits.length <= 1
                        ? 'Need at least 2 commits to compare'
                        : 'Compare with another commit'
                    }
                    className="w-full gap-2"
                  >
                    <GitCompare size={14} />
                    <span>Compare with...</span>
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-500">Compare with:</label>
                      <select
                        className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm bg-white text-gray-800 cursor-pointer focus:outline-none focus:border-blue-500"
                        value={diffTargetCommit}
                        onChange={(e) => {
                          setDiffTargetCommit(e.target.value);
                          setDiffResult(null);
                          setDiffError(null);
                        }}
                      >
                        <option value="">Select a commit...</option>
                        {allCommittedCommits
                          .filter((c) => c.data.commitHash !== data.commitHash)
                          .map((c) => (
                            <option key={c.id} value={c.data.commitHash}>
                              {c.data.title || c.data.entryId} ({c.data.commitHash?.slice(0, 8)})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleDiff}
                        disabled={!diffTargetCommit || isDiffLoading}
                        className="flex-1 gap-1.5"
                      >
                        {isDiffLoading ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Comparing...</span>
                          </>
                        ) : (
                          <>
                            <GitCompare size={14} />
                            <span>Run Diff</span>
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDiffPanel(false);
                          setDiffTargetCommit('');
                          setDiffResult(null);
                          setDiffError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>

                    {diffError && (
                      <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm mt-2">
                        <AlertCircle size={14} />
                        <span>{diffError}</span>
                      </div>
                    )}

                    {diffResult && (
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded-md">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-600">Facet Changes:</span>
                          <Badge variant="outline" className="text-xs">
                            {diffResult.diff.facet_changes.length}
                          </Badge>
                        </div>

                        {diffResult.diff.facet_changes.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {diffResult.diff.facet_changes.map((change, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  'p-2 rounded border text-sm',
                                  change.change_type === 'added' && 'bg-green-50 border-green-200',
                                  change.change_type === 'removed' && 'bg-red-50 border-red-200',
                                  change.change_type === 'modified' &&
                                    'bg-amber-50 border-amber-200'
                                )}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[0.6rem]',
                                      change.change_type === 'added' &&
                                        'text-green-600 border-green-300',
                                      change.change_type === 'removed' &&
                                        'text-red-600 border-red-300',
                                      change.change_type === 'modified' &&
                                        'text-amber-600 border-amber-300'
                                    )}
                                  >
                                    {change.change_type}
                                  </Badge>
                                  <span className="font-medium text-gray-700">{change.facet}</span>
                                </div>
                                {change.base_text && (
                                  <div className="text-red-600 text-xs font-mono bg-red-100/50 px-2 py-1 rounded">
                                    - {change.base_text}
                                  </div>
                                )}
                                {change.target_text && (
                                  <div className="text-green-600 text-xs font-mono bg-green-100/50 px-2 py-1 rounded mt-1">
                                    + {change.target_text}
                                  </div>
                                )}
                                {change.added_keywords.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 mt-2">
                                    <span className="text-xs text-gray-500">Added:</span>
                                    {change.added_keywords.map((kw, i) => (
                                      <Badge
                                        key={i}
                                        className="text-[0.6rem] bg-green-100 text-green-700"
                                      >
                                        {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {change.removed_keywords.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 mt-2">
                                    <span className="text-xs text-gray-500">Removed:</span>
                                    {change.removed_keywords.map((kw, i) => (
                                      <Badge
                                        key={i}
                                        className="text-[0.6rem] bg-red-100 text-red-700"
                                      >
                                        {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {diffResult.diff.facet_changes.length === 0 && (
                          <div className="text-center py-4 text-sm text-gray-400">
                            No facet changes detected
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unknown node types
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col w-[80vw] max-w-[800px] max-h-[60vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[0.95rem] font-semibold text-gray-800">{data?.title || 'Node'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </Button>
          </div>
        </header>
        <div className="flex-1 p-6 flex items-center justify-center text-gray-500">
          <p>Unknown node type</p>
        </div>
      </div>
    </div>
  );
}
