import type { YOp } from '@t3x-dev/core';

type SetUnsetState =
  | { kind: 'base' }
  | { kind: 'set'; value: unknown; index: number }
  | { kind: 'removed'; index: number };

function getOpKey(op: YOp): { type: 'set' | 'unset'; path: string } | null {
  if ('set' in op) return { type: 'set', path: op.set.path };
  if ('unset' in op) return { type: 'unset', path: op.unset.path };
  return null;
}

export function compactYOps(ops: YOp[]): YOp[] {
  const setUnsetStates = new Map<string, SetUnsetState>();
  const passThrough: Array<{ op: YOp; index: number }> = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const key = getOpKey(op);

    if (!key) {
      passThrough.push({ op, index: i });
      continue;
    }

    const state = setUnsetStates.get(key.path) ?? { kind: 'base' };

    if (key.type === 'set') {
      const value = (op as { set: { path: string; value: unknown } }).set.value;
      setUnsetStates.set(key.path, { kind: 'set', value, index: i });
    } else {
      if (state.kind === 'set') {
        setUnsetStates.set(key.path, { kind: 'base' });
      } else {
        setUnsetStates.set(key.path, { kind: 'removed', index: i });
      }
    }
  }

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

  return [...emitted, ...passThrough]
    .sort((a, b) => a.index - b.index)
    .map((e) => e.op);
}
