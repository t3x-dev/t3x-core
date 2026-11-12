import { useEffect, useState } from 'react';
import { serializeStateNodeHistoryValue } from '@/domain/project/stateNodeHistory';
import { indexStatePointValues } from '@/domain/project/stateViewModel';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import type { ApiCommit } from '@/types/api';

const EMPTY_TIMES: ReadonlyMap<string, string> = new Map();
// shortcut: Search 20 revisions per snapshot until the API can project field history in bulk.
const HISTORY_LIMIT = 20;

export function useStateFieldModifiedTimes(
  commit: ApiCommit | null,
  firstParent: ApiCommit | null
) {
  const { loadCommit } = useCommitByHash();
  const [result, setResult] = useState<{ commit: ApiCommit; times: Map<string, string> } | null>(
    null
  );

  useEffect(() => {
    if (!commit || (commit.parents[0] && !firstParent)) return;
    let cancelled = false;

    async function scan(selected: ApiCommit) {
      let revision = selected;
      let values = indexStatePointValues(revision.content);
      const pending = new Set(values.keys());
      const seen = new Set<string>();
      const times = new Map<string, string>();

      for (let index = 0; index < HISTORY_LIMIT && pending.size; index++) {
        seen.add(revision.hash);
        const parentHash = revision.parents[0];
        if (parentHash && seen.has(parentHash)) break;
        const parent = parentHash
          ? index === 0
            ? firstParent
            : await loadCommit(parentHash, selected.project_id)
          : null;
        if (cancelled) return;
        if (
          parentHash &&
          (parent?.hash !== parentHash || parent.project_id !== selected.project_id)
        )
          break;

        const parentValues = parent ? indexStatePointValues(parent.content) : null;
        let updated = false;
        for (const path of pending) {
          const value = values.get(path);
          const before = parentValues?.get(path);
          if (!value || before === null) {
            pending.delete(path);
          } else if (
            !before ||
            (!Object.is(before.value, value.value) &&
              serializeStateNodeHistoryValue(before.value) !==
                serializeStateNodeHistoryValue(value.value))
          ) {
            pending.delete(path);
            if (Number.isFinite(Date.parse(revision.committed_at))) {
              times.set(path, revision.committed_at);
              updated = true;
            }
          }
        }
        if (updated) setResult({ commit: selected, times: new Map(times) });
        if (!parent || !parentValues) break;
        revision = parent;
        values = parentValues;
      }
    }

    // Keep any verified timestamps if older history is unavailable.
    void scan(commit).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [commit, firstParent, loadCommit]);

  return result && result.commit === commit ? result.times : EMPTY_TIMES;
}
