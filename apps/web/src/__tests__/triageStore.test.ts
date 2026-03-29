import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TriageItem } from '@/store/triageStore';
import { useTriageStore } from '@/store/triageStore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userItem: TriageItem = {
  id: 'japan_trip',
  source: 'user',
  slots: { destination: 'Tokyo', duration: '2 weeks' },
  preview: 'Japan trip planning',
};

const llmItem: TriageItem = {
  id: 'budget_prefs',
  source: 'llm',
  slots: { range: '$3000-5000', currency: 'USD' },
  preview: 'Budget preferences',
};

const bothItem: TriageItem = {
  id: 'travel_style',
  source: 'both',
  slots: { pace: 'relaxed', focus: 'culture' },
  preview: 'Travel style preferences',
};

const allItems: TriageItem[] = [userItem, llmItem, bothItem];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  useTriageStore.getState().reset();
});

afterEach(() => {
  useTriageStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('triageStore', () => {
  // 1. loadItems auto-accepts USER and BOTH, leaves LLM as pending
  describe('loadItems', () => {
    it('auto-accepts user and both items, leaves llm as pending', () => {
      useTriageStore.getState().loadItems(allItems);
      const { items, decisions } = useTriageStore.getState();

      expect(items).toHaveLength(3);
      expect(decisions[userItem.id]).toBe('accepted');
      expect(decisions[bothItem.id]).toBe('accepted');
      expect(decisions[llmItem.id]).toBe('pending');
    });

    it('initializes slot toggles to all-on for every item', () => {
      useTriageStore.getState().loadItems(allItems);
      const { slotToggles } = useTriageStore.getState();

      // Every slot should default to true (on)
      expect(slotToggles[userItem.id]).toEqual({ destination: true, duration: true });
      expect(slotToggles[llmItem.id]).toEqual({ range: true, currency: true });
      expect(slotToggles[bothItem.id]).toEqual({ pace: true, focus: true });
    });

    it('clears previous state on re-load', () => {
      useTriageStore.getState().loadItems([userItem]);
      useTriageStore.getState().addManualSlot('japan_trip', 'hotel', 'Ritz');

      // Re-load with different items
      useTriageStore.getState().loadItems([llmItem]);
      const { items, decisions, manualAdditions } = useTriageStore.getState();

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('budget_prefs');
      expect(decisions).not.toHaveProperty('japan_trip');
      expect(manualAdditions).toHaveLength(0);
    });
  });

  // 2. acceptItem / dismissItem toggle decisions
  describe('acceptItem / dismissItem', () => {
    it('acceptItem sets decision to accepted', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().acceptItem(llmItem.id);
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('accepted');
    });

    it('dismissItem sets decision to dismissed', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().dismissItem(llmItem.id);
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('dismissed');
    });

    it('can change an accepted item to dismissed', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().acceptItem(llmItem.id);
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('accepted');

      useTriageStore.getState().dismissItem(llmItem.id);
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('dismissed');
    });

    it('can change a dismissed item to accepted', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().dismissItem(llmItem.id);
      useTriageStore.getState().acceptItem(llmItem.id);
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('accepted');
    });
  });

  // 3. toggleSlot on/off
  describe('toggleSlot', () => {
    it('toggles a slot off', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);
      expect(useTriageStore.getState().slotToggles[userItem.id].destination).toBe(false);
      expect(useTriageStore.getState().slotToggles[userItem.id].duration).toBe(true);
    });

    it('toggles a slot back on', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', true);
      expect(useTriageStore.getState().slotToggles[userItem.id].destination).toBe(true);
    });
  });

  // 4. acceptAll sets all pending to accepted
  describe('acceptAll', () => {
    it('sets all pending items to accepted', () => {
      useTriageStore.getState().loadItems(allItems);
      // llmItem is pending, others already accepted
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('pending');

      useTriageStore.getState().acceptAll();
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('accepted');
    });

    it('does not change dismissed items', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().dismissItem(llmItem.id);

      useTriageStore.getState().acceptAll();
      expect(useTriageStore.getState().decisions[llmItem.id]).toBe('dismissed');
    });
  });

  // 5. getAcceptedContent filters by decisions and slot toggles, merges manual additions
  describe('getAcceptedContent', () => {
    it('returns only accepted items', () => {
      useTriageStore.getState().loadItems(allItems);
      // userItem=accepted, bothItem=accepted, llmItem=pending
      const result = useTriageStore.getState().getAcceptedContent();
      const ids = result.map((r) => r.id);
      expect(ids).toContain(userItem.id);
      expect(ids).toContain(bothItem.id);
      expect(ids).not.toContain(llmItem.id);
    });

    it('excludes toggled-off slots', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);

      const result = useTriageStore.getState().getAcceptedContent();
      const japanTrip = result.find((r) => r.id === userItem.id);
      expect(japanTrip).toBeDefined();
      expect(japanTrip!.slots).toEqual({ duration: '2 weeks' });
      expect(japanTrip!.slots).not.toHaveProperty('destination');
    });

    it('merges manual additions into accepted items', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().addManualSlot(userItem.id, 'hotel', 'Ritz');

      const result = useTriageStore.getState().getAcceptedContent();
      const japanTrip = result.find((r) => r.id === userItem.id);
      expect(japanTrip!.slots).toEqual({
        destination: 'Tokyo',
        duration: '2 weeks',
        hotel: 'Ritz',
      });
    });

    it('does not merge manual additions into non-accepted items', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().addManualSlot(llmItem.id, 'notes', 'check later');

      const result = useTriageStore.getState().getAcceptedContent();
      const budgetItem = result.find((r) => r.id === llmItem.id);
      expect(budgetItem).toBeUndefined();
    });

    it('returns empty array when nothing is accepted', () => {
      useTriageStore.getState().loadItems([llmItem]);
      const result = useTriageStore.getState().getAcceptedContent();
      expect(result).toEqual([]);
    });

    it('omits item entirely if all slots are toggled off and no manual additions', () => {
      useTriageStore.getState().loadItems([userItem]);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);
      useTriageStore.getState().toggleSlot(userItem.id, 'duration', false);

      const result = useTriageStore.getState().getAcceptedContent();
      expect(result).toEqual([]);
    });

    it('includes item with only manual slots when all original slots toggled off', () => {
      useTriageStore.getState().loadItems([userItem]);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);
      useTriageStore.getState().toggleSlot(userItem.id, 'duration', false);
      useTriageStore.getState().addManualSlot(userItem.id, 'hotel', 'Ritz');

      const result = useTriageStore.getState().getAcceptedContent();
      expect(result).toHaveLength(1);
      expect(result[0].slots).toEqual({ hotel: 'Ritz' });
    });
  });

  // 6. addManualSlot tracks additions and they appear in getAcceptedContent
  describe('addManualSlot', () => {
    it('tracks manual additions', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().addManualSlot('japan_trip', 'hotel', 'Ritz');
      useTriageStore.getState().addManualSlot('japan_trip', 'airline', 'ANA');

      const { manualAdditions } = useTriageStore.getState();
      expect(manualAdditions).toHaveLength(2);
      expect(manualAdditions[0]).toEqual({ targetId: 'japan_trip', key: 'hotel', value: 'Ritz' });
      expect(manualAdditions[1]).toEqual({ targetId: 'japan_trip', key: 'airline', value: 'ANA' });
    });

    it('multiple manual additions for same key uses last value in getAcceptedContent', () => {
      useTriageStore.getState().loadItems([userItem]);
      useTriageStore.getState().addManualSlot('japan_trip', 'hotel', 'Ritz');
      useTriageStore.getState().addManualSlot('japan_trip', 'hotel', 'Hilton');

      const result = useTriageStore.getState().getAcceptedContent();
      const japanTrip = result.find((r) => r.id === userItem.id);
      expect(japanTrip!.slots.hotel).toBe('Hilton');
    });
  });

  // 7. reset clears all state
  describe('reset', () => {
    it('clears all state back to initial', () => {
      useTriageStore.getState().loadItems(allItems);
      useTriageStore.getState().acceptItem(llmItem.id);
      useTriageStore.getState().toggleSlot(userItem.id, 'destination', false);
      useTriageStore.getState().addManualSlot('japan_trip', 'hotel', 'Ritz');

      useTriageStore.getState().reset();

      const { items, decisions, slotToggles, manualAdditions } = useTriageStore.getState();
      expect(items).toEqual([]);
      expect(decisions).toEqual({});
      expect(slotToggles).toEqual({});
      expect(manualAdditions).toEqual([]);
    });
  });
});
