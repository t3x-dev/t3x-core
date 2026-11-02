import type { SchemaPreparationPreview, TransitionProtocolValue } from '@t3x-dev/api-client';
import { draftPathSegment, isSemanticEnvelope } from '@/domain/workspaces/draftStructure';
import { editablePreparationCommand, type PreparationChange } from './SchemaPreparationFields';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Resolve validation's logical path to an explicit edit in the original document. */
export function requiredContentChange(
  data: SchemaPreparationPreview,
  issue: SchemaPreparationPreview['issues'][number]
): PreparationChange | undefined {
  const nodeMissing = issue.code === 'REQUIRED_NODE_MISSING';
  if (!nodeMissing && !['REQUIRED_SLOT_MISSING', 'DEFAULT_REQUIRES_APPROVAL'].includes(issue.code))
    return;
  const parts = issue.path.split('/');
  if (!parts.length || parts.some((part) => !/^[a-z][a-z0-9_]*$/.test(part))) return;
  let children = record(data.schema.nodes);
  let definition: Record<string, unknown> = {};
  for (let index = 0; index < parts.length; index++) {
    definition = record(children[parts[index]]);
    if (!Object.keys(definition).length) return;
    if (definition.repeated && index < parts.length - 1) index++;
    if (index === parts.length - 2 && !nodeMissing) {
      definition = record(record(definition.slots)[parts.at(-1)!]);
      break;
    }
    children = record(definition.children);
  }
  const defaultValue = definition.default;
  const value = nodeMissing ? {} : defaultValue !== undefined ? defaultValue : '';
  const logical = [data.rootKey, ...parts];
  let path = logical.map(draftPathSegment).join('/');
  let change: PreparationChange;
  if (isSemanticEnvelope(data.after)) {
    let nodes = data.after.content.trees;
    let listPath = 'content/trees';
    let nodePath = '';
    const nodeParts = logical.slice(0, -1);
    for (const key of nodeParts) {
      const index = nodes.findIndex((node) => record(node).key === key);
      if (index < 0) return; // Do not guess a missing semantic ancestor.
      nodePath = `${listPath}/[${index}]`;
      const nested = record(nodes[index]).children;
      nodes = Array.isArray(nested) ? nested : [];
      listPath = `${nodePath}/children`;
    }
    change = nodeMissing
      ? editablePreparationCommand({
          kind: 'append',
          path: listPath,
          value: { key: parts.at(-1)!, slots: {}, children: [] },
        })
      : editablePreparationCommand({
          kind: 'set',
          path: `${nodePath}/slots/${draftPathSegment(parts.at(-1)!)}`,
          value: value as TransitionProtocolValue,
        });
  } else {
    // The empty document has no root yet. Create only the explicitly requested node.
    if (nodeMissing && parts.length === 1 && !Object.hasOwn(record(data.after), data.rootKey)) {
      path = draftPathSegment(data.rootKey);
      change = editablePreparationCommand({ kind: 'set', path, value: { [parts[0]]: {} } });
    } else {
      change = editablePreparationCommand({
        kind: 'set',
        path,
        value: value as TransitionProtocolValue,
      });
    }
  }
  if (!nodeMissing && defaultValue === undefined) {
    const type = definition.type;
    change.value.type =
      type === 'number' || type === 'integer'
        ? 'number'
        : type === 'boolean'
          ? 'boolean'
          : type === 'object'
            ? 'object'
            : type === 'array'
              ? 'array'
              : 'text';
  }
  change.id = `required-content:${issue.path}`;
  return change;
}
