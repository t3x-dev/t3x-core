import { describe, expect, it } from 'vitest';
import { normalizeEditedScriptOps } from '@/domain/yops/scriptEditNormalization';

describe('normalizeEditedScriptOps', () => {
  it('turns a set op with a deleted value field into unset', () => {
    expect(
      normalizeEditedScriptOps([
        {
          set: {
            path: 'sports/soccer/generational_tradition/description',
          },
        },
      ])
    ).toEqual([
      {
        unset: {
          path: 'sports/soccer/generational_tradition/description',
        },
      },
    ]);
  });

  it('drops empty populate ops left by deleting every value field', () => {
    expect(
      normalizeEditedScriptOps([
        {
          populate: {
            path: 'sports/soccer/generational_tradition',
            values: null,
          },
        },
        {
          set: {
            path: 'sports/soccer/rules',
            value: 'Play fairly',
          },
        },
      ])
    ).toEqual([
      {
        set: {
          path: 'sports/soccer/rules',
          value: 'Play fairly',
        },
      },
    ]);
  });

  it('moves inline populate fields into values for forgiving add-field edits', () => {
    expect(
      normalizeEditedScriptOps([
        {
          populate: {
            path: 'sports/soccer/generational_tradition',
            values: {
              description: 'Fans inherit teams from family',
            },
            ritual: 'Watching matches together',
          },
        },
      ])
    ).toEqual([
      {
        populate: {
          path: 'sports/soccer/generational_tradition',
          values: {
            description: 'Fans inherit teams from family',
            ritual: 'Watching matches together',
          },
        },
      },
    ]);
  });

  it('preserves source metadata when normalizing human edits', () => {
    const source = {
      type: 'human' as const,
      author: 'Local Workspace',
      at: '2026-05-06T00:00:00.000Z',
      surface: 'script' as const,
    };

    expect(
      normalizeEditedScriptOps([
        {
          set: {
            path: 'sports/soccer/scope',
          },
          source,
        },
      ])
    ).toEqual([
      {
        unset: {
          path: 'sports/soccer/scope',
        },
        source,
      },
    ]);
  });
});
