import { describe, expect, it } from 'vitest';
import {
  resolveWorkspaceSchemaBindingMode,
  WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
} from '../schema-authoring';

const localEffect = {
  profile: WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
  operations: [{ set: { path: 'nodes/advantage', value: { required: false } } }],
} as const;

describe('Workspace Schema binding policy', () => {
  it('pins only an unchanged published Schema release', () => {
    expect(resolveWorkspaceSchemaBindingMode({ source: 'published_schema' })).toBe('pinned');
    expect(
      resolveWorkspaceSchemaBindingMode({
        source: 'published_schema',
        localEffect: {
          profile: WORKSPACE_SCHEMA_AUTHORING_EFFECT_PROFILE,
          operations: [],
        },
      })
    ).toBe('pinned');
    expect(resolveWorkspaceSchemaBindingMode({ source: 'published_schema', localEffect })).toBe(
      'draft_override'
    );
  });

  it('keeps Composition and Workspace-owned definitions as draft overrides', () => {
    expect(resolveWorkspaceSchemaBindingMode({ source: 'composition' })).toBe('draft_override');
    expect(resolveWorkspaceSchemaBindingMode({ source: 'composition', localEffect })).toBe(
      'draft_override'
    );
    expect(resolveWorkspaceSchemaBindingMode({ source: 'workspace_schema' })).toBe(
      'draft_override'
    );
  });
});
