import type { YValue } from '@t3x-dev/yops';
import yaml from 'js-yaml';
import type {
  ContentKind,
  NodeSchema,
  RelationTypeSchema,
  ReservedRuleSchema,
  SlotSchema,
  SlotType,
  YOpsHint,
  YSchema,
} from './types';

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const PATH_RE = /^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*$/;
const SLOT_TYPES: readonly SlotType[] = [
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
  'null',
];

function invalidSchema(message: string): never {
  throw new Error(`INVALID_SCHEMA: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    invalidSchema(`${context} must be a mapping`);
  }
  return value;
}

function getField(record: Record<string, unknown>, camel: string, snake?: string): unknown {
  if (snake && record[camel] !== undefined && record[snake] !== undefined) {
    invalidSchema(`${camel} and ${snake} cannot both be set`);
  }
  if (record[camel] !== undefined) return record[camel];
  if (snake && record[snake] !== undefined) return record[snake];
  return undefined;
}

function asOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalidSchema(`${context} must be a string`);
  return value;
}

function asOptionalBoolean(value: unknown, context: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') invalidSchema(`${context} must be a boolean`);
  return value;
}

function asOptionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidSchema(`${context} must be a finite number`);
  }
  return value;
}

function asOptionalContentKind(value: unknown, context: string): ContentKind | undefined {
  if (value === undefined) return undefined;
  if (value === 'prose' || value === 'structured') return value;
  invalidSchema(`${context} must be "prose" or "structured"`);
}

function isYValue(value: unknown): value is YValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isYValue);
  if (isRecord(value)) return Object.values(value).every(isYValue);
  return false;
}

function asYValue(value: unknown, context: string): YValue {
  if (!isYValue(value)) invalidSchema(`${context} must be a YAML value`);
  return value;
}

function asYValueArray(value: unknown, context: string): YValue[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalidSchema(`${context} must be an array`);
  return value.map((item, index) => asYValue(item, `${context}[${index}]`));
}

function assertKey(key: string, context: string): void {
  if (!KEY_RE.test(key)) {
    invalidSchema(`${context} key "${key}" must match ${KEY_RE.source}`);
  }
}

function assertPath(path: string, context: string): void {
  if (!PATH_RE.test(path)) {
    invalidSchema(`${context} path "${path}" must match ${PATH_RE.source}`);
  }
}

function asKeyArray(value: unknown, context: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalidSchema(`${context} must be an array`);
  return value.map((item, index) => {
    if (typeof item !== 'string') invalidSchema(`${context}[${index}] must be a string`);
    assertKey(item, context);
    return item;
  });
}

function normalizeYOpsHint(value: unknown, context: string): YOpsHint | undefined {
  if (value === undefined) return undefined;
  const raw = asRecord(value, context);
  const preferredOp = getField(raw, 'preferredOp', 'preferred_op');
  const path = raw.path;
  const slot = raw.slot;
  const hint: YOpsHint = {};

  if (preferredOp !== undefined) {
    if (
      preferredOp !== 'define' &&
      preferredOp !== 'set' &&
      preferredOp !== 'populate' &&
      preferredOp !== 'append'
    ) {
      invalidSchema(`${context}.preferredOp must be define, set, populate, or append`);
    }
    hint.preferredOp = preferredOp;
  }
  if (path !== undefined) {
    if (typeof path !== 'string') invalidSchema(`${context}.path must be a string`);
    assertPath(path, `${context}.path`);
    hint.path = path;
  }
  if (slot !== undefined) {
    if (typeof slot !== 'string') invalidSchema(`${context}.slot must be a string`);
    assertKey(slot, `${context}.slot`);
    hint.slot = slot;
  }

  return hint;
}

function normalizeSlot(def: unknown, context: string): SlotSchema {
  if (def === 'list') {
    return { type: 'array' };
  }
  if (def === 'scalar') {
    invalidSchema(`${context} uses legacy scalar; P0 slots must use an explicit type`);
  }
  if (Array.isArray(def)) {
    return { enum: asYValueArray(def, `${context}.enum`) };
  }

  const raw = asRecord(def, context);
  const typeValue = raw.type;
  const slot: SlotSchema = {};

  if (typeValue !== undefined) {
    const normalizedType = typeValue === 'list' ? 'array' : typeValue;
    if (typeof normalizedType !== 'string' || !SLOT_TYPES.includes(normalizedType as SlotType)) {
      invalidSchema(`${context}.type must be one of ${SLOT_TYPES.join(', ')}`);
    }
    if (typeValue === 'scalar') {
      invalidSchema(`${context}.type uses legacy scalar; P0 slots must use an explicit type`);
    }
    slot.type = normalizedType as SlotType;
  }

  const enumValue = raw.enum;
  const constValue = raw.const;
  const defaultValue = raw.default;
  const examples = raw.examples;
  const minimum = raw.minimum;
  const maximum = raw.maximum;
  const minLength = getField(raw, 'minLength', 'min_length');
  const maxLength = getField(raw, 'maxLength', 'max_length');
  const maxWords = getField(raw, 'maxWords', 'max_words');
  const provenanceRequired = getField(raw, 'provenanceRequired', 'provenance_required');
  const contentKind = getField(raw, 'contentKind', 'content_kind');
  const contentGuidance = getField(raw, 'contentGuidance', 'content_guidance');
  const gapQuestion = getField(raw, 'gapQuestion', 'gap_question');
  const yopsHint = getField(raw, 'yopsHint', 'yops_hint');

  const enumArray = asYValueArray(enumValue, `${context}.enum`);
  if (enumArray !== undefined) slot.enum = enumArray;
  if (constValue !== undefined) slot.const = asYValue(constValue, `${context}.const`);
  if (defaultValue !== undefined) slot.default = asYValue(defaultValue, `${context}.default`);

  const exampleArray = asYValueArray(examples, `${context}.examples`);
  if (exampleArray !== undefined) slot.examples = exampleArray;

  const description = asOptionalString(raw.description, `${context}.description`);
  if (description !== undefined) slot.description = description;

  const normalizedContentGuidance = asOptionalString(contentGuidance, `${context}.contentGuidance`);
  if (normalizedContentGuidance !== undefined) slot.contentGuidance = normalizedContentGuidance;

  const normalizedGapQuestion = asOptionalString(gapQuestion, `${context}.gapQuestion`);
  if (normalizedGapQuestion !== undefined) slot.gapQuestion = normalizedGapQuestion;

  const normalizedContentKind = asOptionalContentKind(contentKind, `${context}.contentKind`);
  if (normalizedContentKind !== undefined) slot.contentKind = normalizedContentKind;

  const normalizedMinimum = asOptionalNumber(minimum, `${context}.minimum`);
  if (normalizedMinimum !== undefined) slot.minimum = normalizedMinimum;

  const normalizedMaximum = asOptionalNumber(maximum, `${context}.maximum`);
  if (normalizedMaximum !== undefined) slot.maximum = normalizedMaximum;

  const normalizedMinLength = asOptionalNumber(minLength, `${context}.minLength`);
  if (normalizedMinLength !== undefined) slot.minLength = normalizedMinLength;

  const normalizedMaxLength = asOptionalNumber(maxLength, `${context}.maxLength`);
  if (normalizedMaxLength !== undefined) slot.maxLength = normalizedMaxLength;

  const pattern = asOptionalString(raw.pattern, `${context}.pattern`);
  if (pattern !== undefined) slot.pattern = pattern;

  const format = asOptionalString(raw.format, `${context}.format`);
  if (format !== undefined) slot.format = format;

  const normalizedMaxWords = asOptionalNumber(maxWords, `${context}.maxWords`);
  if (normalizedMaxWords !== undefined) slot.maxWords = normalizedMaxWords;

  const normalizedProvenanceRequired = asOptionalBoolean(
    provenanceRequired,
    `${context}.provenanceRequired`
  );
  if (normalizedProvenanceRequired !== undefined) {
    slot.provenanceRequired = normalizedProvenanceRequired;
  }

  const normalizedYOpsHint = normalizeYOpsHint(yopsHint, `${context}.yopsHint`);
  if (normalizedYOpsHint !== undefined) slot.yopsHint = normalizedYOpsHint;

  return slot;
}

function normalizeSlots(value: unknown, context: string): Record<string, SlotSchema> | undefined {
  if (value === undefined) return undefined;
  const rawSlots = asRecord(value, context);
  const slots: Record<string, SlotSchema> = {};
  for (const [slotKey, slotDef] of Object.entries(rawSlots)) {
    assertKey(slotKey, context);
    slots[slotKey] = normalizeSlot(slotDef, `${context}.${slotKey}`);
  }
  return slots;
}

function normalizeNode(def: unknown, context: string): NodeSchema {
  const raw = asRecord(def, context);
  const node: NodeSchema = {};

  const required = asOptionalBoolean(raw.required, `${context}.required`);
  if (required !== undefined) node.required = required;

  const repeated = asOptionalBoolean(raw.repeated, `${context}.repeated`);
  if (repeated !== undefined) node.repeated = repeated;

  const description = asOptionalString(raw.description, `${context}.description`);
  if (description !== undefined) node.description = description;

  const contentGuidance = asOptionalString(
    getField(raw, 'contentGuidance', 'content_guidance'),
    `${context}.contentGuidance`
  );
  if (contentGuidance !== undefined) node.contentGuidance = contentGuidance;

  const contentKind = asOptionalContentKind(
    getField(raw, 'contentKind', 'content_kind'),
    `${context}.contentKind`
  );
  if (contentKind !== undefined) node.contentKind = contentKind;

  const slots = normalizeSlots(raw.slots, `${context}.slots`);
  if (slots !== undefined) node.slots = slots;

  const requiredSlots = asKeyArray(
    getField(raw, 'requiredSlots', 'required_slots'),
    `${context}.requiredSlots`
  );
  if (requiredSlots !== undefined) node.requiredSlots = requiredSlots;

  const childrenValue = raw.children;
  if (childrenValue !== undefined) {
    if (childrenValue === 'any') {
      node.children = 'any';
    } else {
      const rawChildren = asRecord(childrenValue, `${context}.children`);
      const children: Record<string, NodeSchema> = {};
      for (const [childKey, childDef] of Object.entries(rawChildren)) {
        assertKey(childKey, `${context}.children`);
        children[childKey] = normalizeNode(childDef, `${context}.children.${childKey}`);
      }
      node.children = children;
    }
  }

  if (node.repeated && node.children !== undefined) {
    invalidSchema(`${context} cannot combine repeated with children`);
  }

  if (node.requiredSlots) {
    for (const slotKey of node.requiredSlots) {
      if (!node.slots || !(slotKey in node.slots)) {
        invalidSchema(`${context}.requiredSlots references undeclared slot "${slotKey}"`);
      }
    }
  }

  return node;
}

function normalizeNodes(value: unknown): Record<string, NodeSchema> {
  const rawNodes = asRecord(value, 'nodes');
  const nodes: Record<string, NodeSchema> = {};
  for (const [nodeKey, nodeDef] of Object.entries(rawNodes)) {
    assertKey(nodeKey, 'nodes');
    nodes[nodeKey] = normalizeNode(nodeDef, `nodes.${nodeKey}`);
  }
  return nodes;
}

function resolveNodePath(nodes: Record<string, NodeSchema>, path: string): NodeSchema | undefined {
  assertPath(path, 'relationTypes endpoint');
  const segments = path.split('/');
  let current: NodeSchema | undefined = nodes[segments[0]];
  for (const segment of segments.slice(1)) {
    if (!current || current.children === undefined || current.children === 'any') {
      return undefined;
    }
    current = current.children[segment];
  }
  return current;
}

function parseEndpointPattern(
  pattern: string,
  context: string
): { path: string; repeated: boolean } {
  if (pattern.includes('*') && !pattern.endsWith('/*')) {
    invalidSchema(`${context} endpoint "${pattern}" must be a path or path/*`);
  }
  const repeated = pattern.endsWith('/*');
  const path = repeated ? pattern.slice(0, -2) : pattern;
  assertPath(path, context);
  return { path, repeated };
}

function normalizeRelationTypes(
  value: unknown,
  nodes: Record<string, NodeSchema>
): Record<string, RelationTypeSchema> | undefined {
  if (value === undefined) return undefined;
  const rawRelationTypes = asRecord(value, 'relationTypes');
  const relationTypes: Record<string, RelationTypeSchema> = {};

  for (const [typeKey, typeDef] of Object.entries(rawRelationTypes)) {
    assertKey(typeKey, 'relationTypes');
    const raw = asRecord(typeDef, `relationTypes.${typeKey}`);
    const fromValue = raw.from;
    const toValue = raw.to;
    if (typeof fromValue !== 'string')
      invalidSchema(`relationTypes.${typeKey}.from must be a string`);
    if (typeof toValue !== 'string') invalidSchema(`relationTypes.${typeKey}.to must be a string`);

    for (const [side, endpoint] of [
      ['from', fromValue],
      ['to', toValue],
    ] as const) {
      const parsed = parseEndpointPattern(endpoint, `relationTypes.${typeKey}.${side}`);
      const node = resolveNodePath(nodes, parsed.path);
      if (!node) {
        invalidSchema(
          `relationTypes.${typeKey}.${side} endpoint "${endpoint}" does not resolve to a node`
        );
      }
      if (parsed.repeated && !node.repeated) {
        invalidSchema(
          `relationTypes.${typeKey}.${side} endpoint "${endpoint}" requires a repeated node`
        );
      }
    }

    const relationType: RelationTypeSchema = {
      from: fromValue,
      to: toValue,
    };

    const description = asOptionalString(raw.description, `relationTypes.${typeKey}.description`);
    if (description !== undefined) relationType.description = description;

    const contentGuidance = asOptionalString(
      getField(raw, 'contentGuidance', 'content_guidance'),
      `relationTypes.${typeKey}.contentGuidance`
    );
    if (contentGuidance !== undefined) relationType.contentGuidance = contentGuidance;

    const acyclic = asOptionalBoolean(raw.acyclic, `relationTypes.${typeKey}.acyclic`);
    if (acyclic !== undefined) relationType.acyclic = acyclic;

    relationTypes[typeKey] = relationType;
  }

  return relationTypes;
}

function normalizeRules(value: unknown): ReservedRuleSchema[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidSchema('rules must be an array');
  return value.map((item, index) => {
    const raw = asRecord(item, `rules[${index}]`);
    if (typeof raw.id !== 'string' || raw.id.length === 0) {
      invalidSchema(`rules[${index}].id must be a non-empty string`);
    }
    return { ...raw, id: raw.id } as ReservedRuleSchema;
  });
}

export function normalizeYSchemaObject(rawInput: unknown): YSchema {
  const raw = asRecord(rawInput, 'schema');
  if (raw.yschema !== '0.1') {
    invalidSchema('yschema must be "0.1"');
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    invalidSchema('name must be a non-empty string');
  }
  if (raw.nodes === undefined) {
    invalidSchema('nodes is required');
  }

  const nodes = normalizeNodes(raw.nodes);
  const relationTypes = normalizeRelationTypes(
    getField(raw, 'relationTypes', 'relation_types'),
    nodes
  );

  const schema: YSchema = {
    yschema: '0.1',
    name: raw.name,
    strict: raw.strict === undefined ? false : asOptionalBoolean(raw.strict, 'strict'),
    nodes,
    rules: normalizeRules(raw.rules),
  };

  if (raw.version !== undefined) {
    if (typeof raw.version !== 'string' && typeof raw.version !== 'number') {
      invalidSchema('version must be a string or number');
    }
    schema.version = raw.version;
  }

  const description = asOptionalString(raw.description, 'description');
  if (description !== undefined) schema.description = description;

  if (relationTypes !== undefined) schema.relationTypes = relationTypes;

  return schema;
}

export function parseYSchema(yamlText: string): YSchema {
  const raw = yaml.load(yamlText);
  return normalizeYSchemaObject(raw);
}
