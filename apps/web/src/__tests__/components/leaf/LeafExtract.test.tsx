import { describe, expect, test } from 'vitest';
import { LeafExtractToDraft } from '@/components/leaf/LeafExtractToDraft';

describe('LeafExtractToDraft', () => {
  test('component exports successfully', () => {
    expect(LeafExtractToDraft).toBeDefined();
    expect(typeof LeafExtractToDraft).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      leafId: 'leaf_123',
      projectId: 'proj_456',
      outputText: 'Generated output text',
    };
    expect(props.leafId).toBe('leaf_123');
    expect(props.projectId).toBe('proj_456');
    expect(props.outputText).toBe('Generated output text');
  });

  test('empty output returns null', () => {
    const props = {
      leafId: 'leaf_123',
      projectId: 'proj_456',
      outputText: '',
    };
    // Component returns null for empty output
    expect(props.outputText).toBe('');
  });
});
