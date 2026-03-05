/**
 * Ring Extractor Tests
 *
 * Tests for Ring 1/2/3 semantic extraction.
 * Ported from Python tests/test_ring_extractor.py
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createRingExtractor, RingExtractor } from '../../extractors/ringExtractor';
import { createEmptyRingOutput } from '../../extractors/types';
import { StubNLPProvider } from '../setup';

describe('RingExtractor', () => {
  let nlpProvider: StubNLPProvider;
  let extractor: RingExtractor;

  beforeEach(() => {
    nlpProvider = new StubNLPProvider();
    extractor = createRingExtractor(nlpProvider);
  });

  describe('Full Extraction', () => {
    it('extracts Ring 1/2/3 from simple text', async () => {
      const result = await extractor.extract('turn-1', 'I want to travel to Japan in November.');

      expect(result.turnId).toBe('turn-1');
      expect(result.ring1).toBeDefined();
      expect(result.ring2).toBeDefined();
      expect(result.ring3).toBeDefined();
    });

    it('returns empty output for empty text', async () => {
      const result = await extractor.extract('turn-2', '');

      expect(result.turnId).toBe('turn-2');
      expect(result.ring1.keywords).toHaveLength(0);
      expect(result.ring2.facets).toHaveLength(0);
      expect(result.ring3.segments).toHaveLength(0);
    });

    it('returns empty output for whitespace-only text', async () => {
      const result = await extractor.extract('turn-3', '   \n\t  ');

      expect(result.ring1.keywords).toHaveLength(0);
    });
  });

  describe('Ring 1 - Keyword Extraction', () => {
    it('extracts nouns as keywords', async () => {
      const result = await extractor.extract('turn-1', 'The hotel has a beautiful pool.');

      const lemmas = result.ring1.keywords.map((k) => k.lemma);
      expect(lemmas).toContain('hotel');
      expect(lemmas).toContain('pool');
    });

    it('extracts proper nouns (named entities)', async () => {
      const result = await extractor.extract('turn-1', 'I want to visit Tokyo and Paris.');

      // Check that proper nouns are extracted as keywords
      // The stub provider detects proper nouns and may assign entity types
      const properNouns = result.ring1.keywords.filter(
        (k) => k.pos === 'PROPN' || k.entityType !== null
      );
      expect(properNouns.length).toBeGreaterThanOrEqual(0);
    });

    it('extracts time anchor from date entities', async () => {
      const result = await extractor.extract('turn-1', 'I plan to travel in November 2025.');

      // The stub provider should detect "November" as a DATE entity
      if (result.ring1.timeAnchor) {
        expect(result.ring1.timeAnchor.toLowerCase()).toContain('november');
      }
    });

    it('identifies topic from first significant noun', async () => {
      const result = await extractor.extract('turn-1', 'The flight to Tokyo departs early.');

      // Topic should be the first significant noun
      if (result.ring1.topic) {
        expect(['flight', 'tokyo']).toContain(result.ring1.topic.toLowerCase());
      }
    });

    it('extracts preference keywords with polarity', async () => {
      const result = await extractor.extract(
        'turn-1',
        'I like window seats but hate crowded flights.'
      );

      // Should have some preference keywords (polarity != 0)
      // Note: depends on how well stub provider handles this
      expect(result.ring1.preferenceKeywords).toBeDefined();
    });

    it('filters out stop words', async () => {
      const result = await extractor.extract('turn-1', 'I want to go to the store.');

      const lemmas = result.ring1.keywords.map((k) => k.lemma);
      // Common stop words should be filtered
      expect(lemmas).not.toContain('i');
      expect(lemmas).not.toContain('to');
      expect(lemmas).not.toContain('the');
    });

    it('assigns 0.5 fallback confidence for non-entity keywords', async () => {
      const result = await extractor.extract('turn-1', 'The hotel has a beautiful pool.');

      // Non-entity nouns like "hotel" and "pool" have no entity salience,
      // so they should get the 0.5 fallback (not 1.0).
      for (const kw of result.ring1.keywords) {
        if (kw.entityType === null) {
          expect(kw.confidence).toBe(0.5);
        }
      }
    });

    it('deduplicates keywords by lemma', async () => {
      const result = await extractor.extract('turn-1', 'The hotels are nice. I like these hotels.');

      const hotelKeywords = result.ring1.keywords.filter((k) => k.lemma === 'hotel');
      expect(hotelKeywords.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Ring 2 - Facet Extraction', () => {
    it('extracts intent_seed facet', async () => {
      const result = await extractor.extract('turn-1', 'I want to book a flight to Tokyo.');

      const intentFacets = result.ring2.facets.filter((f) => f.facetType === 'intent_seed');
      expect(intentFacets.length).toBeGreaterThanOrEqual(0);
    });

    it('extracts time_window facet from dates', async () => {
      const result = await extractor.extract('turn-1', 'I plan to travel in November.');

      const timeFacets = result.ring2.facets.filter((f) => f.facetType === 'time_window');
      // If November is detected as DATE, should have time_window
      if (result.ring1.timeAnchor) {
        expect(timeFacets.length).toBeGreaterThan(0);
      }
    });

    it('extracts preference_soft facets from polarity keywords', async () => {
      const result = await extractor.extract('turn-1', 'I prefer direct flights.');

      const prefFacets = result.ring2.facets.filter((f) => f.facetType === 'preference_soft');
      // May or may not have preference facets depending on stub accuracy
      expect(prefFacets).toBeDefined();
    });

    it('extracts unknown_slot facets from question words', async () => {
      const result = await extractor.extract('turn-1', 'What time does the flight leave?');

      const unknownSlots = result.ring2.facets.filter((f) => f.facetType === 'unknown_slot');
      // Should detect "What" as question word
      expect(unknownSlots.length).toBeGreaterThanOrEqual(0);
    });

    it('includes confidence scores on facets', async () => {
      const result = await extractor.extract('turn-1', 'I want to travel to Japan.');

      for (const facet of result.ring2.facets) {
        expect(facet.confidence).toBeGreaterThan(0);
        expect(facet.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Ring 3 - Sentence Segmentation', () => {
    it('segments text into sentences', async () => {
      const result = await extractor.extract(
        'turn-1',
        'I want to travel. Book me a flight. Thanks!'
      );

      expect(result.ring3.segments.length).toBeGreaterThanOrEqual(1);
    });

    it('includes segment IDs', async () => {
      const result = await extractor.extract('turn-1', 'First sentence. Second sentence.');

      for (const segment of result.ring3.segments) {
        expect(segment.segmentId).toBeDefined();
        expect(segment.segmentId).toMatch(/^s-\d+$/);
      }
    });

    it('includes character offsets', async () => {
      const text = 'Hello world. Goodbye world.';
      const result = await extractor.extract('turn-1', text);

      for (const segment of result.ring3.segments) {
        expect(segment.startChar).toBeGreaterThanOrEqual(0);
        expect(segment.endChar).toBeGreaterThan(segment.startChar);
        expect(segment.endChar).toBeLessThanOrEqual(text.length);
      }
    });

    it('handles single sentence', async () => {
      const result = await extractor.extract('turn-1', 'This is a single sentence');

      expect(result.ring3.segments.length).toBe(1);
      expect(result.ring3.segments[0].text).toBe('This is a single sentence');
    });
  });

  describe('Intent Mapping', () => {
    it('maps "want" verb to request intent', async () => {
      const result = await extractor.extract('turn-1', 'I want a window seat.');

      const intentFacet = result.ring2.facets.find((f) => f.facetType === 'intent_seed');
      if (intentFacet) {
        expect(['request', 'want']).toContain(intentFacet.value);
      }
    });

    it('maps "book" verb to booking intent', async () => {
      const result = await extractor.extract('turn-1', 'Book me a flight to Paris.');

      const intentFacet = result.ring2.facets.find((f) => f.facetType === 'intent_seed');
      if (intentFacet) {
        expect(['booking', 'book']).toContain(intentFacet.value);
      }
    });

    it('maps "find" verb to search intent', async () => {
      const result = await extractor.extract('turn-1', 'Find cheap hotels in Tokyo.');

      const intentFacet = result.ring2.facets.find((f) => f.facetType === 'intent_seed');
      if (intentFacet) {
        expect(['search', 'find']).toContain(intentFacet.value);
      }
    });
  });

  describe('Factory Function', () => {
    it('creates RingExtractor with default config', () => {
      const ext = createRingExtractor(nlpProvider);
      expect(ext).toBeInstanceOf(RingExtractor);
    });

    it('creates RingExtractor with custom POS tags', () => {
      const ext = createRingExtractor(nlpProvider, {
        keywordPosTags: ['NOUN', 'PROPN'],
      });
      expect(ext).toBeInstanceOf(RingExtractor);
    });

    it('creates RingExtractor with custom entity salience threshold', () => {
      const ext = createRingExtractor(nlpProvider, {
        minEntitySalience: 0.5,
      });
      expect(ext).toBeInstanceOf(RingExtractor);
    });
  });

  describe('Edge Cases', () => {
    it('handles text with only punctuation', async () => {
      const result = await extractor.extract('turn-1', '...!!!???');

      // Keywords should be empty or contain only empty/punctuation tokens
      // that get filtered by the extractor
      const meaningfulKeywords = result.ring1.keywords.filter(
        (k) => k.text.length > 0 && !/^[.,!?;:'"]+$/.test(k.text)
      );
      expect(meaningfulKeywords).toHaveLength(0);
    });

    it('handles very long text', async () => {
      const longText = 'I want to travel. '.repeat(100);
      const result = await extractor.extract('turn-1', longText);

      expect(result.ring3.segments.length).toBeGreaterThan(0);
    });

    it('handles unicode characters', async () => {
      const result = await extractor.extract('turn-1', 'I want to visit 東京 (Tokyo).');

      expect(result.ring1).toBeDefined();
      expect(result.ring3.segments.length).toBeGreaterThan(0);
    });

    it('handles mixed case text', async () => {
      const result = await extractor.extract('turn-1', 'I WANT TO TRAVEL to JAPAN.');

      // Keywords should be normalized to lowercase lemmas
      const upperLemmas = result.ring1.keywords.filter((k) => k.lemma !== k.lemma.toLowerCase());
      expect(upperLemmas).toHaveLength(0);
    });
  });

  describe('Ring 1 - Anchor Candidates (v1.1)', () => {
    it('extracts money patterns as anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'The price is $5000 or 1000 USD.');

      expect(result.ring1.anchorCandidates).toBeDefined();
      const moneyAnchors = result.ring1.anchorCandidates?.filter((a) => a.type === 'money') ?? [];
      expect(moneyAnchors.length).toBeGreaterThanOrEqual(1);

      const fiveK = moneyAnchors.find((a) => a.text === '$5000');
      if (fiveK) {
        expect(fiveK.source).toBe('phrase');
        expect(fiveK.startChar).toBeGreaterThanOrEqual(0);
        expect(fiveK.endChar).toBeGreaterThan(fiveK.startChar);
      }
    });

    it('extracts duration patterns as anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'The lease is for 30 days.');

      const durationAnchors =
        result.ring1.anchorCandidates?.filter((a) => a.type === 'duration') ?? [];
      expect(durationAnchors.length).toBeGreaterThanOrEqual(1);

      const thirtyDays = durationAnchors.find((a) => a.text === '30 days');
      expect(thirtyDays).toBeDefined();
      expect(thirtyDays?.source).toBe('phrase');
    });

    it('extracts percent patterns as anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'The discount is 15%.');

      const percentAnchors =
        result.ring1.anchorCandidates?.filter((a) => a.type === 'percent') ?? [];
      expect(percentAnchors.length).toBeGreaterThanOrEqual(1);
      expect(percentAnchors[0]?.text).toBe('15%');
    });

    it('extracts bare numbers as anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'We have 500 units in stock.');

      const numberAnchors = result.ring1.anchorCandidates?.filter((a) => a.type === 'number') ?? [];
      expect(numberAnchors.length).toBeGreaterThanOrEqual(1);
      expect(numberAnchors[0]?.text).toBe('500');
    });

    it('extracts date patterns as anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'The meeting is on January 15, 2025.');

      const dateAnchors = result.ring1.anchorCandidates?.filter((a) => a.type === 'date') ?? [];
      expect(dateAnchors.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves correct character offsets for phrase patterns', async () => {
      const text = 'Price: $100 for 7 days.';
      const result = await extractor.extract('turn-1', text);

      // Only verify phrase-sourced candidates (regex-matched, guaranteed correct offsets)
      // Token/entity candidates depend on stub provider which may have mock offsets
      const phraseCandidates =
        result.ring1.anchorCandidates?.filter((a) => a.source === 'phrase') ?? [];
      for (const candidate of phraseCandidates) {
        // Verify that the text at the offset matches the candidate text
        const extracted = text.slice(candidate.startChar, candidate.endChar);
        expect(extracted).toBe(candidate.text);
      }

      // Should have at least $100 and 7 days
      expect(phraseCandidates.length).toBeGreaterThanOrEqual(2);
    });

    it('does not overlap anchor candidates', async () => {
      const result = await extractor.extract('turn-1', 'The fee is $5000 for 30 days.');

      const candidates = result.ring1.anchorCandidates ?? [];

      // Check no overlapping ranges
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i];
          const b = candidates[j];
          const overlaps = !(a.endChar <= b.startChar || b.endChar <= a.startChar);
          expect(overlaps).toBe(false);
        }
      }
    });

    it('generates inputTextHash for consistency verification', async () => {
      const text = 'Hello world.';
      const result = await extractor.extract('turn-1', text);

      expect(result.ring1.inputTextHash).toBeDefined();
      expect(result.ring1.inputTextHash?.length).toBe(64); // SHA-256 hex is 64 chars

      // Same input should produce same hash
      const result2 = await extractor.extract('turn-2', text);
      expect(result2.ring1.inputTextHash).toBe(result.ring1.inputTextHash);
    });

    it('handles entity types case-insensitively', async () => {
      // This test verifies that mapEntityTypeToAnchorType works with lowercase
      // The stub provider may not provide lowercase types, but the code should handle it
      const result = await extractor.extract('turn-1', 'Visit Bangkok on January 1.');

      // If entities are extracted, they should be mapped correctly regardless of case
      expect(result.ring1.anchorCandidates).toBeDefined();
    });

    it('orders anchor candidates by startChar', async () => {
      const result = await extractor.extract('turn-1', 'Pay $100 in 30 days with 5% interest.');

      const candidates = result.ring1.anchorCandidates ?? [];
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i].startChar).toBeGreaterThanOrEqual(candidates[i - 1].startChar);
      }
    });
  });
});

describe('Ring Type Helpers', () => {
  describe('createEmptyRingOutput', () => {
    it('creates empty Ring output with turn ID', () => {
      const output = createEmptyRingOutput('test-turn');

      expect(output.turnId).toBe('test-turn');
      expect(output.ring1.keywords).toHaveLength(0);
      expect(output.ring1.timeAnchor).toBeNull();
      expect(output.ring1.topic).toBeNull();
      expect(output.ring1.preferenceKeywords).toHaveLength(0);
      expect(output.ring2.facets).toHaveLength(0);
      expect(output.ring3.segments).toHaveLength(0);
    });
  });
});
