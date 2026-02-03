import { Bookmark, Check, Save, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  Clause,
  ClauseStatus,
  ConversationConstraints,
  Keyword,
  KeywordConstraintType,
} from '@/types/nodes';

interface ManageModeProps {
  text: string;
  initialConstraints?: ConversationConstraints;
  onSave: (constraints: ConversationConstraints) => void;
  onExit: () => void;
  isLocked?: boolean; // When conversation has drafts, editing is locked
}

// Simple sentence splitter (can be enhanced with NLP later)
const splitIntoSentences = (text: string): string[] => {
  if (!text.trim()) return [];
  // Split by common sentence terminators, keeping the terminator
  const sentences = text
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [text];
};

// Stop words set
const stopWords = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'about',
  'into',
  'over',
  'after',
  'before',
  'between',
  'under',
  '的',
  '是',
  '在',
  '了',
  '和',
  '与',
  '或',
  '但',
  '也',
  '都',
  '就',
  '而',
  '及',
  '等',
  '着',
  '过',
  '要',
  '会',
  '能',
  '可',
  '有',
  '没',
  '不',
  '这',
  '那',
  '他',
  '她',
  '它',
  '我',
  '你',
  '们',
  '很',
  '最',
  '已',
  '还',
  '把',
]);

// Check if a word is a keyword (not a stop word and long enough)
const isKeyword = (word: string): boolean => {
  const cleanWord = word.toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, '');
  return cleanWord.length >= 2 && !stopWords.has(cleanWord);
};

// Tokenize sentence into words while preserving structure
interface Token {
  text: string;
  isKeyword: boolean;
  keywordId?: string;
}

const tokenizeSentence = (
  sentence: string,
  existingKeywords?: Keyword[]
): { tokens: Token[]; keywords: Keyword[] } => {
  // Split by word boundaries while keeping punctuation and spaces
  const parts = sentence.split(/(\s+|[^\w\u4e00-\u9fa5]+)/g).filter((p) => p.length > 0);

  const keywordMap = new Map<string, Keyword>();
  existingKeywords?.forEach((kw) => {
    keywordMap.set(kw.text.toLowerCase(), kw);
  });

  const keywords: Keyword[] = [];
  const tokens: Token[] = parts.map((part) => {
    const isKw = isKeyword(part);
    if (isKw) {
      const lowerPart = part.toLowerCase();
      let keyword = keywordMap.get(lowerPart);
      if (!keyword) {
        keyword = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          text: lowerPart,
          constraint: 'neutral' as KeywordConstraintType,
        };
        keywordMap.set(lowerPart, keyword);
      }
      if (!keywords.find((k) => k.id === keyword!.id)) {
        keywords.push(keyword);
      }
      return { text: part, isKeyword: true, keywordId: keyword.id };
    }
    return { text: part, isKeyword: false };
  });

  return { tokens, keywords };
};

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function ManageMode({
  text,
  initialConstraints,
  onSave,
  onExit,
  isLocked = false,
}: ManageModeProps) {
  // Initialize clauses from text or existing constraints
  const initClauses = useMemo((): Clause[] => {
    if (initialConstraints?.clauses?.length) {
      return initialConstraints.clauses;
    }
    const sentences = splitIntoSentences(text);
    return sentences.map((sentence) => {
      const { keywords } = tokenizeSentence(sentence);
      return {
        id: generateId(),
        text: sentence,
        status: 'neutral' as ClauseStatus,
        keywords,
      };
    });
  }, [text, initialConstraints]);

  const [clauses, setClauses] = useState<Clause[]>(initClauses);
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Toggle clause selection
  const toggleClauseSelection = useCallback(
    (clauseId: string) => {
      if (isLocked) return;
      setSelectedClauseIds((prev) => {
        const next = new Set(prev);
        if (next.has(clauseId)) {
          next.delete(clauseId);
        } else {
          next.add(clauseId);
        }
        return next;
      });
    },
    [isLocked]
  );

  // Select/deselect all clauses
  const toggleSelectAll = useCallback(() => {
    if (isLocked) return;
    if (selectedClauseIds.size === clauses.length) {
      setSelectedClauseIds(new Set());
    } else {
      setSelectedClauseIds(new Set(clauses.map((c) => c.id)));
    }
  }, [clauses, selectedClauseIds, isLocked]);

  // Mark selected clauses as keep
  const markSelectedAsKeep = useCallback(() => {
    if (selectedClauseIds.size === 0 || isLocked) return;
    setClauses((prev) =>
      prev.map((clause) =>
        selectedClauseIds.has(clause.id)
          ? { ...clause, status: clause.status === 'keep' ? 'neutral' : 'keep' }
          : clause
      )
    );
    setHasUnsavedChanges(true);
    setSelectedClauseIds(new Set());
  }, [selectedClauseIds, isLocked]);

  // Mark selected clauses as discard
  const markSelectedAsDiscard = useCallback(() => {
    if (selectedClauseIds.size === 0 || isLocked) return;
    setClauses((prev) =>
      prev.map((clause) =>
        selectedClauseIds.has(clause.id)
          ? { ...clause, status: clause.status === 'discard' ? 'neutral' : 'discard' }
          : clause
      )
    );
    setHasUnsavedChanges(true);
    setSelectedClauseIds(new Set());
  }, [selectedClauseIds, isLocked]);

  // Toggle keyword constraint
  const toggleKeywordConstraint = useCallback(
    (clauseId: string, keywordId: string, targetConstraint: 'must_have' | 'mustnt_have') => {
      if (isLocked) return;
      setClauses((prev) =>
        prev.map((clause) => {
          if (clause.id !== clauseId) return clause;
          return {
            ...clause,
            keywords: clause.keywords.map((kw) => {
              if (kw.id !== keywordId) return kw;
              const newConstraint: KeywordConstraintType =
                kw.constraint === targetConstraint ? 'neutral' : targetConstraint;
              return { ...kw, constraint: newConstraint };
            }),
          };
        })
      );
      setHasUnsavedChanges(true);
    },
    [isLocked]
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (isLocked) return;
    const must_have = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'must_have')
      .map((kw) => kw.text);
    const mustnt_have = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'mustnt_have')
      .map((kw) => kw.text);

    const constraints: ConversationConstraints = {
      clauses,
      must_have: [...new Set(must_have)],
      mustnt_have: [...new Set(mustnt_have)],
    };
    onSave(constraints);
    setHasUnsavedChanges(false);
  }, [clauses, onSave, isLocked]);

  // Handle exit with unsaved changes warning
  const handleExit = useCallback(() => {
    if (hasUnsavedChanges && !isLocked) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to exit?');
      if (!confirmed) return;
    }
    onExit();
  }, [hasUnsavedChanges, onExit, isLocked]);

  // Count stats
  const stats = useMemo(() => {
    const keepCount = clauses.filter((c) => c.status === 'keep').length;
    const discardCount = clauses.filter((c) => c.status === 'discard').length;
    const mustHaveCount = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'must_have').length;
    const mustntHaveCount = clauses
      .flatMap((c) => c.keywords)
      .filter((kw) => kw.constraint === 'mustnt_have').length;
    return { keepCount, discardCount, mustHaveCount, mustntHaveCount };
  }, [clauses]);

  // Get keyword by ID from a clause
  const getKeywordById = (clause: Clause, keywordId: string): Keyword | undefined => {
    return clause.keywords.find((kw) => kw.id === keywordId);
  };

  // Render sentence with inline keywords
  const renderSentenceWithKeywords = (clause: Clause) => {
    const { tokens } = tokenizeSentence(clause.text, clause.keywords);

    return (
      <span className="text-sm leading-relaxed">
        {tokens.map((token, idx) => {
          if (!token.isKeyword || !token.keywordId) {
            return <span key={idx}>{token.text}</span>;
          }

          const keyword = getKeywordById(clause, token.keywordId);
          if (!keyword) {
            return <span key={idx}>{token.text}</span>;
          }

          return (
            <span
              key={idx}
              className={cn(
                'relative inline-flex items-center px-1 py-0.5 rounded cursor-pointer transition-colors group',
                keyword.constraint === 'must_have' && 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50',
                keyword.constraint === 'mustnt_have' && 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50',
                keyword.constraint === 'neutral' && 'bg-muted hover:bg-muted/80',
                isLocked && 'cursor-default'
              )}
            >
              <span className="font-medium">{token.text}</span>
              {!isLocked && (
                <span className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 bg-background rounded shadow-sm border p-0.5">
                  <button
                    className={cn(
                      'w-4 h-4 rounded flex items-center justify-center transition-colors',
                      keyword.constraint === 'must_have'
                        ? 'bg-green-500 text-white'
                        : 'hover:bg-green-100 text-slate-500 hover:text-green-600'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleKeywordConstraint(clause.id, keyword.id, 'must_have');
                    }}
                    title="Must-have"
                  >
                    <Check size={10} />
                  </button>
                  <button
                    className={cn(
                      'w-4 h-4 rounded flex items-center justify-center transition-colors',
                      keyword.constraint === 'mustnt_have'
                        ? 'bg-red-500 text-white'
                        : 'hover:bg-red-100 text-slate-500 hover:text-red-600'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleKeywordConstraint(clause.id, keyword.id, 'mustnt_have');
                    }}
                    title="Mustn't-have"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Locked banner */}
      {isLocked && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          <span>
            This conversation has been used in drafts. Editing is locked. You can only adjust in the
            Draft view.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
        <div className="flex items-center gap-3">
          <label
            className={cn(
              'flex items-center gap-2 text-sm cursor-pointer',
              isLocked && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input
              type="checkbox"
              checked={selectedClauseIds.size === clauses.length && clauses.length > 0}
              onChange={toggleSelectAll}
              disabled={isLocked}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span>Select All</span>
          </label>
          <span className="text-sm text-muted-foreground">
            {selectedClauseIds.size > 0 && `${selectedClauseIds.size} selected`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={markSelectedAsKeep}
            disabled={selectedClauseIds.size === 0 || isLocked}
            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
          >
            <Bookmark size={14} />
            <span>Keep</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={markSelectedAsDiscard}
            disabled={selectedClauseIds.size === 0 || isLocked}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 size={14} />
            <span>Discard</span>
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="default" size="sm" onClick={handleSave} disabled={isLocked}>
            <Save size={14} />
            <span>Save</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExit}>
            <X size={14} />
            <span>Exit</span>
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-background border-b text-xs">
        <span className="inline-flex items-center gap-1 text-green-600">
          <Bookmark size={12} /> {stats.keepCount} kept
        </span>
        <span className="inline-flex items-center gap-1 text-red-600">
          <Trash2 size={12} /> {stats.discardCount} discarded
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <Check size={12} /> {stats.mustHaveCount} must-have
        </span>
        <span className="inline-flex items-center gap-1 text-rose-600">
          <X size={12} /> {stats.mustntHaveCount} mustn't-have
        </span>
      </div>

      {/* Clause list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {clauses.map((clause) => (
          <div
            key={clause.id}
            className={cn(
              'rounded-lg border p-3 transition-colors',
              clause.status === 'keep' && 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
              clause.status === 'discard' && 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
              clause.status === 'neutral' && 'bg-background border-border',
              selectedClauseIds.has(clause.id) && 'ring-2 ring-blue-500',
              isLocked && 'opacity-70'
            )}
          >
            <div className="flex items-start gap-3">
              <label className="pt-0.5">
                <input
                  type="checkbox"
                  checked={selectedClauseIds.has(clause.id)}
                  onChange={() => toggleClauseSelection(clause.id)}
                  disabled={isLocked}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </label>
              <div className="flex-1 min-w-0">{renderSentenceWithKeywords(clause)}</div>
              {clause.status !== 'neutral' && (
                <span
                  className={cn(
                    'shrink-0 px-2 py-0.5 rounded text-xs font-medium uppercase',
                    clause.status === 'keep' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                    clause.status === 'discard' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  )}
                >
                  {clause.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {clauses.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-500 p-10 text-center">
          No sentences found. Add some content to the conversation first.
        </div>
      )}
    </div>
  );
}
