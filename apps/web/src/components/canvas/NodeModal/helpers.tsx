import type React from 'react';

// Default keyword threshold value (same as Leaf detail page)
export const DEFAULT_KEYWORD_THRESHOLD = 0.6;

export const bridgeTemplates = [
  { id: 'prose', name: 'prose', description: 'General prose extraction' },
  { id: 'plan', name: 'plan', description: 'Extract action items and planning structure' },
  { id: 'story', name: 'story', description: 'Narrative extraction with flow preservation' },
  { id: 'summary', name: 'summary', description: 'Concise summary of key points' },
  { id: 'refine', name: 'refine', description: 'Polish and tighten existing content' },
];

// Phrase type for extraction results
// Two states: included or excluded
export interface Phrase {
  id: string;
  text: string;
  included: boolean;
  sourceBoxId: string;
  keywords: PhraseKeyword[];
}

// Keyword within a phrase
// Two states: must or mustnt
// Only editable when parent phrase is included
export interface PhraseKeyword {
  id: string;
  text: string;
  originalWord: string;
  startIndex: number;
  isMustnt: boolean;
}

// Source box type for SOURCE column
export interface SourceBox {
  id: string;
  title: string;
  type: 'unit';
  content: string;
  expanded: boolean;
  phrases: Phrase[];
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
export function extractKeywordsFromPhrase(
  phraseText: string,
  phraseId: string,
  minWordLength: number = 4
): PhraseKeyword[] {
  const keywords: PhraseKeyword[] = [];
  const seenWords = new Set<string>();

  const wordRegex = /\b\w+\b/g;
  let match: RegExpExecArray | null;

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
        isMustnt: false,
      });
    }
  }

  return keywords;
}

// Extract phrases from text
export function extractPhrasesFromText(
  text: string,
  sourceBoxId: string,
  keywordsThreshold: number = 0.6
): Phrase[] {
  if (!text) return [];

  const minWordLength = Math.floor(3 + keywordsThreshold * 3);

  const nodes = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  return nodes.slice(0, 8).map((node, idx) => {
    const phraseId = `phrase-${sourceBoxId}-${idx}`;
    const trimmedText = node.trim();
    return {
      id: phraseId,
      text: trimmedText,
      included: true,
      sourceBoxId,
      keywords: extractKeywordsFromPhrase(trimmedText, phraseId, minWordLength),
    };
  });
}

// Generate result text from included phrases
export function generateResultText(phrases: Phrase[]): string {
  const includedPhrases = phrases.filter((p) => p.included);
  if (includedPhrases.length === 0) return '';

  return includedPhrases.map((p) => p.text).join('. ') + '.';
}

// Get all must_have keywords from included phrases (legacy phrase-based system)
export function getMustHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases.filter((p) => p.included).flatMap((p) => p.keywords.filter((kw) => !kw.isMustnt));
}

// Get all mustnt_have keywords from included phrases (legacy phrase-based system)
export function getMustntHaveKeywordsLegacy(phrases: Phrase[]): PhraseKeyword[] {
  return phrases.filter((p) => p.included).flatMap((p) => p.keywords.filter((kw) => kw.isMustnt));
}

// Helper to render phrase text with clickable keywords
export function renderPhraseWithKeywords(
  phrase: Phrase,
  canToggle: boolean,
  onPhraseClick: () => void,
  onKeywordClick: (keywordId: string) => void,
  hoveredKeywordText: string | null,
  onKeywordHover: (text: string | null) => void
): React.ReactNode[] {
  const { text, keywords, included } = phrase;

  if (keywords.length === 0) {
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

  const sortedKeywords = [...keywords].sort((a, b) => a.startIndex - b.startIndex);

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  sortedKeywords.forEach((kw, idx) => {
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
