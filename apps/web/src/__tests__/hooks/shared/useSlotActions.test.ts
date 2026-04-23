// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyEditMock = vi.fn();

vi.mock('@/hooks/shared/useGoldEdit', () => ({
  useGoldEdit: () => ({ applyEdit: applyEditMock, enabled: true }),
}));

import { useSlotActions } from '@/hooks/shared/useSlotActions';

describe('useSlotActions', () => {
  beforeEach(() => {
    applyEditMock.mockReset();
    applyEditMock.mockResolvedValue(undefined);
  });

  it('updateSlot emits a set op on the node/slot path', async () => {
    const { result } = renderHook(() => useSlotActions());
    await act(async () => {
      await result.current.updateSlot('trip', 'destination', 'Suzhou');
    });
    expect(applyEditMock).toHaveBeenCalledWith({
      set: { path: 'trip/destination', value: 'Suzhou' },
    });
  });

  it('deleteSlot emits an unset op on the node/slot path', async () => {
    const { result } = renderHook(() => useSlotActions());
    await act(async () => {
      await result.current.deleteSlot('trip', 'month');
    });
    expect(applyEditMock).toHaveBeenCalledWith({
      unset: { path: 'trip/month' },
    });
  });

  it('deleteNode emits a drop op on the node path', async () => {
    const { result } = renderHook(() => useSlotActions());
    await act(async () => {
      await result.current.deleteNode('trip');
    });
    expect(applyEditMock).toHaveBeenCalledWith({ drop: { path: 'trip' } });
  });

  it('addSlot emits a set op on the node/key path', async () => {
    const { result } = renderHook(() => useSlotActions());
    await act(async () => {
      await result.current.addSlot('trip', 'hotel_style', 'boutique');
    });
    expect(applyEditMock).toHaveBeenCalledWith({
      set: { path: 'trip/hotel_style', value: 'boutique' },
    });
  });
});
