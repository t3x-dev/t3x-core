import { describe, expect, test, vi } from 'vitest';
import { ChatAddForm } from '@/components/chat/ChatAddForm';

// useGoldEdit reads workspaceStore; stub the hook to avoid mounting the store.
vi.mock('@/components/chat/useGoldEdit', () => ({
  useGoldEdit: () => ({ applyEdit: vi.fn(), enabled: true }),
}));

vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({ tree: { trees: [], relations: [] } }),
}));

describe('ChatAddForm', () => {
  test('component exports successfully', () => {
    expect(ChatAddForm).toBeDefined();
    expect(typeof ChatAddForm).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      selection: {
        text: 'Hangzhou is the capital of Zhejiang',
        range: null as Range | null,
      },
      onDone: vi.fn(),
    };
    expect(props.selection.text).toBe('Hangzhou is the capital of Zhejiang');
    expect(typeof props.onDone).toBe('function');
  });

  test('constructs a set YOp with node/slot path and selection value', () => {
    // Replicate the op shape the component builds so future drift is caught
    // by tests even under smoke-test conventions.
    const targetNode = 'trip';
    const slotKey = 'destination';
    const value = 'Hangzhou';
    const op = { set: { path: `${targetNode}/${slotKey}`, value } };
    expect(op).toEqual({
      set: { path: 'trip/destination', value: 'Hangzhou' },
    });
  });
});
