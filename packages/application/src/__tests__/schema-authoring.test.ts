import { describe, expect, it } from 'vitest';
import {
  parseSchemaSourceMappings,
  parseWorkspaceSchemaAuthoringDraft,
  WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA,
  WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
} from '../schema-authoring';

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}`;

function compositionDraft() {
  return {
    schema: WORKSPACE_SCHEMA_AUTHORING_DRAFT_SCHEMA,
    revision: 1,
    base: {
      kind: 'composition',
      compositionId: 'studio:selection',
      compositionRevision: 3,
      compositionHash: digest('a'),
      schemaHash: digest('b'),
    },
    effect: {
      profile: WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
      operations: [
        { assert: { path: 'nodes', type: 'mapping' } },
        { define: { path: 'nodes/advantage' } },
        {
          populate: {
            path: 'nodes/advantage',
            values: {
              required: false,
              slots: { title: { type: 'string' } },
            },
          },
        },
      ],
    },
    resultSchemaHash: digest('c'),
  };
}

describe('Workspace Schema authoring draft contract', () => {
  it('persists exact source locations and rejects duplicate or invalid mapping paths', () => {
    const mapping = {
      path: ['nodes', 'target', 'slots', 'owner'],
      from: ['nodes', 'source', 'slots', 'owner'],
      source: { candidateId: 'pinned', schemaHash: digest('d') },
    };
    const draft = { ...compositionDraft(), sourceMappings: [mapping] };
    expect(parseWorkspaceSchemaAuthoringDraft(draft)).toEqual(draft);
    expect(() => parseSchemaSourceMappings([mapping, mapping])).toThrow('Duplicate');
    expect(() => parseSchemaSourceMappings([{ ...mapping, from: ['nodes', 'source'] }])).toThrow(
      'kinds'
    );
    expect(() =>
      parseSchemaSourceMappings([{ ...mapping, path: ['__proto__', 'polluted'] }])
    ).toThrow('location');
  });
  it('parses a Composition-based draft without changing Composition V2', () => {
    const draft = compositionDraft();
    expect(parseWorkspaceSchemaAuthoringDraft(draft)).toEqual(draft);
  });

  it('accepts an immutable published Schema as the alternative base', () => {
    const draft = compositionDraft();
    const parsed = parseWorkspaceSchemaAuthoringDraft({
      ...draft,
      base: {
        kind: 'published_schema',
        projectId: null,
        artifactVersionId: 'ysv_product_1_0_0',
        canonicalName: 't3x/product',
        version: '1.0.0',
        artifactHash: digest('d'),
        schemaHash: digest('e'),
      },
    });
    expect(parsed.base).toMatchObject({
      kind: 'published_schema',
      canonicalName: 't3x/product',
    });
  });

  it('rejects malformed identity, operations, and hidden extension fields', () => {
    const draft = compositionDraft();
    expect(() =>
      parseWorkspaceSchemaAuthoringDraft({
        ...draft,
        base: { ...draft.base, schemaHash: 'not-a-digest' },
      })
    ).toThrow('must be a sha256 digest');
    expect(() =>
      parseWorkspaceSchemaAuthoringDraft({
        ...draft,
        effect: { ...draft.effect, operations: [{ relate: { from: 'a', to: 'b', type: 'x' } }] },
      })
    ).toThrow();
    expect(() => parseWorkspaceSchemaAuthoringDraft({ ...draft, localSchema: {} })).toThrow(
      'contains unsupported field'
    );
  });

  it('detaches parsed operations from caller-owned mutable input', () => {
    const draft = compositionDraft();
    const parsed = parseWorkspaceSchemaAuthoringDraft(draft);
    (
      draft.effect.operations[2] as { populate: { values: { required: boolean } } }
    ).populate.values.required = true;
    expect(
      (parsed.effect.operations[2] as { populate: { values: { required: boolean } } }).populate
        .values.required
    ).toBe(false);
  });
});
