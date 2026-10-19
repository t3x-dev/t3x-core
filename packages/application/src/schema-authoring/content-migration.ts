import {
  applyNativeYOps,
  type NativeYOp,
  type NativeYValue,
  parseNativeYOpsPath,
  resolveNativeYOpsPath,
} from '@t3x-dev/core';
import type { DraftDocument } from '../workspace-authoring/types';

/** Concrete native document paths, not Schema definition paths or wildcard patterns. */
export type SchemaContentMigrationCommand =
  | { kind: 'set'; path: string; value: DraftDocument }
  | { kind: 'append'; path: string; value: DraftDocument }
  | { kind: 'remove'; path: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'rename_node'; path: string; toKey: string };

/** Compile user-confirmed content edits through the existing native engine, without side effects. */
export function compileSchemaContentMigration(
  document: DraftDocument,
  rootKey: string,
  commands: readonly SchemaContentMigrationCommand[]
) {
  if (!document || typeof document !== 'object' || Array.isArray(document))
    throw new TypeError('Schema migration requires a mapping document.');
  const semantic = document.domain === 't3x.dev/semantic-content';
  const root = semantic ? 'content' : rootKey;
  const value = Object.getOwnPropertyDescriptor(document, root)?.value;
  const operations: NativeYOp[] = [
    value === undefined
      ? { assert: { path: JSON.stringify(root), exists: false } }
      : { assert: { path: JSON.stringify(root), equals: structuredClone(value) } },
  ];
  let result: DraftDocument = structuredClone(document);
  const check = (path: string) => {
    const segments = parseNativeYOpsPath(path);
    if (
      !segments.length ||
      segments[0].type !== 'key' ||
      segments[0].value !== root ||
      segments.some(
        (segment) =>
          segment.type === 'key' &&
          (!segment.value || ['__proto__', 'prototype', 'constructor'].includes(segment.value))
      )
    )
      throw new TypeError(`Migration path must stay inside ${root}: ${path}`);
  };
  for (const command of commands) {
    let edits: NativeYOp[];
    if (command.kind === 'move') {
      check(command.from);
      check(command.to);
      edits = [{ move: { from: command.from, to: command.to } }];
    } else {
      check(command.path);
      if (command.kind === 'rename_node') {
        if (!semantic || !/^[a-z][a-z0-9_]*$/.test(command.toKey))
          throw new TypeError('rename_node requires a semantic node and a valid Schema key.');
        const node = resolveNativeYOpsPath(result as NativeYValue, command.path);
        if (
          !node ||
          typeof node !== 'object' ||
          Array.isArray(node) ||
          typeof node.key !== 'string' ||
          !Array.isArray(node.children)
        )
          throw new TypeError('Select an existing semantic node to rename.');
        edits = [{ set: { path: `${command.path}/key`, value: command.toKey } }];
      } else if (command.kind === 'remove') {
        edits = [{ unset: { path: command.path } }];
      } else {
        edits = [
          {
            [command.kind]: { path: command.path, value: structuredClone(command.value) },
          } as NativeYOp,
        ];
      }
    }
    const applied = applyNativeYOps(result as NativeYValue, edits);
    if (!applied.ok) throw new TypeError(applied.error?.message ?? 'Content migration failed.');
    result = applied.doc as DraftDocument;
    operations.push(...edits);
  }
  const replay = applyNativeYOps(document as NativeYValue, operations);
  if (!replay.ok) throw new TypeError(replay.error?.message ?? 'Content migration replay failed.');
  if (semantic) assertSemanticResult(replay.doc, rootKey);
  return { operations, document: replay.doc as DraftDocument };
}

function assertSemanticResult(document: NativeYValue, rootKey: string) {
  const record = (value: unknown): value is Record<string, NativeYValue> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (
    !record(document) ||
    !record(document.content) ||
    !Array.isArray(document.content.trees) ||
    !Array.isArray(document.content.relations)
  )
    throw new TypeError('Migration must retain a semantic content document.');
  const paths = new Set<string>();
  const visit = (nodes: NativeYValue[], parent: string) => {
    const keys = new Set<string>();
    for (const node of nodes) {
      if (
        !record(node) ||
        typeof node.key !== 'string' ||
        !record(node.slots) ||
        !Array.isArray(node.children)
      )
        throw new TypeError('Migration must retain complete semantic nodes.');
      if (keys.has(node.key))
        throw new TypeError(`Migration creates duplicate sibling key: ${node.key}`);
      keys.add(node.key);
      const path = parent ? `${parent}/${node.key}` : node.key;
      if (paths.has(path)) throw new TypeError(`Migration creates ambiguous node path: ${path}`);
      paths.add(path);
      for (const child of node.children) {
        if (record(child) && typeof child.key === 'string' && Object.hasOwn(node.slots, child.key))
          throw new TypeError(`Migration creates a Slot/child collision: ${path}/${child.key}`);
      }
      visit(node.children, path);
    }
  };
  visit(document.content.trees, '');
  for (const relation of document.content.relations) {
    if (
      !record(relation) ||
      typeof relation.from !== 'string' ||
      typeof relation.to !== 'string' ||
      typeof relation.type !== 'string'
    )
      throw new TypeError('Migration must retain complete relations.');
    for (const endpoint of [relation.from, relation.to])
      if (!paths.has(endpoint) && !paths.has(`${rootKey}/${endpoint}`))
        throw new TypeError(`Migrate the relation endpoint explicitly: ${endpoint}`);
  }
}
