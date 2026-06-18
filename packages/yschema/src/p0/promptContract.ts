import type { YValue } from '@t3x-dev/yops';
import type {
  NodeSchema,
  PromptContract,
  PromptNodeContract,
  PromptRelationTypeContract,
  PromptSlotContract,
  SlotSchema,
  YSchema,
  YSchemaKey,
  YSchemaPath,
} from './types';

function isRecord(value: YValue): value is Record<string, YValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneYValue<T extends YValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneYValue(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneYValue(item)])
    ) as T;
  }
  return value;
}

function slotPath(
  nodePath: YSchemaPath,
  repeated: boolean | undefined,
  slotKey: YSchemaKey
): string {
  return repeated ? `${nodePath}/*/${slotKey}` : `${nodePath}/${slotKey}`;
}

function buildPromptSlot(
  nodePath: YSchemaPath,
  repeated: boolean | undefined,
  slotKey: YSchemaKey,
  slot: SlotSchema
): PromptSlotContract {
  const promptSlot: PromptSlotContract = {
    path: slotPath(nodePath, repeated, slotKey),
    key: slotKey,
  };

  if (slot.type !== undefined) promptSlot.type = slot.type;
  if (slot.enum !== undefined) promptSlot.enum = slot.enum.map((value) => cloneYValue(value));
  if (slot.const !== undefined) promptSlot.const = cloneYValue(slot.const);
  if (slot.default !== undefined) promptSlot.default = cloneYValue(slot.default);
  if (slot.description !== undefined) promptSlot.description = slot.description;
  if (slot.contentGuidance !== undefined) promptSlot.contentGuidance = slot.contentGuidance;
  if (slot.contentKind !== undefined) promptSlot.contentKind = slot.contentKind;
  if (slot.examples !== undefined) {
    promptSlot.examples = slot.examples.map((value) => cloneYValue(value));
  }
  if (slot.minimum !== undefined) promptSlot.minimum = slot.minimum;
  if (slot.maximum !== undefined) promptSlot.maximum = slot.maximum;
  if (slot.minLength !== undefined) promptSlot.minLength = slot.minLength;
  if (slot.maxLength !== undefined) promptSlot.maxLength = slot.maxLength;
  if (slot.maxWords !== undefined) promptSlot.maxWords = slot.maxWords;
  if (slot.pattern !== undefined) promptSlot.pattern = slot.pattern;
  if (slot.format !== undefined) promptSlot.format = slot.format;
  if (slot.provenanceRequired !== undefined) {
    promptSlot.provenanceRequired = slot.provenanceRequired;
  }
  if (slot.gapQuestion !== undefined) promptSlot.gapQuestion = slot.gapQuestion;
  if (slot.yopsHint !== undefined) promptSlot.yopsHint = { ...slot.yopsHint };

  return promptSlot;
}

function buildPromptNode(path: YSchemaPath, node: NodeSchema): PromptNodeContract {
  const promptNode: PromptNodeContract = {
    path,
    slots: Object.entries(node.slots ?? {}).map(([slotKey, slot]) =>
      buildPromptSlot(path, node.repeated, slotKey, slot)
    ),
  };

  if (node.contentKind !== undefined) promptNode.contentKind = node.contentKind;
  if (node.repeated !== undefined) promptNode.repeated = node.repeated;
  if (node.required !== undefined) promptNode.required = node.required;
  if (node.description !== undefined) promptNode.description = node.description;
  if (node.contentGuidance !== undefined) promptNode.contentGuidance = node.contentGuidance;
  if (node.requiredSlots !== undefined) promptNode.requiredSlots = [...node.requiredSlots];

  return promptNode;
}

function collectPromptNodes(
  nodes: Record<YSchemaKey, NodeSchema>,
  parentPath?: YSchemaPath
): PromptNodeContract[] {
  const promptNodes: PromptNodeContract[] = [];

  for (const [nodeKey, node] of Object.entries(nodes)) {
    const path = parentPath === undefined ? nodeKey : `${parentPath}/${nodeKey}`;
    promptNodes.push(buildPromptNode(path, node));

    if (node.children !== undefined && node.children !== 'any') {
      promptNodes.push(...collectPromptNodes(node.children, path));
    }
  }

  return promptNodes;
}

function buildPromptRelationTypes(
  relationTypes: YSchema['relationTypes']
): PromptRelationTypeContract[] | undefined {
  if (relationTypes === undefined) return undefined;

  return Object.entries(relationTypes).map(([type, relationType]) => {
    const promptRelationType: PromptRelationTypeContract = {
      type,
      from: relationType.from,
      to: relationType.to,
    };

    if (relationType.description !== undefined) {
      promptRelationType.description = relationType.description;
    }
    if (relationType.contentGuidance !== undefined) {
      promptRelationType.contentGuidance = relationType.contentGuidance;
    }
    if (relationType.acyclic !== undefined) promptRelationType.acyclic = relationType.acyclic;

    return promptRelationType;
  });
}

export function generatePromptContract(schema: YSchema): PromptContract {
  const contract: PromptContract = {
    schemaName: schema.name,
    nodes: collectPromptNodes(schema.nodes),
  };

  if (schema.version !== undefined) contract.schemaVersion = schema.version;
  if (schema.description !== undefined) contract.description = schema.description;

  const relationTypes = buildPromptRelationTypes(schema.relationTypes);
  if (relationTypes !== undefined) contract.relationTypes = relationTypes;

  return contract;
}
