/**
 * NLP Provider for Ring Extraction
 *
 * Provides NLP analysis for Ring 1/2/3 extraction.
 *
 * When GOOGLE_CLOUD_NLP_KEY is set:
 *   Uses Google Cloud Natural Language API for high-quality analysis
 *
 * Otherwise:
 *   Falls back to SimpleNLPProvider (rule-based, for local dev)
 */

import {
  createGoogleCloudNLPProvider,
  type NLPAnalysis,
  type NLPEntity,
  type NLPProvider,
  type NLPSentence,
  type NLPToken,
} from '@t3x/core';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Create a proxy-aware fetch function
 */
function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return (url: string, options?: RequestInit) =>
      undiciFetch(url, { ...options, dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as Promise<Response>;
  }
  return fetch;
}

/**
 * Words that indicate positive preference
 */
const POSITIVE_VERBS = new Set([
  'want',
  'like',
  'prefer',
  'need',
  'love',
  'enjoy',
  'recommend',
  'suggest',
  'choose',
  'use',
]);

/**
 * Words that indicate negative preference
 */
const NEGATIVE_VERBS = new Set([
  'dislike',
  'hate',
  'avoid',
  'reject',
  "don't",
  'not',
  'never',
  'stop',
]);

/**
 * Negation words
 */
const NEGATIONS = new Set(["not", "don't", "doesn't", "didn't", 'never', 'no', "won't", "can't"]);

/**
 * Question words
 */
const QUESTION_WORDS = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'which']);

/**
 * Common tech terms that should be recognized as entities
 */
const TECH_TERMS = new Set([
  // Languages
  'typescript',
  'javascript',
  'python',
  'java',
  'rust',
  'go',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'c++',
  'c#',
  // Frameworks
  'react',
  'vue',
  'angular',
  'svelte',
  'nextjs',
  'nuxt',
  'express',
  'fastify',
  'nestjs',
  'hono',
  'django',
  'flask',
  'rails',
  'spring',
  'laravel',
  // Databases
  'postgresql',
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'sqlite',
  'dynamodb',
  'supabase',
  'prisma',
  'drizzle',
  'typeorm',
  // Tools
  'docker',
  'kubernetes',
  'git',
  'npm',
  'pnpm',
  'yarn',
  'webpack',
  'vite',
  'esbuild',
  'turbo',
  'jest',
  'vitest',
  'eslint',
  'prettier',
  'biome',
  // APIs
  'rest',
  'graphql',
  'grpc',
  'trpc',
  'apollo',
  'openapi',
  // Cloud
  'aws',
  'gcp',
  'azure',
  'vercel',
  'netlify',
  'cloudflare',
]);

/**
 * Simple NLP Provider
 *
 * Implements basic tokenization, POS tagging, and entity extraction
 * using rule-based heuristics.
 */
export class SimpleNLPProvider implements NLPProvider {
  readonly id = 'simple-nlp';

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    // Build tokens with dependency information
    const tokens: NLPToken[] = [];
    let charOffset = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const cleanWord = word.replace(/[.,!?;:'"()[\]{}]+/g, '').toLowerCase();
      const pos = this.inferPOS(cleanWord);
      const depLabel = this.inferDependencyLabel(cleanWord, pos, i, words);
      const headIndex = this.inferHeadIndex(i, words, pos);

      const beginOffset = text.indexOf(word, charOffset);
      const endOffset = beginOffset + word.length;
      charOffset = endOffset;

      tokens.push({
        index: i,
        text: word.replace(/[.,!?;:'"()[\]{}]+$/g, ''),
        lemma: this.lemmatize(cleanWord),
        pos,
        tag: pos,
        beginOffset,
        endOffset,
        headIndex,
        dependencyLabel: depLabel,
      });
    }

    // Build entities from proper nouns, tech terms, and dates
    const entities: NLPEntity[] = this.extractEntities(tokens, text);

    // Build sentences
    const nlpSentences: NLPSentence[] = sentences.map((s) => {
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
    const lower = word.toLowerCase();

    // Check special word categories first
    if (POSITIVE_VERBS.has(lower) || NEGATIVE_VERBS.has(lower)) return 'VERB';
    if (QUESTION_WORDS.has(lower)) return 'ADV';
    if (NEGATIONS.has(lower)) return 'PART';

    // Tech terms are proper nouns
    if (TECH_TERMS.has(lower)) return 'PROPN';

    // Pattern-based detection
    if (/^[A-Z][a-z]+/.test(word)) return 'PROPN'; // Capitalized words
    if (/^\d+$/.test(word)) return 'NUM';
    if (['a', 'an', 'the'].includes(lower)) return 'DET';
    if (['to', 'in', 'on', 'at', 'for', 'with', 'from', 'of', 'by'].includes(lower)) return 'ADP';
    if (['and', 'or', 'but'].includes(lower)) return 'CCONJ';
    if (['is', 'are', 'was', 'were', 'be', 'been', 'being'].includes(lower)) return 'AUX';
    if (lower.endsWith('ly')) return 'ADV';
    if (lower.endsWith('ing') || lower.endsWith('ed')) return 'VERB';
    if (lower.endsWith('ful') || lower.endsWith('ous') || lower.endsWith('ive')) return 'ADJ';

    // Default to noun for unknown words
    return 'NOUN';
  }

  private inferDependencyLabel(word: string, pos: string, index: number, words: string[]): string {
    const lower = word.toLowerCase();

    if (index === 0 || (pos === 'VERB' && !NEGATIONS.has(lower))) return 'ROOT';
    if (NEGATIONS.has(lower)) return 'NEG';
    if (pos === 'DET') return 'DET';
    if (pos === 'ADP') return 'PREP';
    if (pos === 'NOUN' || pos === 'PROPN') {
      // Check if after a preposition
      if (index > 0) {
        const prevWord = words[index - 1].toLowerCase();
        if (['to', 'in', 'on', 'at', 'for', 'with', 'from', 'of', 'by'].includes(prevWord)) {
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
    if (pos === 'VERB') return -1; // Root

    // Find the main verb
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[.,!?;:'"()[\]{}]+/g, '').toLowerCase();
      if (
        POSITIVE_VERBS.has(w) ||
        NEGATIVE_VERBS.has(w) ||
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
    if (word.endsWith('es') && word.length > 3) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) return word.slice(0, -1);
    return word;
  }

  private extractEntities(tokens: NLPToken[], _text: string): NLPEntity[] {
    const entities: NLPEntity[] = [];

    for (const token of tokens) {
      const lower = token.lemma.toLowerCase();

      // Tech terms are PRODUCT entities
      if (TECH_TERMS.has(lower)) {
        entities.push({
          text: token.text,
          type: 'PRODUCT',
          salience: 0.9,
          beginOffset: token.beginOffset,
          endOffset: token.endOffset,
        });
        continue;
      }

      // Proper nouns are potential named entities
      if (token.pos === 'PROPN') {
        let type = 'PERSON';
        // Geographic detection
        if (
          [
            'japan',
            'tokyo',
            'paris',
            'london',
            'new',
            'york',
            'usa',
            'china',
            'europe',
            'asia',
          ].includes(lower)
        ) {
          type = 'GPE';
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
 * Singleton instance
 */
let nlpProvider: NLPProvider | null = null;

/**
 * Get the NLP provider instance
 *
 * Uses Google Cloud NLP if GOOGLE_CLOUD_NLP_KEY is set,
 * otherwise falls back to SimpleNLPProvider.
 */
export function getNLPProvider(): NLPProvider {
  if (!nlpProvider) {
    const googleApiKey = process.env.GOOGLE_CLOUD_NLP_KEY;

    if (googleApiKey) {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      console.log(`[nlp] Using Google Cloud NLP provider${proxyUrl ? ` (via proxy: ${proxyUrl})` : ''}`);
      nlpProvider = createGoogleCloudNLPProvider(googleApiKey, {
        fetch: getProxyFetch(),
      });
    } else {
      console.log('[nlp] Using SimpleNLPProvider (set GOOGLE_CLOUD_NLP_KEY for better quality)');
      nlpProvider = new SimpleNLPProvider();
    }
  }
  return nlpProvider;
}
