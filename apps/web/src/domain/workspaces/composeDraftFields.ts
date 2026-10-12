import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { authoringSemanticContent } from './authoringReview';

export interface ComposeDraftField {
  path: string;
  label: string;
  depth: number;
  value: unknown;
  editable: boolean;
}

function pathKey(key: string) {
  return !key || /[/[\]"\\]/.test(key)
    ? `"${key.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    : key;
}

/** Indices address the exact current document; publication is guarded by its revision. */
export function composeDraftFields(document: TransitionProtocolValue): ComposeDraftField[] {
  const rows: ComposeDraftField[] = [];
  const visit = (value: unknown, path: string, label: string, depth: number, editable = true) => {
    const container = value !== null && typeof value === 'object';
    rows.push({ path, label, depth, value, editable: editable && !container });
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visit(item, `${path}/[${index}]`, `[${index}]`, depth + 1, editable)
      );
    } else if (container) {
      Object.entries(value).forEach(([key, item]) =>
        visit(item, `${path}/${pathKey(key)}`, key, depth + 1, editable)
      );
    }
  };
  const semantic = authoringSemanticContent(document);
  if (semantic) {
    const visitNodes = (nodes: unknown[], parent: string, depth: number) => {
      nodes.forEach((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const node = value as Record<string, unknown>;
        const path = `${parent}/[${index}]`;
        rows.push({ path, label: String(node.key ?? index), depth, value, editable: false });
        if (node.slots && typeof node.slots === 'object' && !Array.isArray(node.slots)) {
          Object.entries(node.slots).forEach(([key, item]) =>
            visit(item, `${path}/slots/${pathKey(key)}`, key, depth + 1)
          );
        }
        if (Array.isArray(node.children)) visitNodes(node.children, `${path}/children`, depth + 1);
      });
    };
    visitNodes(semantic.trees, 'content/trees', 0);
    if (semantic.relations.length)
      visit(semantic.relations, 'content/relations', 'Relations', 0, false);
  } else if (Array.isArray(document)) {
    document.forEach((value, index) => visit(value, `[${index}]`, `[${index}]`, 0));
  } else if (document !== null && typeof document === 'object') {
    Object.entries(document).forEach(([key, value]) => visit(value, pathKey(key), key, 0));
  }
  return rows;
}
