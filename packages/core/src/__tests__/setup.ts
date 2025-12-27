/**
 * Test Setup for t3x-core
 *
 * Provides stub providers for testing core algorithms without external dependencies.
 */

import type { LLMGenerateOptions, LLMProvider } from '../llm';
import type { EmbeddingProvider } from '../providers/embedding';
import type { NLPAnalysis, NLPEntity, NLPProvider, NLPSentence, NLPToken } from '../providers/nlp';

/**
 * Stub Embedding Provider for testing
 *
 * Uses text length for similarity approximation.
 * Simple but deterministic for testing purposes.
 */
export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'stub-embedding';
  readonly dim = 1;

  /**
   * Encode texts to simple length-based vectors
   */
  async encode(texts: string[]): Promise<number[][]> {
    return texts.map((text) => [text.length]);
  }

  /**
   * Calculate similarity based on length difference
   */
  similarity(vecA: number[], vecB: number[]): number {
    const a = vecA[0];
    const b = vecB[0];
    if (a === 0 || b === 0) return 0;
    return 1.0 - Math.abs(a - b) / Math.max(a, b);
  }
}

/**
 * Word-based Embedding Provider for testing
 *
 * Uses word overlap for similarity (Jaccard).
 * More realistic than length-based for semantic testing.
 */
export class WordOverlapEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'word-overlap';
  readonly dim = 100; // Arbitrary, not used

  private wordCache = new Map<string, Set<string>>();

  private getWords(text: string): Set<string> {
    const cached = this.wordCache.get(text);
    if (cached) return cached;

    const words = new Set(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0)
    );
    this.wordCache.set(text, words);
    return words;
  }

  async encode(texts: string[]): Promise<number[][]> {
    // Return dummy vectors - actual similarity uses text directly
    return texts.map((_, i) => [i]);
  }

  similarity(_vecA: number[], _vecB: number[]): number {
    // This is a bit of a hack - we need to store texts somewhere
    // For simplicity, use Jaccard similarity on stored words
    return 0.5; // Default fallback
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  textSimilarity(textA: string, textB: string): number {
    const wordsA = this.getWords(textA);
    const wordsB = this.getWords(textB);

    if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
    if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size;
  }
}

/**
 * Exact Match Embedding Provider for testing
 *
 * Returns 1.0 for exact matches, 0.0 otherwise.
 * Useful for testing conflict detection.
 */
export class ExactMatchEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'exact-match';
  readonly dim = 256;

  private textToVec = new Map<string, number[]>();
  private vecCounter = 0;

  async encode(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const normalized = text.toLowerCase().trim();
      let vec = this.textToVec.get(normalized);
      if (!vec) {
        // Create unique vector for each unique text
        vec = Array(this.dim).fill(0);
        vec[this.vecCounter % this.dim] = 1;
        this.vecCounter++;
        this.textToVec.set(normalized, vec);
      }
      return vec;
    });
  }

  similarity(vecA: number[], vecB: number[]): number {
    // Check if vectors are identical
    if (vecA.length !== vecB.length) return 0;
    for (let i = 0; i < vecA.length; i++) {
      if (vecA[i] !== vecB[i]) return 0;
    }
    return 1.0;
  }
}

/**
 * Stub NLP Provider for testing
 *
 * Parses text into tokens with basic dependency parsing.
 * Recognizes simple sentence patterns for testing extractors.
 */
export class StubNLPProvider implements NLPProvider {
  readonly id = 'stub-nlp';

  // Words that indicate positive preference
  private readonly positiveVerbs = new Set(['want', 'like', 'prefer', 'need', 'love', 'enjoy']);
  // Words that indicate negative preference
  private readonly negativeVerbs = new Set(['dislike', 'hate', 'avoid', 'reject']);
  // Negation words
  private readonly negations = new Set(['not', "don't", "doesn't", "didn't", 'never', 'no']);
  // Question words
  private readonly questionWords = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'which']);

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    // Build tokens with dependency information
    const tokens: NLPToken[] = [];
    let charOffset = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const cleanWord = word.replace(/[.,!?;:'"]+/g, '').toLowerCase();
      const pos = this.inferPOS(cleanWord);
      const depLabel = this.inferDependencyLabel(cleanWord, pos, i, words);
      const headIndex = this.inferHeadIndex(i, words, pos);

      const beginOffset = text.indexOf(word, charOffset);
      const endOffset = beginOffset + word.length;
      charOffset = endOffset;

      tokens.push({
        index: i,
        text: word.replace(/[.,!?;:'"]+$/g, ''),
        lemma: this.lemmatize(cleanWord),
        pos,
        tag: pos,
        beginOffset,
        endOffset,
        headIndex,
        dependencyLabel: depLabel,
      });
    }

    // Build entities from proper nouns and dates
    const entities: NLPEntity[] = this.extractEntities(tokens, text);

    // Build sentences
    const nlpSentences: NLPSentence[] = sentences.map((s, _idx) => {
      const beginOffset = text.indexOf(s);
      return {
        text: s.trim(),
        sentiment: 0,
        beginOffset,
        endOffset: beginOffset + s.length,
      };
    });

    return {
      language: language ?? 'en',
      sentiment: { score: 0, magnitude: 0 },
      tokens,
      entities,
      sentences: nlpSentences,
    };
  }

  private inferPOS(word: string): string {
    if (this.positiveVerbs.has(word) || this.negativeVerbs.has(word)) return 'VERB';
    if (this.questionWords.has(word)) return 'ADV';
    if (this.negations.has(word)) return 'PART';
    if (/^[A-Z]/.test(word)) return 'PROPN';
    if (/^\d+$/.test(word)) return 'NUM';
    if (['a', 'an', 'the'].includes(word)) return 'DET';
    if (['to', 'in', 'on', 'at', 'for', 'with', 'from'].includes(word)) return 'ADP';
    if (['and', 'or', 'but'].includes(word)) return 'CCONJ';
    if (['is', 'are', 'was', 'were', 'be', 'been'].includes(word)) return 'AUX';
    if (word.endsWith('ly')) return 'ADV';
    if (word.endsWith('ing') || word.endsWith('ed')) return 'VERB';
    if (word.endsWith('ful') || word.endsWith('ous') || word.endsWith('ive')) return 'ADJ';
    return 'NOUN';
  }

  private inferDependencyLabel(word: string, pos: string, index: number, words: string[]): string {
    if (index === 0 || (pos === 'VERB' && !this.negations.has(word))) return 'ROOT';
    if (this.negations.has(word)) return 'NEG';
    if (pos === 'DET') return 'DET';
    if (pos === 'ADP') return 'PREP';
    if (pos === 'NOUN' || pos === 'PROPN') {
      // Check if after a preposition
      if (index > 0) {
        const prevWord = words[index - 1].toLowerCase();
        if (['to', 'in', 'on', 'at', 'for', 'with', 'from'].includes(prevWord)) {
          return 'POBJ';
        }
      }
      return 'DOBJ';
    }
    if (pos === 'ADV') return 'ADVMOD';
    if (pos === 'ADJ') return 'AMOD';
    return 'UNKNOWN';
  }

  private inferHeadIndex(index: number, words: string[], pos: string): number {
    // Simple heuristic: nouns point to the main verb, modifiers point to what they modify
    if (pos === 'VERB') return -1; // Root
    // Find the main verb
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[.,!?;:'"]+/g, '').toLowerCase();
      if (
        this.positiveVerbs.has(w) ||
        this.negativeVerbs.has(w) ||
        w.endsWith('ing') ||
        w.endsWith('ed')
      ) {
        return i;
      }
    }
    return index > 0 ? index - 1 : -1;
  }

  private lemmatize(word: string): string {
    // Simple lemmatization rules
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('ed')) return word.slice(0, -2);
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
  }

  private extractEntities(tokens: NLPToken[], _text: string): NLPEntity[] {
    const entities: NLPEntity[] = [];

    for (const token of tokens) {
      // Proper nouns are potential named entities
      if (token.pos === 'PROPN') {
        // Simple entity type detection
        let type = 'PERSON';
        const lower = token.lemma.toLowerCase();
        if (['japan', 'tokyo', 'paris', 'london', 'new', 'york', 'usa', 'china'].includes(lower)) {
          type = 'GPE'; // Geopolitical entity
        }
        entities.push({
          text: token.text,
          type,
          salience: 0.8,
          beginOffset: token.beginOffset,
          endOffset: token.endOffset,
        });
      }

      // Detect date patterns
      if (
        /^\d{4}$/.test(token.text) ||
        /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(
          token.text
        )
      ) {
        entities.push({
          text: token.text,
          type: 'DATE',
          salience: 0.7,
          beginOffset: token.beginOffset,
          endOffset: token.endOffset,
        });
      }
    }

    return entities;
  }
}

/**
 * Stub LLM Provider for testing
 */
export class StubLLMProvider implements LLMProvider {
  readonly id = 'stub-llm';

  async generate(prompt: string, _options?: LLMGenerateOptions): Promise<string> {
    return `LLM response to: ${prompt.slice(0, 50)}...`;
  }

  async resolveConflict(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null
  ): Promise<string> {
    // Simple stub: prefer source, fall back to target
    return sourceText ?? targetText ?? baseText ?? '';
  }
}

/**
 * Test data factories
 */
export const testSegments = {
  login: (id: string) => ({
    segmentId: id,
    text: 'User wants to implement login feature.',
  }),

  rememberMe: (id: string) => ({
    segmentId: id,
    text: 'Add remember me option.',
  }),

  captcha: (id: string) => ({
    segmentId: id,
    text: 'Add captcha verification.',
  }),

  emailLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email and password login.',
  }),

  phoneLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email, phone, and password login.',
  }),

  wechatLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email and WeChat login.',
  }),
};

export const testFacets = {
  goal: (text: string, confidence = 0.9) => ({
    type: 'goal' as const,
    facet: 'goal',
    text,
    confidence,
    keywords: text.split(' ').slice(0, 3),
  }),

  constraint: (text: string, confidence = 0.9) => ({
    type: 'constraint' as const,
    facet: 'constraint',
    text,
    confidence,
    keywords: [],
  }),

  preference: (text: string, confidence = 0.8) => ({
    type: 'preference' as const,
    facet: 'preference',
    text,
    confidence,
    keywords: [],
  }),
};
