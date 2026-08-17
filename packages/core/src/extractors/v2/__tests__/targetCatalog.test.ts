import type { YSchema } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../../semantic/types';
import { buildExtractionTargetCatalog } from '../targetCatalog';

const schema: YSchema = {
  yschema: '0.1',
  name: 'prd-source-chat',
  nodes: {
    prd: {
      slots: {
        summary: {
          type: 'string',
          enum: ['Audit trail', 'Decision log'],
          description: 'Proposal summary',
          contentGuidance: 'Use accepted source material only.',
          provenanceRequired: true,
        },
      },
    },
  },
};

const snapshot: SemanticContent = {
  trees: [{ key: 'prd', slots: { summary: 'Existing summary' }, children: [] }],
  relations: [],
};

describe('buildExtractionTargetCatalog', () => {
  it('merges YSchema target metadata with current state targets', () => {
    const result = buildExtractionTargetCatalog({ snapshot, yschema: schema });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.catalog.targets).toEqual([
      expect.objectContaining({
        target_id: 'T001',
        parent_path: 'prd',
        slot: 'summary',
        value_type: 'string',
        enum: ['Audit trail', 'Decision log'],
        current_value: 'Existing summary',
        description: 'Proposal summary',
        content_guidance: 'Use accepted source material only.',
        provenanceRequired: true,
        source: 'current_state',
      }),
    ]);
    expect(result.catalog.digest).toMatch(/^sha256:/);
  });
});
