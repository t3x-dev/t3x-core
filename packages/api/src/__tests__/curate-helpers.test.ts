/**
 * Curate Helper Functions Tests
 *
 * Tests for extractChunksFromTurns with camelCase/snake_case compatibility
 */

import { sha256 } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { extractChunksFromTurns } from '../routes/curate.openapi';

describe('extractChunksFromTurns', () => {
  const computeHash = sha256;

  describe('Ring3 segment extraction', () => {
    it('extracts segments with camelCase fields', () => {
      const turns = [
        {
          role: 'user',
          content: 'Hello world. How are you?',
          rings: {
            ring3: {
              segments: [
                { segmentId: 's-0', text: 'Hello world.', startChar: 0, endChar: 12 },
                { segmentId: 's-1', text: 'How are you?', startChar: 13, endChar: 25 },
              ],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].text).toBe('Hello world.');
      expect(result.chunks[1].text).toBe('How are you?');
    });

    it('extracts segments with snake_case fields', () => {
      const turns = [
        {
          role: 'user',
          content: 'Hello world. How are you?',
          rings: {
            ring3: {
              segments: [
                { segment_id: 's-0', text: 'Hello world.', start_char: 0, end_char: 12 },
                { segment_id: 's-1', text: 'How are you?', start_char: 13, end_char: 25 },
              ],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].text).toBe('Hello world.');
      expect(result.chunks[1].text).toBe('How are you?');
    });

    it('handles nested rings structure (rings.rings.ring3)', () => {
      const turns = [
        {
          role: 'assistant',
          content: 'Test sentence.',
          rings: {
            rings: {
              ring3: {
                segments: [{ text: 'Test sentence.', startChar: 0, endChar: 14 }],
              },
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].text).toBe('Test sentence.');
    });

    it('falls back to regex splitting when ring3 is missing (with warning)', () => {
      const turns = [
        {
          role: 'user',
          content: 'No segments here.',
          rings: {},
        },
      ];

      // Ring3 missing triggers regex fallback (graceful degradation)
      const result = extractChunksFromTurns(turns, computeHash);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].text).toContain('No segments here');
      // Warning is emitted about missing Ring3
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/no Ring3 data/);
    });

    it('allows empty segments array (valid for empty/punctuation-only content)', () => {
      const turns = [
        {
          role: 'user',
          content: '...',
          rings: {
            ring3: {
              segments: [], // Empty is valid for punctuation-only
            },
          },
        },
      ];

      // Empty segments is legitimate - just produces no chunks
      const result = extractChunksFromTurns(turns, computeHash);
      expect(result.chunks).toHaveLength(0);
      // But sourceText should still include the turn
      expect(result.sourceText).toBe('[user]: ...');
    });

    it('maintains correct offsets when empty segments turn is in the middle', () => {
      const turns = [
        {
          role: 'user',
          content: 'First.',
          rings: {
            ring3: {
              segments: [{ text: 'First.', startChar: 0, endChar: 6 }],
            },
          },
        },
        {
          role: 'assistant',
          content: '...',
          rings: {
            ring3: {
              segments: [], // Empty - punctuation only
            },
          },
        },
        {
          role: 'user',
          content: 'Third.',
          rings: {
            ring3: {
              segments: [{ text: 'Third.', startChar: 0, endChar: 6 }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      // Should have chunks from turn 0 and turn 2
      expect(result.chunks).toHaveLength(2);

      // sourceText should include all 3 turns with correct separators
      expect(result.sourceText).toBe('[user]: First.\n\n[assistant]: ...\n\n[user]: Third.');

      // Verify offsets are correct
      const chunk0 = result.chunks[0];
      const chunk2 = result.chunks[1];

      // First chunk: "[user]: " (8 chars) + "First." at position 0-6
      expect(chunk0.text).toBe('First.');
      expect(chunk0.start).toBe(8); // prefix length
      expect(chunk0.end).toBe(14);

      // Third chunk: after "[user]: First.\n\n[assistant]: ...\n\n[user]: "
      // = 14 + 2 + 16 + 2 + 8 = 42
      expect(chunk2.text).toBe('Third.');
      expect(chunk2.start).toBe(42);
      expect(chunk2.end).toBe(48);

      // Verify we can extract the text correctly from sourceText
      expect(result.sourceText.slice(chunk0.start, chunk0.end)).toBe('First.');
      expect(result.sourceText.slice(chunk2.start, chunk2.end)).toBe('Third.');
    });

    it('throws error when segments exist but all have missing fields (Fail-Fast)', () => {
      const turns = [
        {
          role: 'user',
          content: 'Segments without offsets.',
          rings: {
            ring3: {
              segments: [{ text: 'Segments without offsets.' }, { text: 'Another segment.' }],
            },
          },
        },
      ];

      // Fail-Fast: Error message includes detailed field info
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(
        /Ring3 segments have missing fields.*2\/2 segments invalid/
      );
    });

    it('throws error when some segments have missing fields (Fail-Fast, no partial fallback)', () => {
      const turns = [
        {
          role: 'user',
          content: 'Hello world.',
          rings: {
            ring3: {
              segments: [
                { text: 'Hello world.', startChar: 0, endChar: 12 },
                // biome-ignore lint/suspicious/noExplicitAny: test helper
                { text: 'Invalid', startChar: undefined, endChar: undefined } as any,
              ],
            },
          },
        },
      ];

      // Fail-Fast: ANY segment missing required fields is an error (no silent degradation)
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(
        /Ring3 segments have missing fields.*1\/2 segments invalid/
      );
    });

    it('throws error when segment text is missing (Fail-Fast)', () => {
      const turns = [
        {
          role: 'user',
          content: 'Hello world.',
          rings: {
            ring3: {
              segments: [
                // biome-ignore lint/suspicious/noExplicitAny: test helper
                { startChar: 0, endChar: 12 } as any, // Missing text
              ],
            },
          },
        },
      ];

      // Fail-Fast: seg.text is required
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(
        /Ring3 segments have missing fields.*\[0\]: missing text/
      );
    });
  });

  describe('Ring1 anchor extraction', () => {
    it('extracts anchors with camelCase fields', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              inputTextHash: computeHash(content),
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
      expect(result.anchorCandidates[0].type).toBe('money');
    });

    it('extracts anchors with snake_case offset fields (start_char/end_char)', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  start_char: 13,
                  end_char: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              input_text_hash: computeHash(content),
            },
            ring3: {
              segments: [{ text: content, start_char: 0, end_char: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('extracts anchors with snake_case property name (anchor_candidates)', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // Using snake_case property name
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              input_text_hash: computeHash(content),
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('extracts anchors with full snake_case format', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // Full snake_case: property name + offset fields + hash
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  start_char: 13,
                  end_char: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              input_text_hash: computeHash(content),
            },
            ring3: {
              segments: [{ text: content, start_char: 0, end_char: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('extracts anchors from nested rings.rings.ring1.anchor_candidates', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            rings: {
              ring1: {
                // Nested structure with snake_case property name
                anchor_candidates: [
                  {
                    text: '$5000',
                    type: 'money' as const,
                    start_char: 13,
                    end_char: 18,
                    confidence: 0.95,
                    source: 'phrase' as const,
                  },
                ],
                input_text_hash: computeHash(content),
              },
              ring3: {
                segments: [{ text: content, startChar: 0, endChar: content.length }],
              },
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('respects empty anchorCandidates array (no fallback to anchor_candidates)', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // Empty array is authoritative - means "no candidates"
              // Should NOT fall back to anchor_candidates
              anchorCandidates: [],
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      // Empty array means no candidates, should not pick up anchor_candidates
      expect(result.anchorCandidates).toHaveLength(0);
    });

    it('uses anchor_candidates only when anchorCandidates is undefined', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // anchorCandidates not defined, fall back to anchor_candidates
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('throws error when hash mismatch', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              inputTextHash: 'wrong_hash_value_here',
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      // Strict fail-fast: hash mismatch throws error
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(/hash mismatch/i);
    });

    it('throws error when hash mismatch (snake_case fields)', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // Full snake_case: anchor_candidates + input_text_hash
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  start_char: 13,
                  end_char: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              input_text_hash: 'wrong_hash_value_here',
            },
            ring3: {
              segments: [{ text: content, start_char: 0, end_char: content.length }],
            },
          },
        },
      ];

      // Strict fail-fast: hash mismatch throws error even with snake_case fields
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(/hash mismatch/i);
    });

    it('falls back to anchor_candidates when anchorCandidates is null', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              // anchorCandidates: null should NOT block anchor_candidates
              anchorCandidates: null,
              anchor_candidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              input_text_hash: computeHash(content),
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      // biome-ignore lint/suspicious/noExplicitAny: test type cast
      const result = extractChunksFromTurns(turns as any, computeHash);

      // null is not authoritative, should fall back to anchor_candidates
      expect(result.anchorCandidates).toHaveLength(1);
      expect(result.anchorCandidates[0].text).toBe('$5000');
    });

    it('includes anchors when no hash stored (no validation)', () => {
      const content = 'The price is $5000.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: '$5000',
                  type: 'money' as const,
                  startChar: 13,
                  endChar: 18,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
              // No inputTextHash - should still include anchors
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
    });

    it('throws error for anchors with missing required fields', () => {
      const content = 'Test content.';
      const turns = [
        {
          role: 'user',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: 'Test',
                  type: 'term' as const,
                  // Missing startChar/endChar
                  confidence: 0.9,
                  source: 'token' as const,
                  // biome-ignore lint/suspicious/noExplicitAny: test helper
                } as any,
              ],
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      // Strict fail-fast: missing required fields throw error
      expect(() => extractChunksFromTurns(turns, computeHash)).toThrow(
        /startChar\/start_char: required/
      );
    });
  });

  describe('Global offset calculation', () => {
    it('calculates correct global offsets for multiple turns', () => {
      const turns = [
        {
          role: 'user',
          content: 'First.',
          rings: {
            ring3: {
              segments: [{ text: 'First.', startChar: 0, endChar: 6 }],
            },
          },
        },
        {
          role: 'assistant',
          content: 'Second.',
          rings: {
            ring3: {
              segments: [{ text: 'Second.', startChar: 0, endChar: 7 }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.chunks).toHaveLength(2);
      // First chunk: "[user]: " (8 chars) + startChar 0
      expect(result.chunks[0].start).toBe(8);
      expect(result.chunks[0].end).toBe(14); // 8 + 6

      // Second chunk: after "[user]: First.\n\n[assistant]: " = 8 + 6 + 2 + 13 = 29
      const expectedSecondStart = '[user]: First.'.length + '\n\n'.length + '[assistant]: '.length;
      expect(result.chunks[1].start).toBe(expectedSecondStart);
    });

    it('adjusts anchor offsets to global positions', () => {
      const content = 'Pay $100.';
      const helloContent = 'Hello.';
      const turns = [
        {
          role: 'user',
          content: helloContent,
          rings: {
            ring3: {
              segments: [{ text: helloContent, startChar: 0, endChar: helloContent.length }],
            },
          },
        },
        {
          role: 'assistant',
          content,
          rings: {
            ring1: {
              anchorCandidates: [
                {
                  text: '$100',
                  type: 'money' as const,
                  startChar: 4,
                  endChar: 8,
                  confidence: 0.95,
                  source: 'phrase' as const,
                },
              ],
            },
            ring3: {
              segments: [{ text: content, startChar: 0, endChar: content.length }],
            },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.anchorCandidates).toHaveLength(1);
      // Global offset = "[user]: Hello.\n\n[assistant]: " + 4
      const prefix1 = '[user]: Hello.';
      const separator = '\n\n';
      const prefix2 = '[assistant]: ';
      const expectedStart = prefix1.length + separator.length + prefix2.length + 4;
      expect(result.anchorCandidates[0].startChar).toBe(expectedStart);
    });
  });

  describe('Source text generation', () => {
    it('joins turns with double newline separator', () => {
      const turns = [
        {
          role: 'user',
          content: 'Hello.',
          rings: {
            ring3: { segments: [{ text: 'Hello.', startChar: 0, endChar: 6 }] },
          },
        },
        {
          role: 'assistant',
          content: 'Hi.',
          rings: {
            ring3: { segments: [{ text: 'Hi.', startChar: 0, endChar: 3 }] },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.sourceText).toBe('[user]: Hello.\n\n[assistant]: Hi.');
    });

    it('handles single turn without trailing separator', () => {
      const turns = [
        {
          role: 'user',
          content: 'Single.',
          rings: {
            ring3: { segments: [{ text: 'Single.', startChar: 0, endChar: 7 }] },
          },
        },
      ];

      const result = extractChunksFromTurns(turns, computeHash);

      expect(result.sourceText).toBe('[user]: Single.');
    });
  });
});
