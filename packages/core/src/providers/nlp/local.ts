/**
 * Local NLP Provider (Fallback)
 *
 * Uses Intl.Segmenter for sentence splitting and simple heuristics for
 * tokens and entities. No external API dependency.
 *
 * Used as fallback when GOOGLE_CLOUD_NLP_KEY is not set.
 * Provides adequate Ring 3 (sentences) and basic Ring 1 (keywords/entities).
 * Ring 2 (intent seeds) will be minimal but functional.
 */

import type { NLPAnalysis, NLPEntity, NLPProvider, NLPSentence, NLPToken } from './base';
import { NLPProviderError } from './base';
import { splitSentences } from './sentenceSplitter';

export interface LocalNLPProviderConfig {
  /** Default language when not specified */
  defaultLanguage?: string;
}

export class LocalNLPProvider implements NLPProvider {
  readonly id = 'local-intl-segmenter';
  private readonly defaultLanguage: string;

  constructor(config: LocalNLPProviderConfig = {}) {
    this.defaultLanguage = config.defaultLanguage ?? 'en';
  }

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    const lang = language ?? this.defaultLanguage;

    if (!text.trim()) {
      return {
        language: lang,
        sentiment: { score: 0, magnitude: 0 },
        tokens: [],
        entities: [],
        sentences: [],
      };
    }

    try {
      // Sentence segmentation via Intl.Segmenter
      const sentences: NLPSentence[] = splitSentences(text);

      // Basic tokenization via simple word splitting
      const tokens = this.tokenize(text);

      // Simple entity extraction (capitalized multi-word sequences)
      const entities = this.extractEntities(text);

      return {
        language: lang,
        sentiment: { score: 0, magnitude: 0 },
        tokens,
        entities,
        sentences,
      };
    } catch (error) {
      if (error instanceof NLPProviderError) throw error;
      throw new NLPProviderError(
        this.id,
        error instanceof Error ? error : undefined,
        `Local NLP analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private tokenize(text: string): NLPToken[] {
    const words = text.match(/\S+/g) ?? [];
    const tokens: NLPToken[] = [];
    let offset = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const foundAt = text.indexOf(word, offset);
      const beginOffset = foundAt === -1 ? offset : foundAt;
      const endOffset = beginOffset + word.length;
      offset = endOffset;

      // Simple POS heuristic
      const cleaned = word.replace(/[^\w]/g, '');
      const pos = this.guessPOS(cleaned);

      tokens.push({
        index: i,
        text: word,
        lemma: cleaned.toLowerCase(),
        pos,
        beginOffset,
        endOffset,
        headIndex: -1,
        dependencyLabel: i === 0 ? 'ROOT' : 'UNKNOWN',
      });
    }

    return tokens;
  }

  private guessPOS(word: string): string {
    if (!word) return 'X';
    // Rough heuristics for basic POS tagging
    if (/^\d+$/.test(word)) return 'NUM';
    if (/^[A-Z][a-z]+$/.test(word)) return 'NOUN'; // Capitalized
    if (/ing$/.test(word)) return 'VERB';
    if (/ly$/.test(word)) return 'ADV';
    if (/tion$|ment$|ness$|ity$/.test(word)) return 'NOUN';
    if (/ive$|ous$|ful$|less$|able$|ible$/.test(word)) return 'ADJ';
    return 'X';
  }

  private extractEntities(text: string): NLPEntity[] {
    const entities: NLPEntity[] = [];
    // Match capitalized word sequences (2+ words) as potential entities
    const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        text: match[1],
        type: 'OTHER',
        salience: 0.5,
        beginOffset: match.index,
        endOffset: match.index + match[1].length,
      });
    }
    return entities;
  }
}

export function createLocalNLPProvider(config?: LocalNLPProviderConfig): NLPProvider {
  return new LocalNLPProvider(config);
}
