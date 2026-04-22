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

  it('canonicalizes children with {name,type} shape emitted by some providers', () => {
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
            key: 'heroes',
            path_hint: 'heroes',
            slot: null,
            value_json: null,
            values_json: null,
            children_json: '[{"name":"Arthas","type":"warrior"},{"name":"Jaina","type":"mage"}]',
          },
          evidence: [
            {
              turn_tag: 'T1',
              quote: 'Heroes like Arthas and Jaina',
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
      { key: 'Arthas', values: { type: 'warrior' } },
      { key: 'Jaina', values: { type: 'mage' } },
    ]);
  });

  it('folds unknown scalar fields into values while preserving existing values', () => {
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
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'maps',
            path_hint: 'maps',
            slot: null,
            value_json: null,
            values_json: null,
            children_json: '[{"key":"Cursed Hollow","values":{"role":"objective"},"type":"map"}]',
          },
          evidence: [
            { turn_tag: 'T1', quote: 'Cursed Hollow is an objective map', role: 'primary' },
          ],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.children).toEqual([
      { key: 'Cursed Hollow', values: { role: 'objective', type: 'map' } },
    ]);
  });

  it('drops nested children on child shapes since canonical schema is flat', () => {
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
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'game',
            path_hint: 'game',
            slot: null,
            value_json: null,
            values_json: null,
            children_json: '[{"name":"modes","children":[{"name":"ranked"},{"name":"quick"}]}]',
          },
          evidence: [{ turn_tag: 'T1', quote: 'game modes', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.children).toEqual([{ key: 'modes' }]);
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
