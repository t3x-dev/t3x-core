/**
 * NLP Provider Tests
 *
 * Tests for NLP provider base utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  NLPProviderError,
  normalizePosTag,
  normalizeDependencyLabel,
  POS_TAG_MAPPING,
} from '../../providers/nlp/base';

describe('NLP Provider', () => {
  describe('normalizePosTag', () => {
    it('normalizes known POS tags', () => {
      expect(normalizePosTag('NOUN')).toBe('NOUN');
      expect(normalizePosTag('VERB')).toBe('VERB');
      expect(normalizePosTag('ADJ')).toBe('ADJ');
      expect(normalizePosTag('ADV')).toBe('ADV');
      expect(normalizePosTag('PRON')).toBe('PRON');
    });

    it('handles lowercase input', () => {
      expect(normalizePosTag('noun')).toBe('NOUN');
      expect(normalizePosTag('verb')).toBe('VERB');
    });

    it('maps CONJ to CCONJ', () => {
      expect(normalizePosTag('CONJ')).toBe('CCONJ');
    });

    it('maps PRT to PART', () => {
      expect(normalizePosTag('PRT')).toBe('PART');
    });

    it('maps unknown tags to X', () => {
      expect(normalizePosTag('UNKNOWN')).toBe('X');
      expect(normalizePosTag('AFFIX')).toBe('X');
      expect(normalizePosTag('X')).toBe('X');
    });

    it('returns uppercase for unmapped tags', () => {
      expect(normalizePosTag('custom_tag')).toBe('CUSTOM_TAG');
    });
  });

  describe('normalizeDependencyLabel', () => {
    it('normalizes standard dependency labels', () => {
      expect(normalizeDependencyLabel('ROOT')).toBe('ROOT');
      expect(normalizeDependencyLabel('NSUBJ')).toBe('NSUBJ');
      expect(normalizeDependencyLabel('DOBJ')).toBe('DOBJ');
      expect(normalizeDependencyLabel('POBJ')).toBe('POBJ');
    });

    it('handles lowercase input', () => {
      expect(normalizeDependencyLabel('root')).toBe('ROOT');
      expect(normalizeDependencyLabel('nsubj')).toBe('NSUBJ');
    });

    it('maps NSUBJPASS to NSUBJ', () => {
      expect(normalizeDependencyLabel('NSUBJPASS')).toBe('NSUBJ');
    });

    it('maps OBJ to DOBJ', () => {
      expect(normalizeDependencyLabel('OBJ')).toBe('DOBJ');
    });

    it('maps COMPOUND to NN', () => {
      expect(normalizeDependencyLabel('COMPOUND')).toBe('NN');
    });

    it('normalizes negation and auxiliary labels', () => {
      expect(normalizeDependencyLabel('NEG')).toBe('NEG');
      expect(normalizeDependencyLabel('AUX')).toBe('AUX');
      expect(normalizeDependencyLabel('AUXPASS')).toBe('AUXPASS');
    });

    it('normalizes modifier labels', () => {
      expect(normalizeDependencyLabel('ADVMOD')).toBe('ADVMOD');
      expect(normalizeDependencyLabel('AMOD')).toBe('AMOD');
    });

    it('returns uppercase for unmapped labels', () => {
      expect(normalizeDependencyLabel('custom_label')).toBe('CUSTOM_LABEL');
    });
  });

  describe('NLPProviderError', () => {
    it('creates error with provider ID', () => {
      const error = new NLPProviderError('google-cloud-nlp');

      expect(error.name).toBe('NLPProviderError');
      expect(error.providerId).toBe('google-cloud-nlp');
      expect(error.message).toContain('google-cloud-nlp');
      expect(error.message).toContain('unavailable');
    });

    it('creates error with custom message', () => {
      const error = new NLPProviderError(
        'spacy',
        undefined,
        'Model not found: en_core_web_sm'
      );

      expect(error.message).toBe('Model not found: en_core_web_sm');
      expect(error.providerId).toBe('spacy');
    });

    it('captures cause error', () => {
      const cause = new Error('Connection refused');
      const error = new NLPProviderError('test-nlp', cause);

      expect(error.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const error = new NLPProviderError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('POS_TAG_MAPPING', () => {
    it('contains all standard Universal Dependencies tags', () => {
      const expectedTags = ['NOUN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'NUM'];
      for (const tag of expectedTags) {
        expect(POS_TAG_MAPPING).toHaveProperty(tag);
      }
    });

    it('maps Google Cloud NLP specific tags', () => {
      expect(POS_TAG_MAPPING.PRT).toBe('PART');
      expect(POS_TAG_MAPPING.AFFIX).toBe('X');
    });
  });
});
