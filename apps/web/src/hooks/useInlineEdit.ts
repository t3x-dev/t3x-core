'use client';

/**
 * useInlineEdit — Manages click→input→save/cancel lifecycle for a single slot
 *
 * Single-click trigger (Linear style). rAF auto-focus. Plain <input>.
 */

import { useCallback, useRef } from 'react';
import { useEditingStore } from '@/store/editingStore';
import { useSlotActions } from './useSlotActions';

export function useInlineEdit(nodeId: string, slotKey: string) {
  const editing = useEditingStore((s) => s.editing);
  const startEditStore = useEditingStore((s) => s.startEdit);
  const stopEdit = useEditingStore((s) => s.stopEdit);
  const { updateSlot } = useSlotActions();
  const inputRef = useRef<HTMLInputElement>(null);

  const isEditing = editing?.nodeId === nodeId && editing?.slotKey === slotKey;

  const startEdit = useCallback(() => {
    startEditStore(nodeId, slotKey);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    });
  }, [nodeId, slotKey, startEditStore]);

  const saveEdit = useCallback(
    (newValue: string) => {
      updateSlot(nodeId, slotKey, newValue);
      stopEdit();
    },
    [nodeId, slotKey, updateSlot, stopEdit]
  );

  const cancelEdit = useCallback(() => {
    stopEdit();
  }, [stopEdit]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = (e.target as HTMLInputElement).value;
        saveEdit(value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const value = (e.target as HTMLInputElement).value;
        saveEdit(value);
        // Tab to next slot is handled by the parent component
      }
    },
    [saveEdit, cancelEdit]
  );

  return { isEditing, inputRef, startEdit, saveEdit, cancelEdit, onKeyDown };
}
