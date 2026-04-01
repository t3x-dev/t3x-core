import { describe, it, expect, beforeEach } from 'vitest';
import { useEditingStore } from '@/store/editingStore';

describe('editingStore', () => {
  beforeEach(() => {
    useEditingStore.setState({ editing: null, adding: null });
  });

  it('startEdit sets editing and clears adding', () => {
    useEditingStore.getState().startAdding('node1');
    expect(useEditingStore.getState().adding).toEqual({ nodeId: 'node1' });

    useEditingStore.getState().startEdit('node1', 'budget');
    expect(useEditingStore.getState().editing).toEqual({ nodeId: 'node1', slotKey: 'budget' });
    expect(useEditingStore.getState().adding).toBeNull();
  });

  it('startAdding sets adding and clears editing', () => {
    useEditingStore.getState().startEdit('node1', 'budget');
    expect(useEditingStore.getState().editing).toEqual({ nodeId: 'node1', slotKey: 'budget' });

    useEditingStore.getState().startAdding('node2');
    expect(useEditingStore.getState().adding).toEqual({ nodeId: 'node2' });
    expect(useEditingStore.getState().editing).toBeNull();
  });

  it('stopEdit clears editing', () => {
    useEditingStore.getState().startEdit('node1', 'budget');
    useEditingStore.getState().stopEdit();
    expect(useEditingStore.getState().editing).toBeNull();
  });

  it('stopAdding clears adding', () => {
    useEditingStore.getState().startAdding('node1');
    useEditingStore.getState().stopAdding();
    expect(useEditingStore.getState().adding).toBeNull();
  });
});
