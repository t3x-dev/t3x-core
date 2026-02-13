import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CopyMode = 'default' | 'developer';

interface ModeState {
  copyMode: CopyMode;
  setCopyMode: (mode: CopyMode) => void;
  toggleCopyMode: () => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      copyMode: 'default',
      setCopyMode: (mode) => set({ copyMode: mode }),
      toggleCopyMode: () =>
        set((state) => ({
          copyMode: state.copyMode === 'default' ? 'developer' : 'default',
        })),
    }),
    {
      name: 't3x-copy-mode',
      partialize: (state) => ({ copyMode: state.copyMode }),
    }
  )
);
