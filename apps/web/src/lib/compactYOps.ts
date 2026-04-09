import type { YOp } from '@t3x-dev/core';

type SetUnsetState =
  | { kind: 'base' }
  | { kind: 'set'; value: unknown; index: number }
  | { kind: 'removed'; index: number };

type RelateState =
  | { kind: 'base' }
  | { kind: 'related'; index: number }
  | { kind: 'unrelated'; index: number };

function getOpKey(op: YOp): { type: 'set' | 'unset'; path: string } | null {
  if ('set' in op) return { type: 'set', path: op.set.path };
  if ('unset' in op) return { type: 'unset', path: op.unset.path };
  return null;
}

function getRelateKey(op: YOp): { type: 'relate' | 'unrelate'; key: string } | null {
  if ('relate' in op) {
    const r = op.relate;
    return { type: 'relate', key: `${r.from}|${r.to}|${r.type}` };
  }
  if ('unrelate' in op) {
    const r = op.unrelate;
    return { type: 'unrelate', key: `${r.from}|${r.to}|${r.type}` };
  }
  return null;
}

export function compactYOps(ops: YOp[]): YOp[] {
  const setUnsetStates = new Map<string, SetUnsetState>();
  const relateStates = new Map<string, RelateState>();
  const passThrough: Array<{ op: YOp; index: number }> = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    // Check set/unset first
    const suKey = getOpKey(op);
    if (suKey) {
      const state = setUnsetStates.get(suKey.path) ?? { kind: 'base' };
      if (suKey.type === 'set') {
        const value = (op as { set: { path: string; value: unknown } }).set.value;
        setUnsetStates.set(suKey.path, { kind: 'set', value, index: i });
      } else {
        if (state.kind === 'set') {
          setUnsetStates.set(suKey.path, { kind: 'base' });
        } else {
          setUnsetStates.set(suKey.path, { kind: 'removed', index: i });
        }
      }
      continue;
    }

    // Check relate/unrelate
    const relKey = getRelateKey(op);
    if (relKey) {
      const state = relateStates.get(relKey.key) ?? { kind: 'base' };
      if (relKey.type === 'relate') {
        // base/unrelated/related + relate → related
        relateStates.set(relKey.key, { kind: 'related', index: i });
      } else {
        // unrelate
        if (state.kind === 'related') {
          // related + unrelate → base (cancel)
          relateStates.set(relKey.key, { kind: 'base' });
        } else {
          // base/unrelated + unrelate → unrelated
          relateStates.set(relKey.key, { kind: 'unrelated', index: i });
        }
      }
      continue;
    }

    // Everything else passes through
    passThrough.push({ op, index: i });
  }

  // Emit set/unset results
  const emitted: Array<{ op: YOp; index: number }> = [];

  for (const [path, state] of setUnsetStates) {
    if (state.kind === 'set') {
      emitted.push({
        op: { set: { path, value: state.value } } as YOp,
        index: state.index,
      });
    } else if (state.kind === 'removed') {
      emitted.push({
        op: { unset: { path } } as YOp,
        index: state.index,
      });
    }
  }

  // Emit relate/unrelate results
  for (const [key, state] of relateStates) {
    const [from, to, type] = key.split('|');
    if (state.kind === 'related') {
      emitted.push({
        op: { relate: { from, to, type } } as YOp,
        index: state.index,
      });
    } else if (state.kind === 'unrelated') {
      emitted.push({
        op: { unrelate: { from, to, type } } as YOp,
        index: state.index,
      });
    }
  }

  return [...emitted, ...passThrough]
    .sort((a, b) => a.index - b.index)
    .map((e) => e.op);
}
