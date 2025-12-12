/**
 * Mock NLP Provider for Testing
 *
 * Returns predefined analysis results for testing purposes.
 * Does not require any external API.
 */

import {
  NLPProvider,
  NLPAnalysis,
  NLPToken,
  NLPEntity,
  NLPSentence,
} from "@t3x/core";

/**
 * Mock NLP analysis result
 */
export interface MockNLPResult {
  text: string;
  analysis: NLPAnalysis;
}

/**
 * Mock NLP Provider for unit testing
 */
export class MockNLPProvider implements NLPProvider {
  readonly id = "mock-nlp";

  private readonly mockResults: Map<string, NLPAnalysis>;
  private readonly defaultLanguage: string;

  constructor(mockResults?: MockNLPResult[], defaultLanguage = "en") {
    this.mockResults = new Map();
    this.defaultLanguage = defaultLanguage;

    if (mockResults) {
      for (const result of mockResults) {
        this.mockResults.set(result.text, result.analysis);
      }
    }
  }

  /**
   * Add a mock result
   */
  addMockResult(text: string, analysis: NLPAnalysis): void {
    this.mockResults.set(text, analysis);
  }

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    // Return predefined result if available
    const predefined = this.mockResults.get(text);
    if (predefined) {
      return predefined;
    }

    // Generate basic mock analysis
    return this.generateBasicAnalysis(text, language ?? this.defaultLanguage);
  }

  /**
   * Generate basic mock analysis (simple rule-based)
   */
  private generateBasicAnalysis(text: string, language: string): NLPAnalysis {
    const sentences = this.splitSentences(text);
    const tokens = this.tokenize(text);
    const entities = this.extractEntities(text);

    return {
      language,
      sentiment: { score: 0, magnitude: 0 },
      tokens,
      entities,
      sentences: sentences.map((sent, i) => ({
        text: sent.text,
        sentiment: 0,
        beginOffset: sent.start,
        endOffset: sent.end,
      })),
    };
  }

  /**
   * Simple sentence splitting
   */
  private splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
    const sentences: Array<{ text: string; start: number; end: number }> = [];
    const regex = /[^.!?。！？]+[.!?。！？]*/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const sentText = match[0].trim();
      if (sentText) {
        sentences.push({
          text: sentText,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    // If no sentences found, return the whole text as one sentence
    if (sentences.length === 0 && text.trim()) {
      sentences.push({
        text: text.trim(),
        start: 0,
        end: text.length,
      });
    }

    return sentences;
  }

  /**
   * Simple tokenization with basic POS tagging
   */
  private tokenize(text: string): NLPToken[] {
    const tokens: NLPToken[] = [];
    const words = text.match(/\b\w+\b/g) ?? [];
    let offset = 0;

    // Simple verb lemmas
    const verbLemmas: Record<string, string> = {
      want: "want", wants: "want", wanted: "want", wanting: "want",
      like: "like", likes: "like", liked: "like", liking: "like",
      love: "love", loves: "love", loved: "love", loving: "love",
      hate: "hate", hates: "hate", hated: "hate", hating: "hate",
      avoid: "avoid", avoids: "avoid", avoided: "avoid", avoiding: "avoid",
      prefer: "prefer", prefers: "prefer", preferred: "prefer", preferring: "prefer",
      need: "need", needs: "need", needed: "need", needing: "need",
      plan: "plan", plans: "plan", planned: "plan", planning: "plan",
      travel: "travel", travels: "travel", traveled: "travel", travelling: "travel", traveling: "travel",
      visit: "visit", visits: "visit", visited: "visit", visiting: "visit",
      book: "book", books: "book", booked: "book", booking: "book",
      find: "find", finds: "find", found: "find", finding: "find",
      implement: "implement", implements: "implement", implemented: "implement", implementing: "implement",
      deploy: "deploy", deploys: "deploy", deployed: "deploy", deploying: "deploy",
      use: "use", uses: "use", used: "use", using: "use",
      is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
      do: "do", does: "do", did: "do", done: "do", doing: "do",
      don: "do", // for "don't"
    };

    // Simple POS detection
    const verbs = new Set(Object.keys(verbLemmas));
    const pronouns = new Set(["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them"]);
    const determiners = new Set(["a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their"]);
    const prepositions = new Set(["to", "in", "on", "at", "by", "for", "with", "from", "of", "about", "into", "over", "after", "before"]);
    const conjunctions = new Set(["and", "or", "but", "so", "yet", "for", "nor"]);
    const adverbs = new Set(["not", "never", "n't", "very", "really", "just", "only", "also", "always", "often", "sometimes"]);
    const adjectives = new Set(["good", "bad", "great", "small", "big", "new", "old", "first", "last", "long", "short", "high", "low", "best", "worst", "quiet", "crowded", "spicy", "traditional", "dark"]);
    const questionWords = new Set(["what", "who", "whom", "whose", "which", "where", "when", "why", "how"]);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const lower = word.toLowerCase();
      const wordStart = text.indexOf(word, offset);
      offset = wordStart + word.length;

      // Determine POS
      let pos = "NOUN";
      let lemma = lower;
      let depLabel = "NN";
      let headIdx = i > 0 ? 0 : -1; // Simple: point to first token or root

      if (verbs.has(lower)) {
        pos = "VERB";
        lemma = verbLemmas[lower] ?? lower;
        depLabel = i === 0 || (i === 1 && words[0] && pronouns.has(words[0].toLowerCase())) ? "ROOT" : "XCOMP";
        headIdx = depLabel === "ROOT" ? -1 : 0;
      } else if (pronouns.has(lower)) {
        pos = "PRON";
        depLabel = "NSUBJ";
        headIdx = this.findVerbIndex(words, i);
      } else if (determiners.has(lower)) {
        pos = "DET";
        depLabel = "DET";
        headIdx = i + 1 < words.length ? i + 1 : i;
      } else if (prepositions.has(lower)) {
        pos = "ADP";
        depLabel = "PREP";
        headIdx = this.findVerbIndex(words, i);
      } else if (conjunctions.has(lower)) {
        pos = "CCONJ";
        depLabel = "CC";
      } else if (adverbs.has(lower)) {
        pos = "ADV";
        depLabel = lower === "not" || lower === "n't" || lower === "never" ? "NEG" : "ADVMOD";
        headIdx = this.findVerbIndex(words, i);
      } else if (adjectives.has(lower)) {
        pos = "ADJ";
        depLabel = "AMOD";
      } else if (questionWords.has(lower)) {
        pos = "PRON"; // WH-pronouns
        depLabel = "NSUBJ";
      } else if (/^\d+$/.test(word)) {
        pos = "NUM";
        depLabel = "NUM";
      } else {
        // Assume noun, check if it follows a verb (then it's likely DOBJ)
        const prevVerbIdx = this.findPrevVerbIndex(words, i);
        if (prevVerbIdx >= 0) {
          depLabel = "DOBJ";
          headIdx = prevVerbIdx;
        }
      }

      tokens.push({
        index: i,
        text: word,
        lemma,
        pos,
        beginOffset: wordStart,
        endOffset: wordStart + word.length,
        headIndex: headIdx,
        dependencyLabel: depLabel,
      });
    }

    return tokens;
  }

  /**
   * Find verb index for dependency
   */
  private findVerbIndex(words: string[], currentIdx: number): number {
    const verbLemmas = new Set([
      "want", "wants", "wanted", "wanting",
      "like", "likes", "liked", "liking",
      "love", "loves", "loved", "loving",
      "hate", "hates", "hated", "hating",
      "avoid", "avoids", "avoided", "avoiding",
      "prefer", "prefers", "preferred", "preferring",
      "need", "needs", "needed", "needing",
      "plan", "plans", "planned", "planning",
      "travel", "travels", "traveled", "travelling", "traveling",
      "visit", "visits", "visited", "visiting",
      "book", "books", "booked", "booking",
      "find", "finds", "found", "finding",
      "implement", "implements", "implemented", "implementing",
      "deploy", "deploys", "deployed", "deploying",
      "use", "uses", "used", "using",
      "is", "are", "was", "were", "been", "being",
      "do", "does", "did", "done", "doing", "don",
    ]);

    for (let i = 0; i < words.length; i++) {
      if (verbLemmas.has(words[i].toLowerCase())) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Find previous verb index
   */
  private findPrevVerbIndex(words: string[], currentIdx: number): number {
    const verbLemmas = new Set([
      "want", "wants", "wanted", "wanting",
      "like", "likes", "liked", "liking",
      "hate", "hates", "hated", "hating",
      "avoid", "avoids", "avoided", "avoiding",
      "prefer", "prefers", "preferred", "preferring",
      "implement", "implements", "implemented", "implementing",
      "deploy", "deploys", "deployed", "deploying",
      "use", "uses", "used", "using",
    ]);

    for (let i = currentIdx - 1; i >= 0; i--) {
      if (verbLemmas.has(words[i].toLowerCase())) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Simple entity extraction
   */
  private extractEntities(text: string): NLPEntity[] {
    const entities: NLPEntity[] = [];

    // Known entities patterns
    const knownEntities: Array<{ pattern: RegExp; type: string }> = [
      { pattern: /\b(Japan|Tokyo|Kyoto|Osaka|China|USA|UK|France|Germany)\b/gi, type: "GPE" },
      { pattern: /\b(AWS|Docker|React|TypeScript|JavaScript|SQL|MongoDB|Redis)\b/gi, type: "PRODUCT" },
      { pattern: /\b(November|December|January|February|March|April|May|June|July|August|September|October)\b/gi, type: "DATE" },
      { pattern: /\b(next week|tomorrow|today|yesterday|last week|this month|next month)\b/gi, type: "DATE" },
      { pattern: /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, type: "DATE" },
      { pattern: /\b(Google|Microsoft|Amazon|Apple|Facebook|Netflix)\b/gi, type: "ORG" },
    ];

    for (const { pattern, type } of knownEntities) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          text: match[0],
          type,
          salience: 0.5,
          beginOffset: match.index,
          endOffset: match.index + match[0].length,
        });
      }
    }

    return entities;
  }
}

/**
 * Create a mock NLP provider
 */
export function createMockNLPProvider(
  mockResults?: MockNLPResult[],
  defaultLanguage = "en"
): MockNLPProvider {
  return new MockNLPProvider(mockResults, defaultLanguage);
}
