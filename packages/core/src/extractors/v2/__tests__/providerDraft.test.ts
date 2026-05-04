import { describe, expect, it } from 'vitest';
import {
  liftProviderDraftToExtractionDraft,
  normalizeLooseProviderDraft,
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
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'trip_duration_days',
            path_hint: 'trip.duration_days',
            slot: null,
            value_json: '5',
            values_json: null,
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: '5 days', role: 'primary' }],
        },
        {
          id: 'item_array',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'must_visit_pois',
            path_hint: 'trip.preferences.must_visit_pois',
            slot: null,
            value_json: '["West Lake","Lingyin Temple"]',
            values_json: null,
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'West Lake and Lingyin Temple', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.value).toBe(5);
    expect(lifted.draft.items[1]?.candidate.value).toEqual(['West Lake', 'Lingyin Temple']);
  });

  it('repairs value_json emitted as a plain unquoted string into a string literal', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'victory',
            path_hint: 'victory',
            slot: 'objective',
            // Nano emits this unquoted — would normally fail JSON.parse.
            value_json: 'destroy_enemy_core/base',
            values_json: null,
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'destroy the enemy core', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.value).toBe('destroy_enemy_core/base');
  });

  it('does not repair value_json when the raw content looks like attempted JSON', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'victory',
            path_hint: 'victory',
            slot: 'objective',
            // Starts with `{` — looks like an attempted JSON object; do not repair.
            value_json: '{malformed',
            values_json: null,
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'objective', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(false);
    if (lifted.ok) return;
    expect(lifted.failure.code).toBe('draft_parse');
    expect(lifted.failure.message).toContain('value_json');
  });

  it('does not repair values_json when malformed (shape too strict to guess)', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'victory',
            path_hint: 'victory',
            slot: null,
            value_json: null,
            values_json: 'not-json',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'objective', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(false);
    if (lifted.ok) return;
    expect(lifted.failure.code).toBe('draft_parse');
    expect(lifted.failure.message).toContain('values_json');
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

  it('wraps string children as { key } when children_json is an array of strings', () => {
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
            key: 'tea_villages',
            path_hint: 'tea_villages',
            slot: null,
            value_json: null,
            values_json: null,
            // Claude sometimes emits children_json as an array of raw strings.
            children_json: '["Meijiawu","Longjing","Baochu"]',
          },
          evidence: [{ turn_tag: 'T1', quote: 'tea villages', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.children).toEqual([
      { key: 'Meijiawu' },
      { key: 'Longjing' },
      { key: 'Baochu' },
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

describe('normalizeLooseProviderDraft (F6)', () => {
  it('coerces loose Claude-style draft into a valid ProviderExtractionDraft', () => {
    // Shape taken directly from a claude-sonnet-4-6 dump on trip-planning.
    const loose = {
      schema: 'ProviderExtractionDraft',
      version: '1.0',
      mode: 'bootstrap',
      items: [
        {
          id: 'dest_hangzhou',
          type: 'destination',
          label: 'Hangzhou',
          candidate: { value_json: '"Hangzhou"' },
          evidence: [{ turn_tag: 'T1', quote: '5-day trip to Hangzhou', role: 'primary' }],
          children_json: '[]',
        },
      ],
    };

    const normalized = normalizeLooseProviderDraft(loose);
    const parsed = ProviderExtractionDraftSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.schema).toBe('t3x/provider-extraction-draft');
    expect(parsed.data.version).toBe(1);
    expect(parsed.data.items[0]).toMatchObject({
      id: 'dest_hangzhou',
      intent: 'add',
      reasoning_type: 'direct',
      candidate: {
        key: null,
        path_hint: null,
        slot: null,
        value_json: '"Hangzhou"',
        values_json: null,
        children_json: '[]', // lifted from item level
      },
    });
    expect(parsed.data.items[0]?.confidence).toBeCloseTo(0.8);
  });

  it('lifts candidate.name to candidate.key when drifted', () => {
    const loose = {
      items: [
        {
          candidate: { name: 'trip_overview', kind: 'object' },
          evidence: [{ turn_tag: 'T1', quote: 'overview', role: 'primary' }],
        },
      ],
    };

    const normalized = normalizeLooseProviderDraft(loose);
    const parsed = ProviderExtractionDraftSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items[0]?.candidate.key).toBe('trip_overview');
  });

  it('pulls item-level children_json into candidate.children_json when absent', () => {
    const loose = {
      items: [
        {
          candidate: { name: 'trip' },
          evidence: [{ turn_tag: 'T1', quote: 'x', role: 'primary' }],
          children_json: '[{"key":"day1"}]',
        },
      ],
    };
    const normalized = normalizeLooseProviderDraft(loose);
    const parsed = ProviderExtractionDraftSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items[0]?.candidate.children_json).toBe('[{"key":"day1"}]');
  });

  it('synthesizes missing ids as item_<index+1>', () => {
    const loose = {
      items: [
        {
          candidate: { name: 'a' },
          evidence: [{ turn_tag: 'T1', quote: 'x', role: 'primary' }],
        },
        {
          candidate: { name: 'b' },
          evidence: [{ turn_tag: 'T1', quote: 'y', role: 'primary' }],
        },
      ],
    };
    const normalized = normalizeLooseProviderDraft(loose);
    const parsed = ProviderExtractionDraftSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items[0]?.id).toBe('item_1');
    expect(parsed.data.items[1]?.id).toBe('item_2');
  });

  it('defaults invalid intent/reasoning_type without losing data', () => {
    const loose = {
      items: [
        {
          candidate: { key: 'x' },
          intent: 'classify', // invalid
          reasoning_type: 'hallucinate', // invalid
          evidence: [{ turn_tag: 'T1', quote: 'x', role: 'primary' }],
        },
      ],
    };
    const normalized = normalizeLooseProviderDraft(loose);
    const parsed = ProviderExtractionDraftSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items[0]?.intent).toBe('add');
    expect(parsed.data.items[0]?.reasoning_type).toBe('direct');
  });

  it('returns raw value unchanged for non-object input (safe pass-through)', () => {
    expect(normalizeLooseProviderDraft(null)).toBeNull();
    expect(normalizeLooseProviderDraft('string')).toBe('string');
    expect(normalizeLooseProviderDraft([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('F11 lift-step tolerance', () => {
  it('promotes an array payload in values_json to the value slot', () => {
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
            key: 'heroes',
            path_hint: 'heroes',
            slot: null,
            value_json: null,
            // Array-shaped — the canonical schema rejects this in `values`.
            values_json: '["arthas","jaina","thrall"]',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'heroes list', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.value).toEqual(['arthas', 'jaina', 'thrall']);
    expect(lifted.draft.items[0]?.candidate.values).toBeUndefined();
  });

  it('promotes a scalar in values_json to the value slot', () => {
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
            key: 'title',
            path_hint: 'title',
            slot: null,
            value_json: null,
            values_json: '"Heroes of the Storm"',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'the game', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.value).toBe('Heroes of the Storm');
    expect(lifted.draft.items[0]?.candidate.values).toBeUndefined();
  });

  it('preserves a valid object in values_json (no promotion)', () => {
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
            key: 'hero',
            path_hint: 'hero',
            slot: null,
            value_json: null,
            values_json: '{"name":"Arthas","role":"warrior"}',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'arthas', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.values).toEqual({
      name: 'Arthas',
      role: 'warrior',
    });
    expect(lifted.draft.items[0]?.candidate.value).toBeUndefined();
  });

  it('does not clobber a pre-existing value when values_json is also an array', () => {
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
            key: 'thing',
            path_hint: 'thing',
            slot: null,
            value_json: '"primary_value"',
            values_json: '["extra1","extra2"]',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'thing', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    // value already had content; values (array) is dropped to satisfy schema.
    expect(lifted.draft.items[0]?.candidate.value).toBe('primary_value');
    expect(lifted.draft.items[0]?.candidate.values).toBeUndefined();
  });

  it('synthesizes a child key from a value when the model omitted key and name', () => {
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
            key: 'team',
            path_hint: 'team',
            slot: null,
            value_json: null,
            values_json: null,
            // Children have values but no key/name.
            children_json: '[{"title":"Arthas","role":"warrior"},{"title":"Jaina","role":"mage"}]',
          },
          evidence: [{ turn_tag: 'T1', quote: 'team', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.children).toEqual([
      { key: 'Arthas', values: { title: 'Arthas', role: 'warrior' } },
      { key: 'Jaina', values: { title: 'Jaina', role: 'mage' } },
    ]);
  });
});

describe('F12 inner _json repair', () => {
  it('repairs a truncated children_json payload via closeUnbalancedBrackets', () => {
    // Real-world: observed from gpt-5.4 × trip-planning where the model
    // ran out of output tokens mid-children_json string.
    const truncated = '[{"key":"Wulin Square","values":{"metro":"Lines 1 and 2"';
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'stay',
            path_hint: 'stay',
            slot: null,
            value_json: null,
            values_json: null,
            children_json: truncated,
          },
          evidence: [{ turn_tag: 'T1', quote: 'Wulin Square', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.children).toEqual([
      { key: 'Wulin Square', values: { metro: 'Lines 1 and 2' } },
    ]);
  });

  it('repairs a values_json payload with trailing commas', () => {
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_1',
          intent: 'add',
          confidence: 0.8,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'hero',
            path_hint: 'hero',
            slot: null,
            value_json: null,
            values_json: '{"name":"Arthas","role":"warrior",}',
            children_json: null,
          },
          evidence: [{ turn_tag: 'T1', quote: 'Arthas', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.draft.items[0]?.candidate.values).toEqual({
      name: 'Arthas',
      role: 'warrior',
    });
  });

  it('lifts the prompt example children_json shape into populated child values', () => {
    // Pin the prompt example shape end-to-end. The system prompt shows
    // children_json as a stringified array of {key, values} entries —
    // child `values` is a RAW object inside the JSON-string, NOT a
    // nested values_json string. canonicalizeChildShape only recognises
    // the {key, values} shape; if a future prompt edit drifts back to
    // {key, values_json: "..."}, the loop in canonicalizeChildShape
    // would fold values_json into a literal slot named "values_json"
    // (with the JSON-string as its value), and the compiler would then
    // populate that nonsense slot instead of the intended `resolution`.
    //
    // This regression locks the prompt example to a shape the
    // normalizer actually understands.
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_cameras',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'cameras',
            path_hint: null,
            slot: null,
            value_json: null,
            values_json: null,
            // Verbatim copy of the prompt example shape.
            children_json: '[{"key":"a7r_v","values":{"resolution":"61 MP"}}]',
          },
          evidence: [{ turn_tag: 'T1', quote: '61 MP', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    const candidate = lifted.draft.items[0]?.candidate;
    expect(candidate?.children).toEqual([{ key: 'a7r_v', values: { resolution: '61 MP' } }]);
    // Defense: the intended slot is `resolution`, NOT a literal
    // `values_json`. If this ever flips, the prompt example has
    // drifted away from the canonicalizeChildShape contract.
    expect(candidate?.children?.[0]?.values).not.toHaveProperty('values_json');
  });

  it('rejects child {key, values_json: "..."} shape — folds into a literal slot, exposing prompt drift', () => {
    // Inverse of the regression above: confirm that the rejected shape
    // genuinely produces wrong output. If a future change makes
    // canonicalizeChildShape also accept nested values_json, this test
    // will need updating — but it shouldn't pass silently.
    const lifted = liftProviderDraftToExtractionDraft({
      schema: 't3x/provider-extraction-draft',
      version: 1,
      mode: 'bootstrap',
      items: [
        {
          id: 'item_cameras',
          intent: 'add',
          confidence: 0.9,
          reasoning_type: 'direct',
          target_ref: { node_key: null, path: null, existing_node_id: null },
          candidate: {
            key: 'cameras',
            path_hint: null,
            slot: null,
            value_json: null,
            values_json: null,
            // The rejected shape — what the OLD prompt example would
            // have produced.
            children_json: '[{"key":"a7r_v","values_json":"{\\"resolution\\":\\"61 MP\\"}"}]',
          },
          evidence: [{ turn_tag: 'T1', quote: '61 MP', role: 'primary' }],
        },
      ],
      warnings: [],
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    const child = lifted.draft.items[0]?.candidate.children?.[0];
    // Wrong output — values_json got folded into a literal slot. This
    // is exactly the failure mode the prompt example was leading the
    // model into. The test exists so a regression in either direction
    // (prompt drift OR normalizer change) is loud.
    expect(child?.values).toHaveProperty('values_json');
    expect(child?.values).not.toHaveProperty('resolution');
  });

  describe('canonicalize multi-value scalars (plan: canonicalize-proposed-yops)', () => {
    it('lifts a comma-separated value_json into a YAML sequence', () => {
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
              key: 'primary_use_case',
              path_hint: 'cameras/sony/full_frame/r_series/primary_use_case',
              slot: null,
              // Model emitted a comma-string. Canonical shape is an array.
              value_json: '"landscape, studio, fashion, commercial"',
              values_json: null,
              children_json: null,
            },
            evidence: [{ turn_tag: 'T1', quote: 'landscape, studio', role: 'primary' }],
          },
        ],
        warnings: [],
      });

      expect(lifted.ok).toBe(true);
      if (!lifted.ok) return;
      expect(lifted.draft.items[0]?.candidate.value).toEqual([
        'landscape',
        'studio',
        'fashion',
        'commercial',
      ]);
    });

    it('canonicalizes per-key inside values_json', () => {
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
              key: 'r_series',
              path_hint: 'cameras/sony/full_frame/r_series',
              slot: null,
              value_json: null,
              values_json:
                '{"primary_use_case":"landscape, studio, fashion","resolution":"61 megapixels"}',
              children_json: null,
            },
            evidence: [{ turn_tag: 'T1', quote: 'landscape', role: 'primary' }],
          },
        ],
        warnings: [],
      });

      expect(lifted.ok).toBe(true);
      if (!lifted.ok) return;
      expect(lifted.draft.items[0]?.candidate.values).toEqual({
        primary_use_case: ['landscape', 'studio', 'fashion'],
        resolution: '61 megapixels',
      });
    });

    it('canonicalizes per-key inside child values from children_json', () => {
      // Compiler emits child.values straight into `populate.values`, so the
      // child path needs the same gate as the parent. Without it, an LLM
      // response that nests slot values inside children would slip the
      // canonicalization invariant.
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
              key: 'cameras',
              path_hint: 'cameras/sony/full_frame',
              slot: null,
              value_json: null,
              values_json: null,
              children_json:
                '[{"key":"r_series","values":{"primary_use_case":"landscape, studio, fashion","resolution":"61 megapixels"}}]',
            },
            evidence: [{ turn_tag: 'T1', quote: 'r_series', role: 'primary' }],
          },
        ],
        warnings: [],
      });

      expect(lifted.ok).toBe(true);
      if (!lifted.ok) return;
      const child = lifted.draft.items[0]?.candidate.children?.[0];
      expect(child?.key).toBe('r_series');
      expect(child?.values).toEqual({
        primary_use_case: ['landscape', 'studio', 'fashion'],
        resolution: '61 megapixels',
      });
    });

    it('leaves prose strings with commas as scalar', () => {
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
              key: 'note',
              path_hint: 'cameras/sony/full_frame/r_series/note',
              slot: null,
              value_json: '"Released in 2022, with improved thermal management"',
              values_json: null,
              children_json: null,
            },
            evidence: [{ turn_tag: 'T1', quote: 'thermal', role: 'primary' }],
          },
        ],
        warnings: [],
      });

      expect(lifted.ok).toBe(true);
      if (!lifted.ok) return;
      expect(lifted.draft.items[0]?.candidate.value).toBe(
        'Released in 2022, with improved thermal management'
      );
    });
  });
});
