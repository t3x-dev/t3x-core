import type { SourcedYOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';

describe('serializeOpsToYaml', () => {
  it('renders human-source comments while keeping source metadata out of YAML', () => {
    const yaml = serializeOpsToYaml([
      {
        set: { path: 'trip/dest', value: 'HZ' },
        source: {
          type: 'human',
          author: 'alice',
          at: '2026-05-06T00:00:00.000Z',
          surface: 'script',
        },
      },
    ] as SourcedYOp[]);

    expect(yaml).toContain('# Human edit via YOps: manual change by alice');
    expect(yaml).toContain('path: trip/dest');
    expect(yaml).not.toContain('source:');
  });

  it('renders LLM-source comments while keeping source metadata out of YAML', () => {
    const yaml = serializeOpsToYaml([
      {
        set: { path: 'trip/dest', value: 'HZ' },
        source: {
          type: 'llm',
          model: 'gpt-4o-mini',
          at: '2026-05-06T00:00:00.000Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
        },
      },
    ] as SourcedYOp[]);

    expect(yaml).toContain('# LLM extract via gpt-4o-mini: extracted from source text');
    expect(yaml).toContain('path: trip/dest');
    expect(yaml).not.toContain('source:');
  });
});
