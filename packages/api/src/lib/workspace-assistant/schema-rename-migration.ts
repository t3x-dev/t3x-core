import type {
  AssistantSchemaSettingsInput,
  SchemaContentMigrationCommand,
} from '@t3x-dev/api-client';
import { currentComposition } from '@t3x-dev/application';
import { type NativeYValue, resolveNativeYOpsPath } from '@t3x-dev/core';
import type { NodeSchema, YSchema } from '@t3x-dev/yschema';
import { schemaContentFromDocument } from '../schema-evolution-impact';
import { workspaceAuthoringState } from '../workspace-authoring';
import { schemaRootKeyFromBinding } from '../yschema-registry';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Expand a definition rename to concrete instances. Both choices require human confirmation. */
export function renameContentMappings(
  workspace: Record<string, unknown>,
  schema: YSchema,
  settings: AssistantSchemaSettingsInput
) {
  if (!['rename_slot', 'rename_node'].includes(settings.action) || !settings.newName)
    return undefined;
  return contentMappings(workspace, schema, settings);
}

/** The exact concrete content removals displayed for a human deletion confirmation. */
export function removalContentMappings(
  workspace: Record<string, unknown>,
  schema: YSchema,
  settings: AssistantSchemaSettingsInput
) {
  if (!['remove_slot', 'remove_node'].includes(settings.action)) return undefined;
  return contentMappings(workspace, schema, settings).clear;
}

function contentMappings(
  workspace: Record<string, unknown>,
  schema: YSchema,
  settings: AssistantSchemaSettingsInput
) {
  const preserve: SchemaContentMigrationCommand[] = [];
  const clear: SchemaContentMigrationCommand[] = [];
  const removing = settings.action.startsWith('remove_');
  const newName = settings.newName ?? settings.name;
  const document = currentComposition(workspaceAuthoringState(workspace).ledger) as Record<
    string,
    unknown
  >;
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  const root = schemaRootKeyFromBinding(bindings[0]);
  const tree = schemaContentFromDocument(document, root).tree;
  const semantic = document.domain === 't3x.dev/semantic-content';
  const native = (segments: string[], slot = false) => {
    if (!semantic) return [root, ...segments].map((key) => JSON.stringify(key)).join('/');
    let siblings = record(document.content).trees as unknown[];
    const rootIndex = siblings.findIndex((item) => record(item).key === root);
    if (rootIndex < 0) throw new TypeError('The bound content root is missing.');
    let node = record(siblings[rootIndex]);
    let path = `content/trees/[${rootIndex}]`;
    for (const [index, key] of segments.entries()) {
      if (slot && index === segments.length - 1) return `${path}/slots/${JSON.stringify(key)}`;
      siblings = node.children as unknown[];
      const childIndex = siblings.findIndex((item) => record(item).key === key);
      if (childIndex < 0) throw new TypeError('The concrete rename source is missing.');
      path += `/children/[${childIndex}]`;
      node = record(siblings[childIndex]);
    }
    return path;
  };
  let owners = [{ value: tree, segments: [] as string[] }];
  let nodes: Record<string, NodeSchema> = schema.nodes;
  for (const segment of settings.nodePath.split('/').filter(Boolean)) {
    const definition = nodes[segment];
    if (!definition) throw new TypeError('Rename parent definition is unavailable.');
    owners = owners.flatMap((owner) => {
      const value = record(owner.value[segment]);
      const segments = [...owner.segments, segment];
      return definition.repeated
        ? Object.entries(value).map(([key, item]) => ({
            value: record(item),
            segments: [...segments, key],
          }))
        : Object.hasOwn(owner.value, segment)
          ? [{ value, segments }]
          : [];
    });
    nodes = definition.children && definition.children !== 'any' ? definition.children : {};
  }
  const renames: Array<{ from: string; to: string }> = [];
  for (const owner of owners) {
    if (!Object.hasOwn(owner.value, settings.name)) continue;
    const from = [...owner.segments, settings.name];
    const slot = settings.action.endsWith('_slot');
    if (removing) {
      clear.push({ kind: 'remove', path: native(from, slot) });
      continue;
    }
    if (Object.hasOwn(owner.value, newName))
      throw new TypeError(
        `Rename destination already has content: ${[...owner.segments, newName].join('/')}`
      );
    const to = [...owner.segments, newName];
    if (semantic && !slot) {
      const path = native(from);
      preserve.push({ kind: 'rename_node', path, toKey: newName });
      const node = record(resolveNativeYOpsPath(document as NativeYValue, path));
      clear.push({
        kind: 'set',
        path,
        value: { ...node, key: newName, slots: {}, children: [] } as never,
      });
      renames.push({ from: from.join('/'), to: to.join('/') });
    } else {
      preserve.push({ kind: 'move', from: native(from, slot), to: native(to, slot) });
      clear.push({ kind: 'remove', path: native(from, slot) });
      if (!slot) clear.push({ kind: 'set', path: native(to), value: {} });
    }
  }
  if (semantic && renames.length) {
    const content = record(document.content);
    for (const [index, relation] of (Array.isArray(content.relations)
      ? content.relations
      : []
    ).entries()) {
      for (const side of ['from', 'to']) {
        const endpoint = record(relation)[side];
        if (typeof endpoint !== 'string') continue;
        for (const rename of renames) {
          const prefix: string = endpoint.startsWith(`${root}/`) ? `${root}/` : '';
          const from: string = prefix + rename.from;
          if (endpoint === from || endpoint.startsWith(from + '/')) {
            const command = {
              kind: 'set' as const,
              path: `content/relations/[${index}]/${side}`,
              value: prefix + rename.to + endpoint.slice(from.length),
            };
            preserve.push(command);
            clear.push(command);
          }
        }
      }
    }
  }
  if (Math.max(preserve.length, clear.length) > 200)
    throw new TypeError('This change affects more than 200 content mappings. Split the migration.');
  return { preserve, clear };
}
