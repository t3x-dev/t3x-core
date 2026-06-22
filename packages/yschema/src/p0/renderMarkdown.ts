import type { YValue } from '@t3x-dev/yops';
import type {
  NodeSchema,
  ValidationResult,
  YSchema,
  YSchemaKey,
  YSchemaPath,
  YSchemaRelation,
} from './types';

export interface RenderYSchemaMarkdownInput {
  schema: YSchema;
  tree: YValue;
  relations?: YSchemaRelation[];
  validation?: ValidationResult;
}

function isRecord(value: YValue | undefined): value is Record<string, YValue> {
  return (
    value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
  );
}

function resolvePath(root: YValue, path: YSchemaPath): YValue | undefined {
  let current: YValue | undefined = root;
  for (const segment of path.split('/')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeRelationType(type: string): string {
  if (type === 'depends_on') return 'depends on';
  return type.replace(/_/g, ' ');
}

function labelForSlot(slotKey: YSchemaKey): string {
  return humanizeKey(slotKey);
}

function primitiveToMarkdown(value: YValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function appendSlotValue(lines: string[], slotKey: YSchemaKey, value: YValue): void {
  const label = labelForSlot(slotKey);

  if (Array.isArray(value)) {
    lines.push(`${label}:`);
    if (value.length === 0) {
      lines.push('- none');
      return;
    }
    for (const item of value) {
      lines.push(`- ${primitiveToMarkdown(item)}`);
    }
    return;
  }

  if (isRecord(value)) {
    lines.push(`**${label}:** ${primitiveToMarkdown(value)}`);
    return;
  }

  lines.push(`**${label}:** ${primitiveToMarkdown(value)}`);
}

function sortedRepeatedEntries(
  value: Record<string, YValue>
): Array<[string, Record<string, YValue>]> {
  const entries = Object.entries(value).filter((entry): entry is [string, Record<string, YValue>] =>
    isRecord(entry[1])
  );
  const allHaveSequence = entries.every(([, item]) => typeof item.sequence === 'number');
  if (!allHaveSequence) return entries;

  return [...entries].sort((left, right) => {
    return (left[1].sequence as number) - (right[1].sequence as number);
  });
}

function titleForItem(itemKey: string, itemValue: Record<string, YValue>): string {
  return typeof itemValue.title === 'string' && itemValue.title.trim() !== ''
    ? itemValue.title
    : humanizeKey(itemKey);
}

function renderRepeatedNode(
  lines: string[],
  node: NodeSchema,
  nodeValue: YValue,
  options: { headingLevel: number }
): void {
  if (!isRecord(nodeValue)) {
    lines.push('_No structured items._');
    return;
  }

  const entries = sortedRepeatedEntries(nodeValue);
  const slots = node.slots ?? {};
  const rendersAsOrderedList = slots.title !== undefined && slots.sequence !== undefined;

  if (entries.length === 0) {
    lines.push('_No items._');
    return;
  }

  if (rendersAsOrderedList) {
    entries.forEach(([itemKey, itemValue], index) => {
      lines.push(`${index + 1}. ${titleForItem(itemKey, itemValue)}`);
      for (const [slotKey, slotValue] of Object.entries(itemValue)) {
        if (slotKey === 'title' || slotKey === 'sequence') continue;
        lines.push('');
        appendSlotValue(lines, slotKey, slotValue);
      }
    });
    return;
  }

  const itemHeading = '#'.repeat(options.headingLevel + 1);
  entries.forEach(([itemKey, itemValue], index) => {
    if (index > 0) lines.push('');
    lines.push(`${itemHeading} ${titleForItem(itemKey, itemValue)}`);

    for (const [slotKey, slotValue] of Object.entries(itemValue)) {
      if (slotKey === 'title') continue;
      lines.push('');
      appendSlotValue(lines, slotKey, slotValue);
    }
  });
}

function renderNode(
  lines: string[],
  nodeKey: YSchemaKey,
  node: NodeSchema,
  nodeValue: YValue | undefined,
  options: { headingLevel: number }
): void {
  const heading = '#'.repeat(options.headingLevel);
  lines.push(`${heading} ${humanizeKey(nodeKey)}`);
  lines.push('');

  if (nodeValue === undefined) {
    lines.push('_Not provided._');
    return;
  }

  if (node.repeated === true) {
    renderRepeatedNode(lines, node, nodeValue, options);
    return;
  }

  if (!isRecord(nodeValue)) {
    lines.push(primitiveToMarkdown(nodeValue));
    return;
  }

  const slotEntries = Object.entries(node.slots ?? {}).filter(
    ([slotKey]) => nodeValue[slotKey] !== undefined
  );
  for (const [index, [slotKey]] of slotEntries.entries()) {
    if (index > 0) lines.push('');
    appendSlotValue(lines, slotKey, nodeValue[slotKey] as YValue);
  }

  if (node.children !== undefined && node.children !== 'any') {
    for (const [childKey, childNode] of Object.entries(node.children)) {
      lines.push('');
      renderNode(lines, childKey, childNode, nodeValue[childKey], {
        headingLevel: options.headingLevel + 1,
      });
    }
  }
}

function titleForPath(tree: YValue, path: YSchemaPath): string {
  const value = resolvePath(tree, path);
  if (isRecord(value) && typeof value.title === 'string' && value.title.trim() !== '') {
    return value.title;
  }
  return humanizeKey(path.split('/').at(-1) ?? path);
}

function renderRelations(lines: string[], tree: YValue, relations: YSchemaRelation[]): void {
  if (relations.length === 0) return;

  lines.push('## Relations');
  lines.push('');
  for (const relation of relations) {
    const from = titleForPath(tree, relation.from);
    const to = titleForPath(tree, relation.to);
    lines.push(`- ${from} ${humanizeRelationType(relation.type)} ${to}.`);
  }
}

function renderValidation(lines: string[], validation: ValidationResult): void {
  lines.push('## Validation');
  lines.push('');
  lines.push(`Valid: ${validation.valid}`);
  lines.push(`Ready: ${validation.ready}`);
  lines.push(`Errors: ${validation.errors.length}`);

  if (validation.errors.length > 0) {
    for (const error of validation.errors) {
      lines.push(`- \`${error.path}\`: ${error.message}`);
    }
  }

  lines.push(`Gaps: ${validation.gaps.length}`);
  if (validation.gaps.length > 0) {
    for (const gap of validation.gaps) {
      lines.push(`- \`${gap.path}\`: ${gap.message}`);
    }
  }
}

export function renderYSchemaMarkdown(input: RenderYSchemaMarkdownInput): string {
  const lines: string[] = [`# ${input.schema.name}`];

  if (input.schema.description !== undefined) {
    lines.push('');
    lines.push(input.schema.description);
  }

  for (const [nodeKey, node] of Object.entries(input.schema.nodes)) {
    lines.push('');
    renderNode(lines, nodeKey, node, resolvePath(input.tree, nodeKey), {
      headingLevel: 2,
    });
  }

  if (input.relations !== undefined && input.relations.length > 0) {
    lines.push('');
    renderRelations(lines, input.tree, input.relations);
  }

  if (input.validation !== undefined) {
    lines.push('');
    renderValidation(lines, input.validation);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
