import type { YValue } from '@t3x-dev/yops';
import yaml from 'js-yaml';
import type {
  ContentKind,
  NodeSchema,
  RelationTypeSchema,
  RequiredRelationRuleSchema,
  ReservedRuleSchema,
  SlotSchema,
  SlotType,
  YOpsHint,
  YSchema,
  YSchemaRuleSchema,
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
const DEPRECATED_FIELD_REPLACEMENTS: Record<string, string> = {
  ask: 'gap_question',
  guidance: 'content_guidance',
  zone: 'content_kind',
};
const ROOT_FIELDS = new Set([
  'yschema',
  'name',
  'version',
  'description',
  'strict',
  'nodes',
  'relationTypes',
  'relation_types',
  'rules',
]);
const NODE_FIELDS = new Set([
  'required',
  'contentKind',
  'content_kind',
  'repeated',
  'description',
  'contentGuidance',
  'content_guidance',
  'requiredSlots',
  'required_slots',
  'slots',
  'children',
]);
const SLOT_FIELDS = new Set([
  'type',
  'enum',
  'const',
  'default',
  'description',
  'contentGuidance',
  'content_guidance',
  'examples',
  'minimum',
  'maximum',
  'minLength',
  'min_length',
  'maxLength',
  'max_length',
  'pattern',
  'format',
  'maxWords',
  'max_words',
  'gapQuestion',
  'gap_question',
  'contentKind',
  'content_kind',
  'provenanceRequired',
  'provenance_required',
  'yopsHint',
  'yops_hint',
]);
const YOPS_HINT_FIELDS = new Set(['preferredOp', 'preferred_op', 'path', 'slot']);
const RELATION_TYPE_FIELDS = new Set([
  'from',
  'to',
  'description',
  'contentGuidance',
  'content_guidance',
  'acyclic',
]);
const RESERVED_RULE_FIELDS = new Set(['id', 'description']);
const REQUIRED_RELATION_RULE_FIELDS = new Set([
  'id',
  'kind',
  'relationType',
  'relation_type',
  'from',
  'to',
  'description',
]);

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

function hasOwnField(record: Record<string, unknown>, field: string): boolean {
  return Object.hasOwn(record, field);
}

function getOwnField(record: Record<string, unknown>, field: string): unknown {
  return hasOwnField(record, field) ? record[field] : undefined;
}

function getField(record: Record<string, unknown>, camel: string, snake?: string): unknown {
  const camelValue = getOwnField(record, camel);
  const snakeValue = snake ? getOwnField(record, snake) : undefined;
  if (snake && camelValue !== undefined && snakeValue !== undefined) {
    invalidSchema(`${camel} and ${snake} cannot both be set`);
  }
  if (camelValue !== undefined) return camelValue;
  if (snake && snakeValue !== undefined) return snakeValue;
  return undefined;
}

function rejectDeprecatedFields(record: Record<string, unknown>, context: string): void {
  for (const [deprecated, replacement] of Object.entries(DEPRECATED_FIELD_REPLACEMENTS)) {
    if (getOwnField(record, deprecated) !== undefined) {
      invalidSchema(`${context}.${deprecated} is deprecated; use ${replacement}`);
    }
  }
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  context: string,
  allowedFields: ReadonlySet<string>
): void {
  for (const field of Object.keys(record)) {
    if (!allowedFields.has(field)) {
      invalidSchema(`${context}.${field} is an unknown field`);
    }
  }
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

function assertNonNegativeInteger(value: number, context: string): void {
  if (!Number.isInteger(value) || value < 0) {
    invalidSchema(`${context} must be a non-negative integer`);
  }
}

function assertPositiveInteger(value: number, context: string): void {
  if (!Number.isInteger(value) || value < 1) {
    invalidSchema(`${context} must be a positive integer`);
  }
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

function yValueEquals(a: YValue, b: YValue): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => yValueEquals(item, b[index]));
  }
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false;
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, index) => key === bKeys[index] && yValueEquals(a[key], b[key]));
  }
  return false;
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
  rejectUnknownFields(raw, context, YOPS_HINT_FIELDS);
  const preferredOp = getField(raw, 'preferredOp', 'preferred_op');
  const path = getOwnField(raw, 'path');
  const slot = getOwnField(raw, 'slot');
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
  rejectDeprecatedFields(raw, context);
  rejectUnknownFields(raw, context, SLOT_FIELDS);
  const typeValue = getOwnField(raw, 'type');
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

  const enumValue = getOwnField(raw, 'enum');
  const constValue = getOwnField(raw, 'const');
  const defaultValue = getOwnField(raw, 'default');
  const examples = getOwnField(raw, 'examples');
  const minimum = getOwnField(raw, 'minimum');
  const maximum = getOwnField(raw, 'maximum');
  const minLength = getField(raw, 'minLength', 'min_length');
  const maxLength = getField(raw, 'maxLength', 'max_length');
  const maxWords = getField(raw, 'maxWords', 'max_words');
  const provenanceRequired = getField(raw, 'provenanceRequired', 'provenance_required');
  const contentKind = getField(raw, 'contentKind', 'content_kind');
  const contentGuidance = getField(raw, 'contentGuidance', 'content_guidance');
  const gapQuestion = getField(raw, 'gapQuestion', 'gap_question');
  const yopsHint = getField(raw, 'yopsHint', 'yops_hint');

  const enumArray = asYValueArray(enumValue, `${context}.enum`);
  if (enumArray !== undefined) {
    if (enumArray.length === 0) invalidSchema(`${context}.enum must not be empty`);
    slot.enum = enumArray;
  }
  if (constValue !== undefined) slot.const = asYValue(constValue, `${context}.const`);
  if (defaultValue !== undefined) slot.default = asYValue(defaultValue, `${context}.default`);

  if (
    slot.enum &&
    slot.const !== undefined &&
    !slot.enum.some((item) => yValueEquals(item, slot.const!))
  ) {
    invalidSchema(`${context}.const must be one of ${context}.enum`);
  }
  if (
    slot.enum &&
    slot.default !== undefined &&
    !slot.enum.some((item) => yValueEquals(item, slot.default!))
  ) {
    invalidSchema(`${context}.default must be one of ${context}.enum`);
  }
  if (
    slot.const !== undefined &&
    slot.default !== undefined &&
    !yValueEquals(slot.const, slot.default)
  ) {
    invalidSchema(`${context}.default must equal ${context}.const`);
  }

  const exampleArray = asYValueArray(examples, `${context}.examples`);
  if (exampleArray !== undefined) slot.examples = exampleArray;

  const description = asOptionalString(getOwnField(raw, 'description'), `${context}.description`);
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
  if (
    normalizedMinimum !== undefined &&
    normalizedMaximum !== undefined &&
    normalizedMinimum > normalizedMaximum
  ) {
    invalidSchema(`${context}.minimum cannot be greater than ${context}.maximum`);
  }

  const normalizedMinLength = asOptionalNumber(minLength, `${context}.minLength`);
  if (normalizedMinLength !== undefined) {
    assertNonNegativeInteger(normalizedMinLength, `${context}.minLength`);
    slot.minLength = normalizedMinLength;
  }

  const normalizedMaxLength = asOptionalNumber(maxLength, `${context}.maxLength`);
  if (normalizedMaxLength !== undefined) {
    assertNonNegativeInteger(normalizedMaxLength, `${context}.maxLength`);
    slot.maxLength = normalizedMaxLength;
  }
  if (
    normalizedMinLength !== undefined &&
    normalizedMaxLength !== undefined &&
    normalizedMinLength > normalizedMaxLength
  ) {
    invalidSchema(`${context}.minLength cannot be greater than ${context}.maxLength`);
  }

  const pattern = asOptionalString(getOwnField(raw, 'pattern'), `${context}.pattern`);
  if (pattern !== undefined) {
    try {
      new RegExp(pattern);
    } catch (error) {
      invalidSchema(`${context}.pattern must be a valid regex: ${(error as Error).message}`);
    }
    slot.pattern = pattern;
  }

  const format = asOptionalString(getOwnField(raw, 'format'), `${context}.format`);
  if (format !== undefined) slot.format = format;

  const normalizedMaxWords = asOptionalNumber(maxWords, `${context}.maxWords`);
  if (normalizedMaxWords !== undefined) {
    assertPositiveInteger(normalizedMaxWords, `${context}.maxWords`);
    slot.maxWords = normalizedMaxWords;
  }

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
  rejectDeprecatedFields(raw, context);
  rejectUnknownFields(raw, context, NODE_FIELDS);
  const node: NodeSchema = {};

  const required = asOptionalBoolean(getOwnField(raw, 'required'), `${context}.required`);
  if (required !== undefined) node.required = required;

  const repeated = asOptionalBoolean(getOwnField(raw, 'repeated'), `${context}.repeated`);
  if (repeated !== undefined) node.repeated = repeated;

  const description = asOptionalString(getOwnField(raw, 'description'), `${context}.description`);
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

  const slots = normalizeSlots(getOwnField(raw, 'slots'), `${context}.slots`);
  if (slots !== undefined) node.slots = slots;

  const requiredSlots = asKeyArray(
    getField(raw, 'requiredSlots', 'required_slots'),
    `${context}.requiredSlots`
  );
  if (requiredSlots !== undefined) node.requiredSlots = requiredSlots;

  const childrenValue = getOwnField(raw, 'children');
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
      if (!node.slots || !hasOwnField(node.slots, slotKey)) {
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
    rejectDeprecatedFields(raw, `relationTypes.${typeKey}`);
    rejectUnknownFields(raw, `relationTypes.${typeKey}`, RELATION_TYPE_FIELDS);
    const fromValue = getOwnField(raw, 'from');
    const toValue = getOwnField(raw, 'to');
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

    const description = asOptionalString(
      getOwnField(raw, 'description'),
      `relationTypes.${typeKey}.description`
    );
    if (description !== undefined) relationType.description = description;

    const contentGuidance = asOptionalString(
      getField(raw, 'contentGuidance', 'content_guidance'),
      `relationTypes.${typeKey}.contentGuidance`
    );
    if (contentGuidance !== undefined) relationType.contentGuidance = contentGuidance;

    const acyclic = asOptionalBoolean(
      getOwnField(raw, 'acyclic'),
      `relationTypes.${typeKey}.acyclic`
    );
    if (acyclic !== undefined) relationType.acyclic = acyclic;

    relationTypes[typeKey] = relationType;
  }

  return relationTypes;
}

function normalizeReservedRule(raw: Record<string, unknown>, context: string): ReservedRuleSchema {
  rejectUnknownFields(raw, context, RESERVED_RULE_FIELDS);
  const id = getOwnField(raw, 'id');
  if (typeof id !== 'string' || id.length === 0) {
    invalidSchema(`${context}.id must be a non-empty string`);
  }
  const description = asOptionalString(getOwnField(raw, 'description'), `${context}.description`);
  return {
    id,
    ...(description !== undefined ? { description } : {}),
  };
}

function normalizeRequiredRelationRule(
  raw: Record<string, unknown>,
  context: string,
  nodes: Record<string, NodeSchema>,
  relationTypes: Record<string, RelationTypeSchema>
): RequiredRelationRuleSchema {
  rejectUnknownFields(raw, context, REQUIRED_RELATION_RULE_FIELDS);
  const id = getOwnField(raw, 'id');
  if (typeof id !== 'string' || id.length === 0) {
    invalidSchema(`${context}.id must be a non-empty string`);
  }
  const relationType = getField(raw, 'relationType', 'relation_type');
  if (typeof relationType !== 'string') {
    invalidSchema(`${context}.relationType must be a string`);
  }
  assertKey(relationType, `${context}.relationType`);
  if (!hasOwnField(relationTypes, relationType)) {
    invalidSchema(`${context}.relationType "${relationType}" is not declared in relationTypes`);
  }
  const from = getOwnField(raw, 'from');
  const to = getOwnField(raw, 'to');
  if (typeof from !== 'string') invalidSchema(`${context}.from must be a string`);
  if (typeof to !== 'string') invalidSchema(`${context}.to must be a string`);

  for (const [side, endpoint] of [
    ['from', from],
    ['to', to],
  ] as const) {
    const parsed = parseEndpointPattern(endpoint, `${context}.${side}`);
    const node = resolveNodePath(nodes, parsed.path);
    if (!node) {
      invalidSchema(`${context}.${side} endpoint "${endpoint}" does not resolve to a node`);
    }
    if (parsed.repeated && !node.repeated) {
      invalidSchema(`${context}.${side} endpoint "${endpoint}" requires a repeated node`);
    }
  }

  const description = asOptionalString(getOwnField(raw, 'description'), `${context}.description`);
  return {
    id,
    kind: 'required_relation',
    relationType,
    from,
    to,
    ...(description !== undefined ? { description } : {}),
  };
}

function normalizeRules(
  value: unknown,
  nodes: Record<string, NodeSchema>,
  relationTypes: Record<string, RelationTypeSchema>
): YSchemaRuleSchema[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidSchema('rules must be an array');
  return value.map((item, index) => {
    const raw = asRecord(item, `rules[${index}]`);
    const kind = getOwnField(raw, 'kind');
    if (kind === undefined) {
      return normalizeReservedRule(raw, `rules[${index}]`);
    }
    if (kind !== 'required_relation') {
      invalidSchema(`rules[${index}].kind must be required_relation`);
    }
    return normalizeRequiredRelationRule(raw, `rules[${index}]`, nodes, relationTypes);
  });
}

export function normalizeYSchemaObject(rawInput: unknown): YSchema {
  const raw = asRecord(rawInput, 'schema');
  rejectUnknownFields(raw, 'schema', ROOT_FIELDS);
  const yschema = getOwnField(raw, 'yschema');
  const name = getOwnField(raw, 'name');
  const rawNodes = getOwnField(raw, 'nodes');
  if (yschema !== '0.1') {
    invalidSchema('yschema must be "0.1"');
  }
  if (typeof name !== 'string' || name.length === 0) {
    invalidSchema('name must be a non-empty string');
  }
  if (rawNodes === undefined) {
    invalidSchema('nodes is required');
  }

  const nodes = normalizeNodes(rawNodes);
  const relationTypes = normalizeRelationTypes(
    getField(raw, 'relationTypes', 'relation_types'),
    nodes
  );
  const rules = normalizeRules(getOwnField(raw, 'rules'), nodes, relationTypes ?? {});
  const strict = getOwnField(raw, 'strict');

  const schema: YSchema = {
    yschema: '0.1',
    name,
    strict: strict === undefined ? false : asOptionalBoolean(strict, 'strict'),
    nodes,
    rules,
  };

  const version = getOwnField(raw, 'version');
  if (version !== undefined) {
    if (typeof version !== 'string' && typeof version !== 'number') {
      invalidSchema('version must be a string or number');
    }
    schema.version = version;
  }

  const description = asOptionalString(getOwnField(raw, 'description'), 'description');
  if (description !== undefined) schema.description = description;

  if (relationTypes !== undefined) schema.relationTypes = relationTypes;

  return schema;
}

export function parseYSchema(yamlText: string): YSchema {
  const raw = yaml.load(yamlText);
  return normalizeYSchemaObject(raw);
}
