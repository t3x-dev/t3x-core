import type { YValue } from '@t3x-dev/yops';
import type {
  FixProposal,
  NodeSchema,
  ProvenanceRef,
  SlotSchema,
  SlotType,
  ValidationError,
  ValidationErrorCode,
  ValidationGap,
  ValidationGapCode,
  ValidationInput,
  ValidationLocation,
  ValidationResult,
  YSchema,
  YSchemaKey,
  YSchemaPath,
  YSchemaRelation,
} from './types';

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const PATH_RE = /^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*$/;

interface ValidationState {
  schema: YSchema;
  tree: YValue;
  errors: ValidationError[];
  gaps: ValidationGap[];
  fixes: FixProposal[];
  fixIds: Set<string>;
  provenanceByPath: NonNullable<ValidationInput['provenanceByPath']>;
}

interface RelationEdge {
  from: YSchemaPath;
  to: YSchemaPath;
}

function isMapping(value: YValue | undefined): value is Record<string, YValue> {
  return (
    value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
  );
}

function isYValueEqual(left: YValue, right: YValue): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isYValueEqual(item, right[index] as YValue))
    );
  }
  if (isMapping(left) || isMapping(right)) {
    if (!isMapping(left) || !isMapping(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) => rightKeys.includes(key) && isYValueEqual(left[key] as YValue, right[key] as YValue)
      )
    );
  }
  return false;
}

function actualType(value: YValue): SlotType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function articleFor(type: string): string {
  return /^[aeiou]/.test(type) ? 'an' : 'a';
}

function matchesType(value: YValue, expected: SlotType): boolean {
  switch (expected) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isMapping(value);
    case 'string':
      return typeof value === 'string';
  }
}

function resolvePath(root: YValue, path: YSchemaPath): YValue | undefined {
  if (!PATH_RE.test(path)) return undefined;
  let current: YValue | undefined = root;
  for (const segment of path.split('/')) {
    if (!isMapping(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function joinPath(path: YSchemaPath, key: YSchemaKey): YSchemaPath {
  return `${path}/${key}`;
}

function pathSlug(path: YSchemaPath): string {
  return path.replace(/\//g, '-');
}

function pushError(
  state: ValidationState,
  code: ValidationErrorCode,
  path: ValidationLocation,
  message: string,
  details?: Record<string, unknown>
): void {
  const error: ValidationError = { code, path, message };
  if (details !== undefined) error.details = details;
  state.errors.push(error);
}

function pushGap(
  state: ValidationState,
  code: ValidationGapCode,
  path: YSchemaPath,
  message: string,
  options: {
    gapQuestion?: string;
    fixIds?: string[];
    details?: Record<string, unknown>;
  } = {}
): void {
  const gap: ValidationGap = { code, path, message };
  if (options.gapQuestion !== undefined) gap.gapQuestion = options.gapQuestion;
  if (options.fixIds !== undefined) gap.fixIds = options.fixIds;
  if (options.details !== undefined) gap.details = options.details;
  state.gaps.push(gap);
}

function addFix(state: ValidationState, fix: FixProposal): void {
  if (state.fixIds.has(fix.id)) return;
  state.fixIds.add(fix.id);
  state.fixes.push(fix);
}

function addDefaultFix(
  state: ValidationState,
  slotKey: YSchemaKey,
  slotPath: YSchemaPath,
  slot: SlotSchema,
  code: string
): string {
  const id = `set-${pathSlug(slotPath)}-default`;
  addFix(state, {
    id,
    code,
    path: slotPath,
    title: `Use default ${slotKey}`,
    applyMode: 'automatic_after_review',
    ops: [
      {
        set: {
          path: slotPath,
          value: slot.default as YValue,
        },
      },
    ],
  });
  return id;
}

function addDefineFix(state: ValidationState, path: YSchemaPath): string {
  const id = `define-${pathSlug(path)}`;
  addFix(state, {
    id,
    code: 'REQUIRED_NODE_MISSING',
    path,
    title: 'Create required node',
    applyMode: 'requires_user_input',
    ops: [{ define: { path } }],
  });
  return id;
}

function hasAcceptedEvidence(refs: ProvenanceRef[] | undefined): boolean {
  if (refs === undefined) return false;
  return refs.some((ref) => {
    if (ref.origin === 'user_evidence') {
      return Boolean(ref.sourceId || ref.turnHash || ref.quote || ref.approved);
    }
    if (ref.origin === 'ai_paraphrase_approved') return ref.approved === true;
    if (ref.origin === 'schema_default') return ref.approved === true;
    return false;
  });
}

function resolveNodeSchema(schema: YSchema, path: YSchemaPath): NodeSchema | undefined {
  if (!PATH_RE.test(path)) return undefined;
  const segments = path.split('/');
  let current: NodeSchema | undefined = schema.nodes[segments[0] as string];
  for (const segment of segments.slice(1)) {
    if (current === undefined || current.children === undefined || current.children === 'any') {
      return undefined;
    }
    current = current.children[segment];
  }
  return current;
}

function validateNodeSchemaShape(
  state: ValidationState,
  nodePath: YSchemaPath,
  node: NodeSchema
): void {
  const slots = node.slots ?? {};
  for (const slotKey of Object.keys(slots)) {
    if (!KEY_RE.test(slotKey)) {
      pushError(
        state,
        'INVALID_SCHEMA',
        `${nodePath}/${slotKey}`,
        `Schema slot key "${slotKey}" is invalid.`
      );
    }
  }

  for (const requiredSlot of node.requiredSlots ?? []) {
    if (!KEY_RE.test(requiredSlot)) {
      pushError(
        state,
        'INVALID_SCHEMA',
        `${nodePath}/${requiredSlot}`,
        `requiredSlots entry "${requiredSlot}" is invalid.`
      );
    } else if (!(requiredSlot in slots)) {
      pushError(
        state,
        'INVALID_SCHEMA',
        `${nodePath}/${requiredSlot}`,
        `requiredSlots entry "${requiredSlot}" is not declared in slots.`
      );
    }
  }

  if (node.repeated === true && node.children !== undefined) {
    pushError(
      state,
      'INVALID_SCHEMA',
      nodePath,
      `${nodePath} cannot combine repeated with children.`
    );
  }

  if (node.children !== undefined && node.children !== 'any') {
    for (const [childKey, child] of Object.entries(node.children)) {
      if (!KEY_RE.test(childKey)) {
        pushError(
          state,
          'INVALID_SCHEMA',
          joinPath(nodePath, childKey),
          `Schema child key "${childKey}" is invalid.`
        );
      }
      validateNodeSchemaShape(state, joinPath(nodePath, childKey), child);
    }
  }
}

function validateRelationEndpointSchema(
  state: ValidationState,
  relationType: YSchemaKey,
  side: 'from' | 'to',
  pattern: string
): void {
  if (pattern.includes('*') && !pattern.endsWith('/*')) {
    pushError(
      state,
      'INVALID_SCHEMA',
      '$relations',
      `relationTypes.${relationType}.${side} endpoint "${pattern}" must be a path or path/*.`,
      { relationType, side, pattern }
    );
    return;
  }

  const repeated = pattern.endsWith('/*');
  const nodePath = repeated ? pattern.slice(0, -2) : pattern;
  if (!PATH_RE.test(nodePath)) {
    pushError(
      state,
      'INVALID_SCHEMA',
      '$relations',
      `relationTypes.${relationType}.${side} endpoint "${pattern}" is invalid.`,
      { relationType, side, pattern }
    );
    return;
  }

  const node = resolveNodeSchema(state.schema, nodePath);
  if (node === undefined) {
    pushError(
      state,
      'INVALID_SCHEMA',
      '$relations',
      `relationTypes.${relationType}.${side} endpoint "${pattern}" does not resolve to a node.`,
      { relationType, side, pattern }
    );
    return;
  }

  if (repeated && node.repeated !== true) {
    pushError(
      state,
      'INVALID_SCHEMA',
      '$relations',
      `relationTypes.${relationType}.${side} endpoint "${pattern}" requires a repeated node.`,
      { relationType, side, pattern }
    );
  }
}

function validateSchemaShape(state: ValidationState): void {
  for (const [nodeKey, node] of Object.entries(state.schema.nodes)) {
    if (!KEY_RE.test(nodeKey)) {
      pushError(state, 'INVALID_SCHEMA', nodeKey, `Schema node key "${nodeKey}" is invalid.`);
    }
    validateNodeSchemaShape(state, nodeKey, node);
  }
  for (const [relationType, relationTypeSchema] of Object.entries(
    state.schema.relationTypes ?? {}
  )) {
    if (!KEY_RE.test(relationType)) {
      pushError(
        state,
        'INVALID_SCHEMA',
        '$relations',
        `Relation type "${relationType}" is invalid.`
      );
    }
    validateRelationEndpointSchema(state, relationType, 'from', relationTypeSchema.from);
    validateRelationEndpointSchema(state, relationType, 'to', relationTypeSchema.to);
  }
}

function validateSlotValue(
  state: ValidationState,
  slotKey: YSchemaKey,
  slotPath: YSchemaPath,
  slot: SlotSchema,
  value: YValue
): boolean {
  let valid = true;

  if (slot.type !== undefined && !matchesType(value, slot.type)) {
    pushError(
      state,
      'INVALID_TYPE',
      slotPath,
      `${slotKey} must be ${articleFor(slot.type)} ${slot.type}`,
      {
        expected: slot.type,
        actual: actualType(value),
      }
    );
    valid = false;
  }

  if (slot.enum !== undefined && !slot.enum.some((allowed) => isYValueEqual(allowed, value))) {
    pushError(
      state,
      'INVALID_ENUM',
      slotPath,
      `${slotKey} must be one of ${slot.enum.join(', ')}`,
      {
        allowed: slot.enum,
        actual: value,
      }
    );
    if (slot.default !== undefined) {
      addDefaultFix(state, slotKey, slotPath, slot, 'INVALID_ENUM');
    }
    valid = false;
  }

  if (slot.const !== undefined && !isYValueEqual(slot.const, value)) {
    pushError(state, 'INVALID_CONST', slotPath, `${slotKey} must equal the schema constant.`, {
      expected: slot.const,
      actual: value,
    });
    valid = false;
  }

  if (typeof value === 'number') {
    if (slot.minimum !== undefined && value < slot.minimum) {
      pushError(state, 'INVALID_RANGE', slotPath, `${slotKey} must be at least ${slot.minimum}.`, {
        minimum: slot.minimum,
        actual: value,
      });
      valid = false;
    }
    if (slot.maximum !== undefined && value > slot.maximum) {
      pushError(state, 'INVALID_RANGE', slotPath, `${slotKey} must be at most ${slot.maximum}.`, {
        maximum: slot.maximum,
        actual: value,
      });
      valid = false;
    }
  }

  if (typeof value === 'string') {
    if (slot.minLength !== undefined && value.length < slot.minLength) {
      pushError(
        state,
        'INVALID_LENGTH',
        slotPath,
        `${slotKey} must be at least ${slot.minLength} characters.`,
        {
          minLength: slot.minLength,
          actual: value.length,
        }
      );
      valid = false;
    }
    if (slot.maxLength !== undefined && value.length > slot.maxLength) {
      pushError(
        state,
        'INVALID_LENGTH',
        slotPath,
        `${slotKey} must be at most ${slot.maxLength} characters.`,
        {
          maxLength: slot.maxLength,
          actual: value.length,
        }
      );
      valid = false;
    }
    if (slot.maxWords !== undefined) {
      const wordCount = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
      if (wordCount > slot.maxWords) {
        pushError(
          state,
          'INVALID_LENGTH',
          slotPath,
          `${slotKey} must be at most ${slot.maxWords} words.`,
          {
            maxWords: slot.maxWords,
            actual: wordCount,
          }
        );
        valid = false;
      }
    }
    if (slot.pattern !== undefined && !new RegExp(slot.pattern).test(value)) {
      pushError(state, 'INVALID_PATTERN', slotPath, `${slotKey} must match ${slot.pattern}.`, {
        pattern: slot.pattern,
        actual: value,
      });
      valid = false;
    }
  }

  if (Array.isArray(value)) {
    if (slot.minLength !== undefined && value.length < slot.minLength) {
      pushError(
        state,
        'INVALID_LENGTH',
        slotPath,
        `${slotKey} must contain at least ${slot.minLength} items.`,
        {
          minLength: slot.minLength,
          actual: value.length,
        }
      );
      valid = false;
    }
    if (slot.maxLength !== undefined && value.length > slot.maxLength) {
      pushError(
        state,
        'INVALID_LENGTH',
        slotPath,
        `${slotKey} must contain at most ${slot.maxLength} items.`,
        {
          maxLength: slot.maxLength,
          actual: value.length,
        }
      );
      valid = false;
    }
  }

  return valid;
}

function validateSlots(
  state: ValidationState,
  nodePath: YSchemaPath,
  node: NodeSchema,
  value: Record<string, YValue>
): void {
  const slots = node.slots ?? {};
  const requiredSlots = new Set(node.requiredSlots ?? []);

  for (const [slotKey, slot] of Object.entries(slots)) {
    const slotPath = joinPath(nodePath, slotKey);
    const slotValue = value[slotKey];
    const required = requiredSlots.has(slotKey);

    if (slotValue === undefined) {
      if (slot.default !== undefined) {
        const code = required ? 'DEFAULT_REQUIRES_APPROVAL' : 'OPTIONAL_DEFAULT';
        const fixId = addDefaultFix(state, slotKey, slotPath, slot, code);
        if (required) {
          pushGap(
            state,
            'DEFAULT_REQUIRES_APPROVAL',
            slotPath,
            `${slotPath} can use a schema default after review.`,
            {
              gapQuestion: slot.gapQuestion,
              fixIds: [fixId],
            }
          );
        }
      } else if (required) {
        pushGap(
          state,
          'REQUIRED_SLOT_MISSING',
          slotPath,
          `${slotPath} is required before commit.`,
          {
            gapQuestion: slot.gapQuestion,
          }
        );
      }
      continue;
    }

    const slotValueIsValid = validateSlotValue(state, slotKey, slotPath, slot, slotValue);
    if (
      slotValueIsValid &&
      slot.provenanceRequired === true &&
      !hasAcceptedEvidence(state.provenanceByPath[slotPath])
    ) {
      pushGap(
        state,
        'REQUIRED_EVIDENCE_MISSING',
        slotPath,
        `${slotPath} needs accepted source evidence.`,
        {
          gapQuestion: slot.gapQuestion,
        }
      );
    }
  }
}

function validateUnexpectedKeys(
  state: ValidationState,
  nodePath: YSchemaPath,
  node: NodeSchema,
  value: Record<string, YValue>
): void {
  if (state.schema.strict !== true) return;

  const allowed = new Set(Object.keys(node.slots ?? {}));
  const allowsAnyChild = node.children === 'any';
  if (!allowsAnyChild && node.children !== undefined) {
    for (const childKey of Object.keys(node.children)) allowed.add(childKey);
  }

  for (const key of Object.keys(value)) {
    if (allowed.has(key) || allowsAnyChild) continue;
    pushError(
      state,
      'UNEXPECTED_SLOT',
      joinPath(nodePath, key),
      `${joinPath(nodePath, key)} is not declared in schema.`
    );
  }
}

function validateNodeBody(
  state: ValidationState,
  nodePath: YSchemaPath,
  node: NodeSchema,
  value: Record<string, YValue>
): void {
  validateSlots(state, nodePath, node, value);

  if (node.children !== undefined && node.children !== 'any') {
    for (const [childKey, childNode] of Object.entries(node.children)) {
      validateNode(state, joinPath(nodePath, childKey), childNode, value[childKey]);
    }
  }

  validateUnexpectedKeys(state, nodePath, node, value);
}

function validateNode(
  state: ValidationState,
  nodePath: YSchemaPath,
  node: NodeSchema,
  nodeValue: YValue | undefined
): void {
  if (node.required === true && nodeValue === undefined) {
    const fixId = addDefineFix(state, nodePath);
    pushGap(state, 'REQUIRED_NODE_MISSING', nodePath, `${nodePath} is required before commit.`, {
      fixIds: [fixId],
    });
    return;
  }

  if (nodeValue === undefined) return;

  if (node.repeated === true) {
    if (!isMapping(nodeValue)) {
      pushError(
        state,
        'INVALID_TYPE',
        nodePath,
        `${nodePath} must be an object of repeated items.`,
        {
          expected: 'object',
          actual: actualType(nodeValue),
        }
      );
      return;
    }

    for (const [itemKey, itemValue] of Object.entries(nodeValue)) {
      const itemPath = joinPath(nodePath, itemKey);
      if (!KEY_RE.test(itemKey)) {
        pushError(
          state,
          'INVALID_REPEATED_ITEM_KEY',
          itemPath,
          `${itemPath} must use a machine-safe repeated item key.`,
          {
            keyPattern: KEY_RE.source,
          }
        );
      }
      if (!isMapping(itemValue)) {
        pushError(state, 'INVALID_TYPE', itemPath, `${itemPath} must be an object.`, {
          expected: 'object',
          actual: actualType(itemValue),
        });
        continue;
      }
      validateNodeBody(state, itemPath, node, itemValue);
    }
    return;
  }

  const expectsMapping = node.slots !== undefined || node.children !== undefined;
  if (expectsMapping && !isMapping(nodeValue)) {
    pushError(state, 'INVALID_TYPE', nodePath, `${nodePath} must be an object.`, {
      expected: 'object',
      actual: actualType(nodeValue),
    });
    return;
  }

  if (isMapping(nodeValue)) validateNodeBody(state, nodePath, node, nodeValue);
}

function validateTopLevelUnexpectedNodes(state: ValidationState): void {
  if (state.schema.strict !== true || !isMapping(state.tree)) return;
  const declaredNodes = new Set(Object.keys(state.schema.nodes));
  for (const key of Object.keys(state.tree)) {
    if (!declaredNodes.has(key)) {
      pushError(state, 'UNEXPECTED_NODE', key, `${key} is not declared in schema.`);
    }
  }
}

function endpointMatches(pattern: string, path: YSchemaPath): boolean {
  const patternSegments = pattern.split('/');
  const pathSegments = path.split('/');
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every(
    (segment, index) => segment === '*' || segment === pathSegments[index]
  );
}

function relationKey(relation: YSchemaRelation): string {
  return `${relation.type}\u0000${relation.from}\u0000${relation.to}`;
}

function pushRelationError(
  state: ValidationState,
  code: ValidationErrorCode,
  message: string,
  details?: Record<string, unknown>
): void {
  pushError(state, code, '$relations', message, details);
}

function findCycle(edges: RelationEdge[]): YSchemaPath[] | undefined {
  const adjacency = new Map<YSchemaPath, YSchemaPath[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
  }

  const visiting = new Set<YSchemaPath>();
  const visited = new Set<YSchemaPath>();
  const stack: YSchemaPath[] = [];

  const visit = (node: YSchemaPath): YSchemaPath[] | undefined => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return undefined;

    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle !== undefined) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  };

  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

function validateRelations(state: ValidationState, relations: YSchemaRelation[]): void {
  const relationTypes = state.schema.relationTypes ?? {};
  const seen = new Set<string>();
  const acyclicEdges = new Map<YSchemaKey, RelationEdge[]>();

  relations.forEach((relation, index) => {
    const relationType = relationTypes[relation.type];
    if (relationType === undefined) {
      pushRelationError(
        state,
        'INVALID_RELATION_TYPE',
        `Relation type "${relation.type}" is not declared.`,
        {
          index,
          relation,
        }
      );
      return;
    }

    const endpoints: Array<['from' | 'to', YSchemaPath, string]> = [
      ['from', relation.from, relationType.from],
      ['to', relation.to, relationType.to],
    ];
    let structurallyValid = true;
    for (const [side, endpoint, pattern] of endpoints) {
      if (!PATH_RE.test(endpoint)) {
        pushRelationError(
          state,
          'INVALID_RELATION_ENDPOINT',
          `${side} endpoint "${endpoint}" is invalid.`,
          {
            index,
            side,
            endpoint,
          }
        );
        structurallyValid = false;
        continue;
      }
      if (resolvePath(state.tree, endpoint) === undefined) {
        pushRelationError(
          state,
          'BROKEN_RELATION_ENDPOINT',
          `${side} endpoint "${endpoint}" does not exist.`,
          {
            index,
            side,
            endpoint,
          }
        );
        structurallyValid = false;
      }
      if (!endpointMatches(pattern, endpoint)) {
        pushRelationError(
          state,
          'RELATION_ENDPOINT_MISMATCH',
          `${side} endpoint "${endpoint}" does not match ${pattern}.`,
          {
            index,
            side,
            endpoint,
            pattern,
          }
        );
        structurallyValid = false;
      }
    }

    if (relation.from === relation.to) {
      pushRelationError(
        state,
        'SELF_RELATION',
        `Relation "${relation.type}" cannot point to itself.`,
        {
          index,
          relation,
        }
      );
    }

    const key = relationKey(relation);
    if (seen.has(key)) {
      pushRelationError(state, 'DUPLICATE_RELATION', `Relation "${relation.type}" is duplicated.`, {
        index,
        relation,
      });
      structurallyValid = false;
    } else {
      seen.add(key);
    }

    if (
      structurallyValid &&
      relationType.acyclic === true &&
      !seenDuplicateBefore(relation, relations, index)
    ) {
      const edges = acyclicEdges.get(relation.type) ?? [];
      edges.push({ from: relation.from, to: relation.to });
      acyclicEdges.set(relation.type, edges);
    }
  });

  for (const [type, edges] of acyclicEdges) {
    const cycle = findCycle(edges);
    if (cycle !== undefined) {
      pushRelationError(state, 'RELATION_CYCLE', `Relation type "${type}" must be acyclic.`, {
        type,
        cycle,
      });
    }
  }
}

function seenDuplicateBefore(
  relation: YSchemaRelation,
  relations: YSchemaRelation[],
  index: number
): boolean {
  const key = relationKey(relation);
  return relations.slice(0, index).some((candidate) => relationKey(candidate) === key);
}

function gapRank(code: ValidationGapCode): number {
  switch (code) {
    case 'REQUIRED_NODE_MISSING':
      return 0;
    case 'REQUIRED_SLOT_MISSING':
      return 1;
    case 'DEFAULT_REQUIRES_APPROVAL':
      return 2;
    case 'REQUIRED_EVIDENCE_MISSING':
      return 3;
    case 'USER_CHOICE_REQUIRED':
      return 4;
    case 'USER_INPUT_REQUIRED':
      return 5;
  }
}

function compareGaps(left: ValidationGap, right: ValidationGap): number {
  const rankDelta = gapRank(left.code) - gapRank(right.code);
  if (rankDelta !== 0) return rankDelta;
  return left.path.localeCompare(right.path);
}

export function validateTree(input: ValidationInput): ValidationResult {
  const state: ValidationState = {
    schema: input.schema,
    tree: input.tree,
    errors: [],
    gaps: [],
    fixes: [],
    fixIds: new Set(),
    provenanceByPath: input.provenanceByPath ?? {},
  };

  validateSchemaShape(state);

  if (!isMapping(input.tree)) {
    pushError(state, 'INVALID_TYPE', '$root', 'Tree root must be an object.', {
      expected: 'object',
      actual: actualType(input.tree),
    });
  } else {
    validateTopLevelUnexpectedNodes(state);
    for (const [nodeKey, node] of Object.entries(input.schema.nodes)) {
      validateNode(state, nodeKey, node, input.tree[nodeKey]);
    }
  }

  validateRelations(state, input.relations ?? []);

  return {
    valid: state.errors.length === 0,
    ready: state.errors.length === 0 && state.gaps.length === 0,
    errors: state.errors,
    gaps: [...state.gaps].sort(compareGaps),
    fixes: state.fixes,
  };
}
