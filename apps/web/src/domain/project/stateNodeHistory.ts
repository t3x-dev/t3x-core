import * as yaml from 'js-yaml';
import type { StructuredDiffKind } from '@/domain/diff/structuredStateDiff';
import { readStatePointValue } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';

export interface StateNodeHistoryValue {
  exists: boolean;
  text: string;
}

export interface StateNodeHistoryEntry {
  commit: ApiCommit;
  parentHash: string | null;
  kind: StructuredDiffKind;
  before: StateNodeHistoryValue;
  after: StateNodeHistoryValue;
}

function valueAt(commit: ApiCommit | null, path: string): StateNodeHistoryValue {
  const node = commit ? readStatePointValue(commit.content, path) : { exists: false };
  return {
    exists: node.exists,
    text: node.exists
      ? yaml.dump(node.value, { sortKeys: true, noRefs: true, lineWidth: -1 }).trimEnd()
      : '',
  };
}

export function stateNodeHistoryEntry(
  commit: ApiCommit,
  parent: ApiCommit | null,
  path: string
): StateNodeHistoryEntry | null {
  const before = valueAt(parent, path);
  const after = valueAt(commit, path);
  if (before.exists === after.exists && before.text === after.text) return null;
  return {
    commit,
    parentHash: parent?.hash ?? null,
    kind: !before.exists ? 'added' : !after.exists ? 'removed' : 'modified',
    before,
    after,
  };
}
