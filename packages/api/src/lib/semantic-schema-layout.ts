import { createRepositorySemanticState, repositorySemanticYSchemaTree } from '@t3x-dev/core';
import { type NodeSchema, validateTree, type YSchema } from '@t3x-dev/yschema';
import { schemaRootKeyFromBinding } from './yschema-registry';

export interface SemanticSchemaLayoutSlot {
  key: string;
  required: boolean;
  type?: string;
  enum?: unknown[];
  description?: string;
}

export interface SemanticSchemaLayoutNode {
  /** YSchema node path, e.g. "requirements" or "summary/details". */
  node: string;
  /** YOps path of the tree node that represents this schema node. */
  path: string;
  required: boolean;
  repeated: boolean;
  /** Repeated nodes only: each item is one child tree at this path. */
  itemPath?: string;
  /** Where this node's (or each item's) slots live. */
  slotsPath: string;
  slots: SemanticSchemaLayoutSlot[];
  /** Child trees beyond the declared schema nodes are allowed. */
  openChildren?: true;
  description?: string;
}

/**
 * Exact t3x.dev/semantic-content placement of a bound YSchema: one root tree keyed by
 * rootKey, schema nodes as its child trees, and repeated items as child trees of their node.
 */
export interface SemanticSchemaLayout {
  schema: 't3x.dev/semantic-schema-layout/v1';
  rootKey: string;
  rootPath: string;
  itemKeyPattern: string;
  nodes: SemanticSchemaLayoutNode[];
}

const ITEM_KEY_PLACEHOLDER = '<item_key>';

function layoutNodes(
  nodes: Record<string, NodeSchema>,
  parentNode: string,
  parentPath: string
): SemanticSchemaLayoutNode[] {
  return Object.entries(nodes).flatMap(([key, node]) => {
    const nodePath = parentNode ? `${parentNode}/${key}` : key;
    const path = `${parentPath}/children/[key=${key}]`;
    const repeated = node.repeated === true;
    const itemPath = repeated ? `${path}/children/[key=${ITEM_KEY_PLACEHOLDER}]` : undefined;
    const requiredSlots = new Set(node.requiredSlots ?? []);
    const entry: SemanticSchemaLayoutNode = {
      node: nodePath,
      path,
      required: node.required === true,
      repeated,
      ...(itemPath ? { itemPath } : {}),
      slotsPath: `${itemPath ?? path}/slots`,
      slots: Object.entries(node.slots ?? {}).map(([slotKey, slot]) => ({
        key: slotKey,
        required: requiredSlots.has(slotKey),
        ...(slot.type ? { type: slot.type } : {}),
        ...(slot.enum ? { enum: slot.enum } : {}),
        ...(slot.description ? { description: slot.description } : {}),
      })),
      ...(node.children === 'any' ? { openChildren: true as const } : {}),
      ...(node.description ? { description: node.description } : {}),
    };
    const children =
      node.children && node.children !== 'any' ? layoutNodes(node.children, nodePath, path) : [];
    return [entry, ...children];
  });
}

/** Layout for the Workspace's single schema binding, using the same root key as Review. */
export function workspaceSemanticSchemaLayout(
  workspace: Record<string, unknown>,
  schema: YSchema
): SemanticSchemaLayout {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  return semanticSchemaLayout(schema, schemaRootKeyFromBinding(bindings[0]));
}

export function semanticSchemaLayout(schema: YSchema, rootKey: string): SemanticSchemaLayout {
  const rootPath = `content/trees/[key=${rootKey}]`;
  return {
    schema: 't3x.dev/semantic-schema-layout/v1',
    rootKey,
    rootPath,
    itemKeyPattern: '^[a-z][a-z0-9_]*$',
    nodes: layoutNodes(schema.nodes, '', rootPath),
  };
}

export interface SemanticLayoutIssue {
  code: string;
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Structural issues of a semantic-content document against its layout: exactly one root tree,
 * and the root validated by YSchema as strict, since generated content must not rely on a
 * non-strict schema silently ignoring misplaced nodes. Gaps are not issues; drafts may be partial.
 */
export function semanticLayoutIssues(
  document: unknown,
  schema: YSchema,
  rootKey: string
): SemanticLayoutIssue[] {
  if (!isRecord(document) || document.domain !== 't3x.dev/semantic-content') return [];
  let state: ReturnType<typeof createRepositorySemanticState>;
  try {
    state = createRepositorySemanticState(document.content as never);
  } catch (error) {
    return [
      {
        code: 'INVALID_SEMANTIC_CONTENT',
        path: 'content',
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  const trees = (document.content as { trees: { key: string }[] }).trees;
  const issues: SemanticLayoutIssue[] = trees
    .filter((tree) => tree.key !== rootKey)
    .map((tree) => ({
      code: 'UNEXPECTED_ROOT_TREE',
      path: `content/trees/[key=${tree.key}]`,
      message: `content/trees may hold only the ${rootKey} root tree; place this node at its schemaLayout position inside content/trees/[key=${rootKey}].`,
    }));
  const roots = trees.filter((tree) => tree.key === rootKey).length;
  if (roots !== 1) {
    issues.push({
      code: 'ROOT_TREE_COUNT',
      path: 'content/trees',
      message: `content/trees must contain exactly one ${rootKey} root tree; found ${roots}.`,
    });
    return issues;
  }
  const result = validateTree({
    tree: repositorySemanticYSchemaTree(state, rootKey),
    schema: { ...schema, strict: true },
  });
  for (const error of result.errors) {
    issues.push({
      code: error.code,
      path: `${rootKey}/${error.path}`,
      message: error.message,
    });
  }
  return issues;
}

/** Issues present after an edit that were not already present before it. */
export function newSemanticLayoutIssues(
  before: unknown,
  after: unknown,
  schema: YSchema,
  rootKey: string
): SemanticLayoutIssue[] {
  const key = (issue: SemanticLayoutIssue) => `${issue.code}\u0000${issue.path}`;
  const existing = new Set(semanticLayoutIssues(before, schema, rootKey).map(key));
  return semanticLayoutIssues(after, schema, rootKey).filter((issue) => !existing.has(key(issue)));
}
