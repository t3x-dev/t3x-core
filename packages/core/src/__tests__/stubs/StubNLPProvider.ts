/**
 * Stub NLP Provider for testing.
 *
 * Parses text with basic heuristics — no external calls.
 */

import type { NLPAnalysis, NLPEntity, NLPProvider, NLPSentence, NLPToken } from '../../providers/nlp';

export class StubNLPProvider implements NLPProvider {
  readonly id = 'stub-nlp';

  private readonly positiveVerbs = new Set(['want', 'like', 'prefer', 'need', 'love', 'enjoy']);
  private readonly negativeVerbs = new Set(['dislike', 'hate', 'avoid', 'reject']);
  private readonly negations = new Set(['not', "don't", "doesn't", "didn't", 'never', 'no']);
  private readonly questionWords = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'which']);

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

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

    const entities: NLPEntity[] = this.extractEntities(tokens);
    const nlpSentences: NLPSentence[] = sentences.map((s) => {
      const beginOffset = text.indexOf(s);
      return { text: s.trim(), sentiment: 0, beginOffset, endOffset: beginOffset + s.length };
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
      if (index > 0) {
        const prevWord = words[index - 1].toLowerCase();
        if (['to', 'in', 'on', 'at', 'for', 'with', 'from'].includes(prevWord)) return 'POBJ';
      }
      return 'DOBJ';
    }
    if (pos === 'ADV') return 'ADVMOD';
    if (pos === 'ADJ') return 'AMOD';
    return 'UNKNOWN';
  }

  private inferHeadIndex(index: number, words: string[], pos: string): number {
    if (pos === 'VERB') return -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[.,!?;:'"]+/g, '').toLowerCase();
      if (this.positiveVerbs.has(w) || this.negativeVerbs.has(w) || w.endsWith('ing') || w.endsWith('ed')) return i;
    }
    return index > 0 ? index - 1 : -1;
  }

  private lemmatize(word: string): string {
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('ed')) return word.slice(0, -2);
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
  }

  private extractEntities(tokens: NLPToken[]): NLPEntity[] {
    const entities: NLPEntity[] = [];
    for (const token of tokens) {
      if (token.pos === 'PROPN') {
        let type = 'PERSON';
        const lower = token.lemma.toLowerCase();
        if (['japan', 'tokyo', 'paris', 'london', 'new', 'york', 'usa', 'china'].includes(lower)) type = 'GPE';
        entities.push({ text: token.text, type, salience: 0.8, beginOffset: token.beginOffset, endOffset: token.endOffset });
      }
      if (/^\d{4}$/.test(token.text) || /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(token.text)) {
        entities.push({ text: token.text, type: 'DATE', salience: 0.7, beginOffset: token.beginOffset, endOffset: token.endOffset });
      }
    }
    return entities;
  }
}
