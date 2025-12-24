/**
 * Polarity Rule Engine Tests
 *
 * Tests for polarity annotation based on dependency parsing + rule tables.
 * Ported from Python tests/test_ring_extractor.py polarity tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type PolarityRuleEngine,
  createPolarityRuleEngine,
  PolarityRule,
} from '../../extractors/polarityRules';
import type { NLPToken } from '../../providers/nlp';

/**
 * Helper to create mock tokens with dependency info
 */
function createTokens(specs: Array<{
  text: string;
  lemma?: string;
  pos?: string;
  dep?: string;
  head?: number;
}>): NLPToken[] {
  return specs.map((spec, i) => ({
    index: i,
    text: spec.text,
    lemma: spec.lemma ?? spec.text.toLowerCase(),
    pos: spec.pos ?? 'NOUN',
    tag: spec.pos ?? 'NOUN',
    beginOffset: 0,
    endOffset: spec.text.length,
    headIndex: spec.head ?? -1,
    dependencyLabel: spec.dep ?? 'ROOT',
  }));
}

describe('PolarityRuleEngine', () => {
  let engine: PolarityRuleEngine;

  beforeEach(() => {
    engine = createPolarityRuleEngine();
  });

  describe('Positive Verbs', () => {
    it('returns +1 for "want" with object', () => {
      // "I want coffee"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'want', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'coffee', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(1);
    });

    it('returns +1 for "like" with object', () => {
      // "I like tea"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'like', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'tea', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(1);
    });

    it('returns +1 for "prefer" with object', () => {
      // "I prefer window seats"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'prefer', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'window', pos: 'NOUN', dep: 'NN', head: 3 },
        { text: 'seats', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[3], tokens[1], tokens);
      expect(polarity).toBe(1);
    });

    it('returns +1 for "need"', () => {
      // "I need help"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'need', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'help', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(1);
    });

    it('returns +1 for "love"', () => {
      // "I love traveling"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'love', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'traveling', pos: 'VERB', dep: 'XCOMP', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(1);
    });
  });

  describe('Negative Verbs', () => {
    it('returns -1 for "dislike" with object', () => {
      // "I dislike crowds"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'dislike', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'crowds', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(-1);
    });

    it('returns -1 for "hate"', () => {
      // "I hate waiting"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'hate', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'waiting', pos: 'VERB', dep: 'XCOMP', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(-1);
    });

    it('returns -1 for "avoid"', () => {
      // "I avoid layovers"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'avoid', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'layovers', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(-1);
    });

    it('returns -1 for "reject"', () => {
      // "I reject this proposal"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'reject', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'this', pos: 'DET', dep: 'DET', head: 3 },
        { text: 'proposal', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[3], tokens[1], tokens);
      expect(polarity).toBe(-1);
    });
  });

  describe('Negation Handling', () => {
    it('returns -1 for "don\'t want" (positive + negation = negative)', () => {
      // "I don't want delays"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 2 },
        { text: "don't", pos: 'AUX', dep: 'AUX', head: 2 },
        { text: 'want', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'delays', pos: 'NOUN', dep: 'DOBJ', head: 2 },
      ]);

      const polarity = engine.getPolarity(tokens[3], tokens[2], tokens);
      expect(polarity).toBe(-1);
    });

    it('returns -1 for "not like" (positive + negation = negative)', () => {
      // "I do not like crowds"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 3 },
        { text: 'do', pos: 'AUX', dep: 'AUX', head: 3 },
        { text: 'not', pos: 'PART', dep: 'NEG', head: 3 },
        { text: 'like', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'crowds', pos: 'NOUN', dep: 'DOBJ', head: 3 },
      ]);

      const polarity = engine.getPolarity(tokens[4], tokens[3], tokens);
      expect(polarity).toBe(-1);
    });

    it('returns -1 for "never want"', () => {
      // "I never want to wait"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 2 },
        { text: 'never', pos: 'ADV', dep: 'ADVMOD', head: 2 },
        { text: 'want', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'to', pos: 'PART', dep: 'MARK', head: 4 },
        { text: 'wait', pos: 'VERB', dep: 'XCOMP', head: 2 },
      ]);

      const polarity = engine.getPolarity(tokens[4], tokens[2], tokens);
      expect(polarity).toBe(-1);
    });
  });

  describe('Neutral Cases', () => {
    it('returns 0 for non-polarity verbs', () => {
      // "I see the mountain"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'see', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'the', pos: 'DET', dep: 'DET', head: 3 },
        { text: 'mountain', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[3], tokens[1], tokens);
      expect(polarity).toBe(0);
    });

    it('returns 0 for auxiliary verbs without polarity', () => {
      // "It is raining"
      const tokens = createTokens([
        { text: 'It', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'is', pos: 'AUX', dep: 'ROOT', head: -1 },
        { text: 'raining', pos: 'VERB', dep: 'XCOMP', head: 1 },
      ]);

      const polarity = engine.getPolarity(tokens[2], tokens[1], tokens);
      expect(polarity).toBe(0);
    });
  });

  describe('extractPreferenceRelations', () => {
    it('extracts preference relations from "I want coffee"', () => {
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'want', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'coffee', pos: 'NOUN', dep: 'DOBJ', head: 1 },
      ]);

      const relations = engine.extractPreferenceRelations(tokens);

      expect(relations).toHaveLength(1);
      expect(relations[0].verbToken.lemma).toBe('want');
      expect(relations[0].objectToken.lemma).toBe('coffee');
      expect(relations[0].polarity).toBe(1);
    });

    it('extracts multiple preference relations', () => {
      // "I like tea but hate coffee"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'like', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'tea', pos: 'NOUN', dep: 'DOBJ', head: 1 },
        { text: 'but', pos: 'CCONJ', dep: 'CC', head: 1 },
        { text: 'hate', pos: 'VERB', dep: 'CONJ', head: 1 },
        { text: 'coffee', pos: 'NOUN', dep: 'DOBJ', head: 4 },
      ]);

      const relations = engine.extractPreferenceRelations(tokens);

      expect(relations).toHaveLength(2);
      expect(relations[0].polarity).toBe(1);  // like tea
      expect(relations[1].polarity).toBe(-1); // hate coffee
    });

    it('handles prepositional objects', () => {
      // "I want to travel to Japan"
      const tokens = createTokens([
        { text: 'I', pos: 'PRON', dep: 'NSUBJ', head: 1 },
        { text: 'want', pos: 'VERB', dep: 'ROOT', head: -1 },
        { text: 'to', pos: 'PART', dep: 'MARK', head: 3 },
        { text: 'travel', pos: 'VERB', dep: 'XCOMP', head: 1 },
        { text: 'to', pos: 'ADP', dep: 'PREP', head: 1 },
        { text: 'Japan', pos: 'PROPN', dep: 'POBJ', head: 4 },
      ]);

      const relations = engine.extractPreferenceRelations(tokens);

      // Should find at least the XCOMP relation
      expect(relations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('isPolarityVerb', () => {
    it('returns true for positive verbs', () => {
      expect(engine.isPolarityVerb('want')).toBe(true);
      expect(engine.isPolarityVerb('like')).toBe(true);
      expect(engine.isPolarityVerb('prefer')).toBe(true);
      expect(engine.isPolarityVerb('need')).toBe(true);
      expect(engine.isPolarityVerb('love')).toBe(true);
    });

    it('returns true for negative verbs', () => {
      expect(engine.isPolarityVerb('dislike')).toBe(true);
      expect(engine.isPolarityVerb('hate')).toBe(true);
      expect(engine.isPolarityVerb('avoid')).toBe(true);
      expect(engine.isPolarityVerb('reject')).toBe(true);
    });

    it('returns false for neutral verbs', () => {
      expect(engine.isPolarityVerb('see')).toBe(false);
      expect(engine.isPolarityVerb('go')).toBe(false);
      expect(engine.isPolarityVerb('run')).toBe(false);
      expect(engine.isPolarityVerb('think')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(engine.isPolarityVerb('WANT')).toBe(true);
      expect(engine.isPolarityVerb('Want')).toBe(true);
      expect(engine.isPolarityVerb('HATE')).toBe(true);
    });
  });

  describe('getPolarityVerbs', () => {
    it('returns lists of positive and negative verbs', () => {
      const verbs = engine.getPolarityVerbs();

      expect(verbs.positive).toContain('want');
      expect(verbs.positive).toContain('like');
      expect(verbs.positive).toContain('prefer');
      expect(verbs.negative).toContain('dislike');
      expect(verbs.negative).toContain('hate');
      expect(verbs.negative).toContain('avoid');
    });
  });

  describe('Custom Rules', () => {
    it('allows adding custom positive rules', () => {
      const customRules = {
        positive: [
          { verb: 'desire', polarity: 1 as const, checkNegation: true },
          { verb: 'crave', polarity: 1 as const, checkNegation: true },
        ],
      };

      const customEngine = createPolarityRuleEngine(customRules);

      expect(customEngine.isPolarityVerb('desire')).toBe(true);
      expect(customEngine.isPolarityVerb('crave')).toBe(true);
    });

    it('allows adding custom negative rules', () => {
      const customRules = {
        negative: [
          { verb: 'detest', polarity: -1 as const, checkNegation: false },
          { verb: 'loathe', polarity: -1 as const, checkNegation: false },
        ],
      };

      const customEngine = createPolarityRuleEngine(customRules);

      expect(customEngine.isPolarityVerb('detest')).toBe(true);
      expect(customEngine.isPolarityVerb('loathe')).toBe(true);
    });
  });
});
