import { describe, expect, it } from 'vitest';
import {
  EXTRACTION_DRAFT_SCHEMA,
  EXTRACTION_MODES,
  ExtractionDraftSchema,
  TurnTagSchema,
} from '../types';

describe('extractors/v2 types', () => {
  it('locks the canonical extraction draft schema id', () => {
    expect(EXTRACTION_DRAFT_SCHEMA).toBe('t3x/extraction-draft');
  });

  it('only accepts bootstrap and incremental modes', () => {
    expect(EXTRACTION_MODES).toEqual(['bootstrap', 'incremental']);
    expect(TurnTagSchema.safeParse('T1').success).toBe(true);
    expect(TurnTagSchema.safeParse('sha256:abc').success).toBe(false);
  });

  it('uses turn tags rather than raw hashes in draft evidence', () => {
    const result = ExtractionDraftSchema.safeParse({
      schema: EXTRACTION_DRAFT_SCHEMA,
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          candidate: {
            key: 'airport_issue',
            values: {
              summary: 'SEA had a cyberattack',
            },
          },
          evidence: [
            {
              turn_tag: 'T3',
              quote: 'Seattle-Tacoma International Airport (SEA)',
              role: 'primary',
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.items[0].evidence[0].turn_tag).toBe('T3');
    expect(result.data.items[0].evidence[0]).not.toHaveProperty('turn_hash');
  });
});
