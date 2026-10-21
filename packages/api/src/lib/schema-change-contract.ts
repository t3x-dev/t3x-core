import {
  type AssistantSchemaSettingsInput,
  AssistantSchemaSettingsInputSchema,
} from '@t3x-dev/api-client';
import { compileWorkspaceSchemaDefinition } from '@t3x-dev/core';
import { normalizeYSchemaObject } from '@t3x-dev/yschema';

type Definition = Record<string, unknown>;
const record = (value: unknown): Definition =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Definition) : {};
const keyPattern = /^[a-z][a-z0-9_]*$/;

function patchNode(base: Definition, patch: Definition): Definition {
  const result = { ...base, ...patch };
  if (patch.slots) {
    const slots = { ...record(base.slots) };
    for (const [key, value] of Object.entries(record(patch.slots)))
      slots[key] = { ...record(slots[key]), ...record(value) };
    result.slots = slots;
  }
  if (patch.children && patch.children !== 'any') {
    const children = { ...record(base.children) };
    for (const [key, value] of Object.entries(record(patch.children)))
      children[key] = patchNode(record(children[key]), record(value));
    result.children = children;
  }
  return result;
}

/** One task contract for the card and the generator. Never mutates Base or content. */
export function schemaChangeTarget(baseInput: unknown, raw: AssistantSchemaSettingsInput) {
  const input = AssistantSchemaSettingsInputSchema.parse(raw);
  const schema = structuredClone(normalizeYSchemaObject(baseInput)) as unknown as Definition;
  const kind = input.action.split('_')[1];
  let owner: Definition;
  let parent: Definition | undefined;
  if (kind === 'rule') {
    const rules = (schema.rules ?? []) as Definition[];
    owner = Object.fromEntries(rules.map((rule) => [String(rule.id), rule]));
  } else if (kind === 'relation') {
    owner = record(schema.relationTypes);
    schema.relationTypes = owner;
  } else {
    let nodes = record(schema.nodes);
    for (const segment of input.nodePath.split('/').filter(Boolean)) {
      if (!keyPattern.test(segment) || !Object.hasOwn(nodes, segment))
        throw new TypeError(`Node ${input.nodePath} does not exist.`);
      parent = record(nodes[segment]);
      nodes = record(parent.children);
    }
    if (kind === 'slot') {
      if (!parent) throw new TypeError('Select the Slot parent Node.');
      owner = { ...record(parent.slots) };
      parent.slots = owner;
    } else {
      if (parent && (parent.repeated || parent.children === 'any'))
        throw new TypeError('This Node cannot own child definitions.');
      owner = parent ? record(parent.children) : record(schema.nodes);
      if (parent) parent.children = owner;
    }
  }
  const exists = Object.hasOwn(owner, input.name);
  const before = exists ? structuredClone(record(owner[input.name])) : undefined;
  const currentRequired =
    kind === 'slot' && Array.isArray(parent?.requiredSlots)
      ? parent.requiredSlots.includes(input.name)
      : undefined;
  const adding = input.action.startsWith('add_');
  if (adding ? exists : !exists)
    throw new TypeError(
      adding ? 'This definition already exists.' : 'The selected definition does not exist.'
    );
  let pathMapping: { from: string; to: string } | undefined;
  if (input.action.startsWith('remove_')) delete owner[input.name];
  else if (input.action.startsWith('move_')) {
    if (input.targetNodePath === undefined) throw new TypeError('Select a destination Node.');
    const from = [input.nodePath, input.name].filter(Boolean).join('/');
    if (
      kind === 'node' &&
      (input.targetNodePath === from || input.targetNodePath.startsWith(from + '/'))
    )
      throw new TypeError('A Node cannot be moved inside itself.');
    let nodes = record(schema.nodes);
    let target: Definition | undefined;
    for (const segment of input.targetNodePath.split('/').filter(Boolean)) {
      if (!keyPattern.test(segment) || !Object.hasOwn(nodes, segment))
        throw new TypeError('Destination Node does not exist.');
      target = record(nodes[segment]);
      nodes = record(target.children);
    }
    if (kind === 'slot' && !target) throw new TypeError('Slots require a destination Node.');
    if (kind === 'node' && target && (target.repeated || target.children === 'any'))
      throw new TypeError('Destination Node cannot own child definitions.');
    const field = kind === 'slot' ? 'slots' : 'children';
    const destination = target ? record(target[field]) : record(schema.nodes);
    const name = input.newName ?? input.name;
    if (Object.hasOwn(destination, name)) throw new TypeError('Destination name already exists.');
    destination[name] = owner[input.name];
    if (target) target[field] = destination;
    delete owner[input.name];
    if (kind === 'slot' && target) {
      const required = new Set((target.requiredSlots ?? []) as string[]);
      if (input.required ?? currentRequired) required.add(name);
      target.requiredSlots = [...required];
    }
    if (kind === 'node')
      pathMapping = { from, to: [input.targetNodePath, name].filter(Boolean).join('/') };
  } else if (input.action.startsWith('rename_')) {
    if (!input.newName || !keyPattern.test(input.newName) || input.newName === input.name)
      throw new TypeError('Choose a different machine-safe new name.');
    if (Object.hasOwn(owner, input.newName)) throw new TypeError('The new name already exists.');
    owner[input.newName] = owner[input.name];
    delete owner[input.name];
    if (kind === 'node') {
      pathMapping = {
        from: [input.nodePath, input.name].filter(Boolean).join('/'),
        to: [input.nodePath, input.newName].filter(Boolean).join('/'),
      };
    }
  } else {
    const next =
      input.definitionMode === 'replace'
        ? { ...input.definition }
        : kind === 'node'
          ? patchNode(before ?? {}, input.definition)
          : { ...before, ...input.definition };
    for (const key of input.unsetAttributes ?? []) delete next[key];
    if (kind === 'rule') next.id = input.name;
    owner[input.name] = next;
  }
  if (pathMapping) {
    const { from, to } = pathMapping;
    const rewrite = (path: string) =>
      path === from || path.startsWith(from + '/') ? to + path.slice(from.length) : path;
    for (const item of [
      ...Object.values(record(schema.relationTypes)).map(record),
      ...((schema.rules ?? []) as Definition[]),
    ])
      for (const side of ['from', 'to'])
        if (typeof item[side] === 'string') item[side] = rewrite(item[side] as string);
  }
  if (kind === 'slot' && parent) {
    const required = new Set((parent.requiredSlots ?? []) as string[]);
    if (input.action === 'remove_slot' || input.action === 'move_slot') required.delete(input.name);
    else if (input.action === 'rename_slot' && required.delete(input.name))
      required.add(input.newName!);
    else if (input.required !== undefined) {
      if (input.required) required.add(input.name);
      else required.delete(input.name);
    }
    if (parent.requiredSlots !== undefined || input.required !== undefined)
      parent.requiredSlots = [...required];
  }
  if (kind === 'rule') schema.rules = Object.values(owner);
  return {
    schema,
    currentDefinition: before,
    currentRequired,
    proposedDefinition: record(owner[input.newName ?? input.name]),
  };
}

export async function compileConfirmedSchemaChange(
  base: unknown,
  input: AssistantSchemaSettingsInput
) {
  return compileWorkspaceSchemaDefinition(base, schemaChangeTarget(base, input).schema);
}
