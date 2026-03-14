import type { Delta, DeltaLogEntry, DeltaSource, SemanticContent } from '@t3x-dev/core';
import { create } from 'zustand';

type PanelMode = 'collapsed' | 'default' | 'preview';
type ActiveView = 'graph' | 'yaml';

interface ExtractionPanelState {
  panelMode: PanelMode;
  activeView: ActiveView;
  draft: SemanticContent;
  deltaLog: DeltaLogEntry[];
  isExtracting: boolean;

  setPanelMode: (mode: PanelMode) => void;
  setActiveView: (view: ActiveView) => void;
  togglePanel: () => void;
  applyDelta: (delta: Delta, source: DeltaSource, turnHash?: string) => void;
  resetDraft: () => void;
  setExtracting: (extracting: boolean) => void;
}

const emptyContent: SemanticContent = { frames: [], relations: [] };

export const useExtractionPanelStore = create<ExtractionPanelState>((set, get) => ({
  panelMode: 'collapsed',
  activeView: 'graph',
  draft: emptyContent,
  deltaLog: [],
  isExtracting: false,

  setPanelMode: (mode) => set({ panelMode: mode }),
  setActiveView: (view) => set({ activeView: view }),

  togglePanel: () => {
    const current = get().panelMode;
    set({ panelMode: current === 'collapsed' ? 'default' : 'collapsed' });
  },

  applyDelta: (delta, source, turnHash) => {
    const { draft, deltaLog } = get();
    let frames = [...draft.frames];
    let relations = [...draft.relations];

    for (const change of delta.changes) {
      switch (change.action) {
        case 'add':
          frames.push(change.frame);
          break;
        case 'update': {
          frames = frames.map((f) => {
            if (f.id !== change.target) return f;
            const merged = { ...f.slots };
            for (const [k, v] of Object.entries(change.slots)) {
              if (v === null) delete merged[k];
              else merged[k] = v;
            }
            return { ...f, slots: merged };
          });
          break;
        }
        case 'remove':
          frames = frames.filter((f) => f.id !== change.target);
          break;
      }
    }

    if (delta.new_relations) {
      relations = [...relations, ...delta.new_relations];
    }
    if (delta.remove_relations) {
      relations = relations.filter(
        (r) =>
          !delta.remove_relations!.some(
            (rr) => rr.from === r.from && rr.to === r.to && rr.type === r.type
          )
      );
    }

    const entry: DeltaLogEntry = {
      id: crypto.randomUUID(),
      delta,
      source,
      created_at: new Date().toISOString(),
      turn_hash: turnHash,
    };

    set({
      draft: { frames, relations },
      deltaLog: [...deltaLog, entry],
    });
  },

  resetDraft: () => set({ draft: emptyContent, deltaLog: [] }),
  setExtracting: (extracting) => set({ isExtracting: extracting }),
}));
