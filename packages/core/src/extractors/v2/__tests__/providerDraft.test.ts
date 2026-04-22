import { describe, expect, it } from 'vitest';
import {
  liftProviderDraftToExtractionDraft,
  ProviderExtractionDraftSchema,
} from '../providerDraft';

describe('extractors/v2 provider draft', () => {
  it('lifts a valid provider draft into the canonical extraction draft', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: {
            node_key: null,
            path: null,
            existing_node_id: null,
          },
          candidate: {
            key: 'airport_issue',
            path_hint: 'airport_issue',
            slot: null,
            value_json: null,
            values_json: '{"summary":"SEA had a cyberattack"}',
            children_json: null,
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: 'Seattle-Tacoma International Airport (SEA)',
              role: 'primary',
            },
          ],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;

    expect(lifted.draft).toMatchObject({
      schema: 't3x/extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          candidate: {
            key: 'airport_issue',
            path_hint: 'airport_issue',
            values: {
              summary: 'SEA had a cyberattack',
            },
          },
        },
      ],
    });
  });

  it('lifts bare value_json into candidate.value for scalar and array payloads', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_scalar',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: {
            node_key: null,
            path: null,
            existing_node_id: null,
          },
          candidate: {
            key: 'trip_duration_days',
            path_hint: 'trip.duration_days',
            slot: null,
            value_json: '5',
            values_json: null,
            children_json: null,
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: '5 days',
              role: 'primary',
            },
          ],
        },
        {
          id: 'item_array',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: {
            node_key: null,
            path: null,
            existing_node_id: null,
          },
          candidate: {
            key: 'must_visit_pois',
            path_hint: 'trip.preferences.must_visit_pois',
            slot: null,
            value_json: '["West Lake","Lingyin Temple"]',
            values_json: null,
            children_json: null,
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: 'West Lake and Lingyin Temple',
              role: 'primary',
            },
          ],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;

    expect(lifted.draft.items[0]?.candidate.value).toBe(5);
    expect(lifted.draft.items[1]?.candidate.value).toEqual(['West Lake', 'Lingyin Temple']);
  });

  it('returns a typed parse failure when provider JSON fields are invalid', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: {
            node_key: null,
            path: null,
            existing_node_id: null,
          },
          candidate: {
            key: 'airport_issue',
            path_hint: 'airport_issue',
            slot: null,
            value_json: null,
            values_json: '{"summary"',
            children_json: null,
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: 'Seattle-Tacoma International Airport (SEA)',
              role: 'primary',
            },
          ],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(false);
    if (lifted.ok) return;

    expect(lifted.failure.code).toBe('draft_parse');
    expect(lifted.failure.message).toContain('values_json');
  });

  it('uses a non-recursive provider schema that exposes JSON string fields', () => {
    const candidate = ProviderExtractionDraftSchema.shape.items.element.shape.candidate;

    expect(candidate.shape.value_json.safeParse('{"ok":true}').success).toBe(true);
    expect(candidate.shape.values_json.safeParse('{"summary":"ok"}').success).toBe(true);
    expect(candidate.shape.children_json.safeParse('[{"key":"child"}]').success).toBe(true);
  });

  it('coerces a singleton children_json object into a canonical child array', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: {
            node_key: null,
            path: null,
            existing_node_id: null,
          },
          candidate: {
            key: 'airport_issue',
            path_hint: 'airport_issue',
            slot: null,
            value_json: null,
            values_json: '{"summary":"SEA had a cyberattack"}',
            children_json:
              '{"key":"Baggage Handling","values":{"description":"Automated baggage systems were disrupted"}}',
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: 'Baggage Handling: The automated baggage systems were disrupted.',
              role: 'primary',
            },
          ],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;

    expect(lifted.draft.items[0]?.candidate.children).toEqual([
      {
        key: 'Baggage Handling',
        values: { description: 'Automated baggage systems were disrupted' },
      },
    ]);
  });
});
