export type SchemaDefinition = Record<string, unknown>;
export type SchemaFieldRow = {
  path: string;
  parentPath: string | null;
  location: string[];
  owner: string[];
  semanticPath: string;
  depth: number;
  kind: 'node' | 'slot';
  name: string;
  definition: SchemaDefinition;
  required: boolean;
  expandable: boolean;
};

export function schemaRecord(value: unknown): SchemaDefinition {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SchemaDefinition)
    : {};
}

export function schemaFieldRows(schema: SchemaDefinition): SchemaFieldRow[] {
  const rows: SchemaFieldRow[] = [];
  function visit(
    nodes: SchemaDefinition,
    container: string[],
    parent: string | null,
    prefix: string,
    depth: number
  ) {
    for (const [name, value] of Object.entries(nodes)) {
      const definition = schemaRecord(value);
      const location = [...container, name];
      const path = JSON.stringify(location);
      const semanticPath = prefix ? `${prefix}/${name}` : name;
      const slots = schemaRecord(definition.slots);
      const children = schemaRecord(definition.children);
      rows.push({
        path,
        parentPath: parent,
        location,
        owner: container,
        semanticPath,
        depth,
        kind: 'node',
        name,
        definition,
        required: definition.required === true,
        expandable: !!(Object.keys(slots).length || Object.keys(children).length),
      });
      for (const [slotName, slot] of Object.entries(slots)) {
        const slotLocation = [...location, 'slots', slotName];
        rows.push({
          path: JSON.stringify(slotLocation),
          parentPath: path,
          location: slotLocation,
          owner: location,
          semanticPath: `${semanticPath}/${slotName}`,
          depth: depth + 1,
          kind: 'slot',
          name: slotName,
          definition: schemaRecord(slot),
          required:
            Array.isArray(definition.requiredSlots) && definition.requiredSlots.includes(slotName),
          expandable: false,
        });
      }
      visit(children, [...location, 'children'], path, semanticPath, depth + 1);
    }
  }
  visit(schemaRecord(schema.nodes), ['nodes'], null, '', 0);
  return rows;
}

function at(schema: SchemaDefinition, path: string[]) {
  let value = schema;
  for (const key of path) {
    if (!Object.hasOwn(value, key)) value[key] = {};
    value = schemaRecord(value[key]);
  }
  return value;
}

/** Refuse ambiguous rewrites; users can edit the referring rule/relation first. */
function guardReferences(schema: SchemaDefinition, row: SchemaFieldRow) {
  const references = [schema.relationTypes, schema.rules];
  const matches = (value: unknown): boolean => {
    if (typeof value === 'string') {
      const path = row.semanticPath;
      return (
        value === path ||
        value.startsWith(`${path}/`) ||
        value.startsWith(`${path}.`) ||
        value === row.name
      );
    }
    return !!value && typeof value === 'object' && Object.values(value).some(matches);
  };
  if (references.some(matches))
    throw new Error(
      'This field is referenced by a relation or rule. Update those references before moving, renaming or deleting it.'
    );
}

export function changeSchemaField(
  schema: SchemaDefinition,
  row: SchemaFieldRow,
  name: string,
  definition: SchemaDefinition | undefined,
  required = row.required
): SchemaDefinition {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error(
      'Use a lowercase letter followed by lowercase letters, numbers or underscores.'
    );
  if (name !== row.name || definition === undefined) guardReferences(schema, row);
  const next = structuredClone(schema);
  const container = at(next, row.location.slice(0, -1));
  if (name !== row.name && Object.hasOwn(container, name))
    throw new Error('This name is already in use.');
  if (!Object.hasOwn(container, row.name))
    throw new Error('This field changed. Select it again before editing.');
  const entries = Object.entries(container).flatMap(([key, value]) =>
    key === row.name ? (definition === undefined ? [] : [[name, definition]]) : [[key, value]]
  );
  const parent = at(next, row.location.slice(0, -2));
  parent[row.location.at(-2)!] = Object.fromEntries(entries);
  if (row.kind === 'slot') {
    const node = at(next, row.owner);
    const names = (Array.isArray(node.requiredSlots) ? node.requiredSlots : []).flatMap((key) =>
      key === row.name ? (definition !== undefined && required ? [name] : []) : [key]
    );
    if (definition !== undefined && required && !names.includes(name)) names.push(name);
    if (names.length) node.requiredSlots = names;
    else delete node.requiredSlots;
  } else if (definition !== undefined && required !== row.required) {
    // Node required and Slot requiredSlots have different representations.
    const node = at(next, [...row.location.slice(0, -1), name]);
    if (required) node.required = true;
    else delete node.required;
  }
  return next;
}

export function addSchemaField(
  schema: SchemaDefinition,
  parent: SchemaFieldRow | null,
  kind: 'node' | 'slot'
) {
  if (parent && parent.kind !== 'node') throw new Error('Select a node before adding a field.');
  if (!parent && kind === 'slot') throw new Error('Fields must belong to a node.');
  if (kind === 'node' && parent?.definition.repeated)
    throw new Error('A repeated node cannot also define child nodes.');
  if (kind === 'node' && parent?.definition.children === 'any')
    throw new Error(
      'Change unrestricted children in the existing definition editor before adding a child definition.'
    );
  const next = structuredClone(schema);
  const location = parent
    ? [...parent.location, kind === 'slot' ? 'slots' : 'children']
    : ['nodes'];
  const container = at(next, location);
  const prefix = kind === 'slot' ? 'new_field' : 'new_node';
  let name = prefix;
  for (let n = 2; Object.hasOwn(container, name); n++) name = `${prefix}_${n}`;
  container[name] = kind === 'slot' ? { type: 'string' } : { slots: {} };
  return { definition: next, path: JSON.stringify([...location, name]) };
}

export function moveSchemaField(
  schema: SchemaDefinition,
  row: SchemaFieldRow,
  target: SchemaFieldRow | null,
  name = row.name
) {
  if (row.kind === 'slot' && !target) throw new Error('Fields and objects must belong to a node.');
  if (
    target &&
    !schemaFieldRows(schema).some((item) => item.path === target.path && item.kind === 'node')
  )
    throw new Error('The destination node is unavailable. Select it again.');
  if (row.kind === 'node' && target) {
    if (row.location.every((key, index) => target.location[index] === key))
      throw new Error('A node cannot be moved into itself or one of its descendants.');
    if (target.definition.repeated)
      throw new Error('A repeated node cannot also define child nodes.');
    if (target.definition.children === 'any')
      throw new Error('Change unrestricted children before moving a node into this destination.');
  }
  const location = target
    ? [...target.location, row.kind === 'slot' ? 'slots' : 'children']
    : ['nodes'];
  if (JSON.stringify(row.location.slice(0, -1)) === JSON.stringify(location))
    return name === row.name ? schema : changeSchemaField(schema, row, name, row.definition);
  validateName(name);
  const next = changeSchemaField(schema, row, row.name, undefined);
  const destination = at(next, location);
  if (Object.hasOwn(destination, name)) throw new SchemaNameConflict(name);
  destination[name] = structuredClone(row.definition);
  if (row.kind === 'slot' && row.required && target) {
    const node = at(next, target.location);
    node.requiredSlots = [
      ...new Set([...(Array.isArray(node.requiredSlots) ? node.requiredSlots : []), name]),
    ];
  }
  return next;
}

export class SchemaNameConflict extends Error {
  constructor(name: string) {
    super(`The destination already has ${name}. Choose a different name.`);
  }
}
function validateName(name: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error(
      'Use a lowercase letter followed by lowercase letters, numbers or underscores.'
    );
}
export function importSchemaField(
  schema: SchemaDefinition,
  source: SchemaDefinition,
  row: SchemaFieldRow,
  target: SchemaFieldRow | null,
  name = row.name
) {
  validateName(name);
  guardReferences(source, row);
  if (!target && row.kind === 'slot') throw new Error('Fields and objects must belong to a node.');
  if (
    target &&
    !schemaFieldRows(schema).some((item) => item.path === target.path && item.kind === 'node')
  )
    throw new Error('The destination node is unavailable.');
  if (row.kind === 'node' && (target?.definition.repeated || target?.definition.children === 'any'))
    throw new Error('This destination cannot contain child node definitions.');
  const location = target
    ? [...target.location, row.kind === 'node' ? 'children' : 'slots', name]
    : ['nodes', name];
  const next = structuredClone(schema),
    container = at(next, location.slice(0, -1));
  if (Object.hasOwn(container, name)) throw new SchemaNameConflict(name);
  container[name] = structuredClone(row.definition);
  if (target && row.kind === 'slot' && row.required) {
    const node = at(next, target.location);
    node.requiredSlots = [
      ...new Set([...(Array.isArray(node.requiredSlots) ? node.requiredSlots : []), name]),
    ];
  }
  return { definition: next, location };
}

export function addSchemaRelation(
  schema: SchemaDefinition,
  from: SchemaFieldRow,
  to: SchemaFieldRow
) {
  if (from.kind !== 'node' || to.kind !== 'node') throw new Error('Relations connect nodes.');
  const next = structuredClone(schema);
  const relations = schemaRecord(next.relationTypes);
  let name = 'relates_to';
  for (let n = 2; Object.hasOwn(relations, name); n++) name = `relates_to_${n}`;
  // Repeated nodes describe a collection; endpoints target each concrete item.
  const endpoint = (row: SchemaFieldRow) =>
    `${row.semanticPath}${row.definition.repeated ? '/*' : ''}`;
  next.relationTypes = { ...relations, [name]: { from: endpoint(from), to: endpoint(to) } };
  return next;
}
