import type { SourcedYOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  applySourceTextDraftEdit,
  applySourceTextDraftsToTurns,
  markOpsFromSourceTextDrafts,
} from '@/domain/sourceTextDrafts';

describe('sourceTextDrafts', () => {
  it('edits source text and exposes effective turns for extraction', () => {
    const draft = applySourceTextDraftEdit({
      baseContent: 'Soccer taps into psychology.',
      input: {
        turnHash: 'turn_1',
        action: 'edit',
        start: 17,
        end: 27,
        selectedText: 'psychology',
        replacementText: 'group identity',
      },
      now: '2026-05-07T00:00:00.000Z',
    });

    expect(draft.content).toBe('Soccer taps into group identity.');
    expect(draft.turnRole).toBe('assistant');
    expect(draft.spans[0]).toMatchObject({
      action: 'edit',
      start: 17,
      end: 31,
      text: 'group identity',
    });
    expect(
      applySourceTextDraftsToTurns(
        [{ turn_hash: 'turn_1', role: 'assistant', content: 'Soccer taps into psychology.' }],
        { turn_1: draft }
      )[0].content
    ).toBe('Soccer taps into group identity.');
  });

  it('uses a source-text draft as an extraction turn when workspace turns have not hydrated', () => {
    const draft = applySourceTextDraftEdit({
      baseContent: 'Soccer taps into psychology.',
      input: {
        turnHash: 'turn_1',
        turnRole: 'assistant',
        action: 'edit',
        start: 17,
        end: 27,
        selectedText: 'psychology',
        replacementText: 'group identity',
      },
      now: '2026-05-07T00:00:00.000Z',
    });

    expect(applySourceTextDraftsToTurns([], { turn_1: draft })).toEqual([
      {
        turn_hash: 'turn_1',
        role: 'assistant',
        content: 'Soccer taps into group identity.',
      },
    ]);
  });

  it('marks extracted ops whose source overlaps an inline source draft', () => {
    const draft = applySourceTextDraftEdit({
      baseContent: 'Soccer taps into psychology.',
      input: {
        turnHash: 'turn_1',
        action: 'edit',
        start: 17,
        end: 27,
        selectedText: 'psychology',
        replacementText: 'group identity',
      },
      now: '2026-05-07T00:00:00.000Z',
    });
    const ops = [
      {
        set: { path: 'sports/soccer/identity', value: 'group identity' },
        source: {
          type: 'llm',
          model: 'gpt-5.4',
          at: '2026-05-07T00:00:00.000Z',
          turn_ref: {
            turn_hash: 'turn_1',
            quote: 'group identity',
            start_char: 17,
            end_char: 31,
          },
        },
      },
    ] as SourcedYOp[];

    const marked = markOpsFromSourceTextDrafts(
      ops,
      { turn_1: draft },
      {
        type: 'human',
        author: 'Local Workspace',
        at: '2026-05-07T00:00:01.000Z',
        surface: 'inline',
      }
    );

    expect(marked[0].source).toMatchObject({
      type: 'human',
      author: 'Local Workspace',
      surface: 'inline',
    });
  });
});
