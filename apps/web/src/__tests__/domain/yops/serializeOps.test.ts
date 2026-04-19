import { describe, expect, it } from 'vitest';
import { serializeOpsToYaml } from '@/domain/yops/serializeOps';

describe('serializeOpsToYaml', () => {
  it('serializes an empty op list to explicit empty yops', () => {
    expect(serializeOpsToYaml([])).toBe('yops: []\n');
  });

  it('omits source metadata from serialized ops', () => {
    const yaml = serializeOpsToYaml([
      {
        set: { path: 'topic/model', value: 'gpt-5.4-nano' },
        source: {
          type: 'human',
          author: 'ethan',
          at: '2026-04-19T08:00:00Z',
        },
      },
    ] as const);

    expect(yaml).toContain('yops:');
    expect(yaml).toContain('set:');
    expect(yaml).toContain('topic/model');
    expect(yaml).not.toContain('source:');
  });
});
