import { describe, expect, it } from 'vitest';
import { buildColoredHighlights } from '@/components/leaf/LeafConstraintSourceContext';
import type { Constraint } from '@/lib/api';
import type { SentenceWithSource } from '@/types/sourceContext';

// Helper to build a SentenceWithHighlight-like structure that buildColoredHighlights expects
function makeSentenceHighlight(
  sentenceId: string,
  turnHash: string,
  start: number,
  end: number,
  text: string
) {
  return {
    sentence: {
      id: sentenceId,
      text,
      source: { turn_hash: turnHash, start_char: start, end_char: end },
    } as SentenceWithSource,
    turnHash,
    highlight: { start, end },
  };
}

describe('buildColoredHighlights', () => {
  const turnContent = 'I prefer dark mode and use TypeScript for all my projects.';
  //                    0123456789...

  it('returns green ranges when no constraints exist', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const result = buildColoredHighlights(turnContent, sh, [], [sh[0].sentence]);

    expect(result).toEqual([{ start: 0, end: 58, color: 'green' }]);
  });

  it('highlights require constraint in deepGreen, splits green around it', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_1',
        type: 'require',
        match_mode: 'exact',
        value: 'dark mode',
        source_sentence_id: 's1',
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    // "dark mode" is at index 9..18
    expect(result).toEqual([
      { start: 0, end: 9, color: 'green' },
      { start: 9, end: 18, color: 'deepGreen' },
      { start: 18, end: 58, color: 'green' },
    ]);
  });

  it('highlights exclude constraint in deepRed', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_2',
        type: 'exclude',
        match_mode: 'exact',
        value: 'TypeScript',
        reason: 'test',
      },
    ];
    // exclude constraint has no source_sentence_id, uses description fallback
    // Add description to link to s1
    constraints[0].description = 'Excluded from sentence s1';

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    // "TypeScript" starts at index 27
    const tsStart = turnContent.indexOf('TypeScript');
    const tsEnd = tsStart + 'TypeScript'.length;

    expect(result).toContainEqual({ start: tsStart, end: tsEnd, color: 'deepRed' });
    // Green segments before and after
    expect(result[0]).toEqual({ start: 0, end: tsStart, color: 'green' });
  });

  it('handles multiple constraints on the same sentence', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_1',
        type: 'require',
        match_mode: 'exact',
        value: 'dark mode',
        source_sentence_id: 's1',
      },
      {
        id: 'cst_2',
        type: 'exclude',
        match_mode: 'exact',
        value: 'TypeScript',
        description: 'Excluded from sentence s1',
        reason: 'test',
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    const colors = result.map((r) => r.color);
    expect(colors).toContain('deepGreen');
    expect(colors).toContain('deepRed');
    expect(colors).toContain('green');
    // Total coverage should equal original range
    const totalChars = result.reduce((sum, r) => sum + (r.end - r.start), 0);
    expect(totalChars).toBe(58);
  });

  it('falls back to searching all sentences when no link found', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_orphan',
        type: 'require',
        match_mode: 'exact',
        value: 'dark mode',
        // no source_sentence_id, no description → fallback searches all sentences
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    // Should find "dark mode" via fallback search
    expect(result).toContainEqual({ start: 9, end: 18, color: 'deepGreen' });
  });

  it('highlights exclude constraint via reason field link', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_reason',
        type: 'exclude',
        match_mode: 'exact',
        value: 'TypeScript',
        reason: 'Excluded from sentence s1',
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    const tsStart = turnContent.indexOf('TypeScript');
    const tsEnd = tsStart + 'TypeScript'.length;
    expect(result).toContainEqual({ start: tsStart, end: tsEnd, color: 'deepRed' });
  });

  it('highlights exclude constraint even without any link (fallback)', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_nolink',
        type: 'exclude',
        match_mode: 'exact',
        value: 'TypeScript',
        // no description, no reason with sentence ID → fallback searches all sentences
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    const tsStart = turnContent.indexOf('TypeScript');
    const tsEnd = tsStart + 'TypeScript'.length;
    expect(result).toContainEqual({ start: tsStart, end: tsEnd, color: 'deepRed' });
  });

  it('skips constraint value not found in text (semantic graceful degradation)', () => {
    const sh = [makeSentenceHighlight('s1', 'h1', 0, 58, turnContent)];
    const constraints: Constraint[] = [
      {
        id: 'cst_sem',
        type: 'require',
        match_mode: 'semantic',
        value: 'nonexistent phrase xyz',
        source_sentence_id: 's1',
      },
    ];

    const result = buildColoredHighlights(turnContent, sh, constraints, [sh[0].sentence]);

    // Value not found → no deepGreen, all green
    expect(result).toEqual([{ start: 0, end: 58, color: 'green' }]);
  });

  it('handles multiple sentences from the same turn', () => {
    // Turn content has two sentences at different offsets
    const content = 'First sentence here. Second sentence there.';
    const sh = [
      makeSentenceHighlight('s1', 'h1', 0, 20, 'First sentence here.'),
      makeSentenceHighlight('s2', 'h1', 21, 44, 'Second sentence there.'),
    ];
    const constraints: Constraint[] = [
      {
        id: 'cst_1',
        type: 'require',
        match_mode: 'exact',
        value: 'First',
        source_sentence_id: 's1',
      },
    ];

    const result = buildColoredHighlights(content, sh, constraints, [
      sh[0].sentence,
      sh[1].sentence,
    ]);

    // s1: "First" deepGreen at 0..5, rest green 5..20
    // s2: all green 21..44
    expect(result).toContainEqual({ start: 0, end: 5, color: 'deepGreen' });
    expect(result).toContainEqual({ start: 5, end: 20, color: 'green' });
    expect(result).toContainEqual({ start: 21, end: 44, color: 'green' });
  });

  it('returns sorted results by start position', () => {
    const content = 'AAAA BBBB CCCC DDDD';
    const sh = [
      makeSentenceHighlight('s1', 'h1', 10, 14, 'CCCC'),
      makeSentenceHighlight('s2', 'h1', 0, 4, 'AAAA'),
    ];

    const result = buildColoredHighlights(content, sh, [], [sh[0].sentence, sh[1].sentence]);

    // Should be sorted: s2 (0..4) before s1 (10..14)
    expect(result[0].start).toBeLessThan(result[1].start);
  });
});
