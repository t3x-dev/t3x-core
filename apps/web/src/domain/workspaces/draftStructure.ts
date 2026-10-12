export type DraftYValue =
  | string
  | number
  | boolean
  | null
  | DraftYValue[]
  | { [key: string]: DraftYValue };

export type DraftYOp =
  | { define: { path: string } }
  | { drop: { path: string } }
  | { rename: { path: string; to: string } }
  | { set: { path: string; value: DraftYValue } }
  | { unset: { path: string } }
  | { populate: { path: string; values: Record<string, DraftYValue> } }
  | { append: { path: string; value: DraftYValue } }
  | { move: { from: string; to: string } }
  | { clone: { from: string; to: string } }
  | { nest: { path: string; keys: string[]; under: string } }
  | { split: { path: string; into: Record<string, string[]> } }
  | { fold: { path: string } }
  | { merge: { path: string; keys: string[]; into: string } }
  | { sort: { path: string; by?: string; order?: 'asc' | 'desc' } }
  | { unique: { path: string; by?: string } }
  | { pick: { path: string; keys: string[] } }
  | { omit: { path: string; keys: string[] } }
  | {
      assert: {
        path: string;
        equals?: DraftYValue;
        exists?: boolean;
        type?: 'mapping' | 'sequence' | 'scalar';
      };
    };

type OpName<Op> = Op extends unknown ? keyof Op & string : never;
export type DraftYOpName = OpName<DraftYOp>;

export type DraftNodeKind = 'mapping' | 'sequence' | 'scalar' | 'tree';

export interface DraftStructureNode {
  path: string;
  key: string;
  kind: DraftNodeKind;
  value: unknown;
  preview: string;
  depth: number;
  parentPath: string | null;
  childKeys: string[];
  expandable: boolean;
}

export const DRAFT_YOP_NAMES = [
  'define',
  'drop',
  'rename',
  'set',
  'unset',
  'populate',
  'append',
  'move',
  'clone',
  'nest',
  'split',
  'fold',
  'merge',
  'sort',
  'unique',
  'pick',
  'omit',
  'assert',
] as const satisfies readonly DraftYOpName[];

export function isSemanticEnvelope(value: unknown): value is {
  domain: string;
  content: { trees: unknown[]; relations: unknown[] };
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  if (document.domain !== 't3x.dev/semantic-content') return false;
  const content = document.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  return Array.isArray((content as { trees?: unknown }).trees);
}

export function parseDraftValue(raw: string): DraftYValue {
  const text = raw.trim();
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('{') || text.startsWith('[')) {
    const parsed: unknown = JSON.parse(text);
    return parsed as DraftYValue;
  }
  return raw;
}

export function formatDraftValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null)
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function previewDraftValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null)
    return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (isTreeNode(value)) {
      const title = (value.slots as { title?: unknown } | undefined)?.title;
      if (typeof title === 'string' && title.trim()) return title;
    }
    return keys.length ? `${keys.length} fields` : 'empty';
  }
  return '';
}

export function joinDraftPath(parent: string, segment: string) {
  return parent ? `${parent}/${segment}` : segment;
}

export function draftPathSegment(key: string) {
  if (/^[A-Za-z0-9_.-]+$/.test(key)) return key;
  return `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function draftMatchSegment(key: string) {
  return `[key=${draftPathSegment(key)}]`;
}

export function lastDraftPathSegment(path: string) {
  const parts = path.split('/').filter(Boolean);
  return parts.at(-1) ?? path;
}

export function parentDraftPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

export function isMatchSegment(segment: string) {
  return /^\[[^=\]]+=/.test(segment);
}

export function isIndexSegment(segment: string) {
  return /^\[\d+\]$/.test(segment);
}

export function walkDraftStructure(current: unknown): DraftStructureNode[] {
  if (isSemanticEnvelope(current)) {
    return walkValue(current.content.trees, 'content/trees', 'trees', 0, 'content');
  }
  if (current === undefined || current === null) return [];
  if (typeof current !== 'object') {
    return [
      {
        path: '',
        key: 'root',
        kind: 'scalar',
        value: current,
        preview: previewDraftValue(current),
        depth: 0,
        parentPath: null,
        childKeys: [],
        expandable: false,
      },
    ];
  }
  if (Array.isArray(current)) return walkValue(current, '', 'root', 0, null);
  return Object.entries(current).flatMap(([key, value]) =>
    walkValue(value, draftPathSegment(key), key, 0, '')
  );
}

/** Extra row-menu ops. Pencil / trash / + already cover set, unset, drop, append, and define. */
export function availableDraftOps(node: DraftStructureNode): DraftYOpName[] {
  const segment = lastDraftPathSegment(node.path);
  const ops: DraftYOpName[] = [];
  if (node.path && !isMatchSegment(segment) && !isIndexSegment(segment)) ops.push('rename');
  if (node.kind === 'sequence') ops.push('sort', 'unique');
  if ((node.kind === 'mapping' || node.kind === 'tree') && node.childKeys.length === 1)
    ops.push('fold');
  return ops;
}

export function deleteDraftOp(path: string): DraftYOp {
  const segment = lastDraftPathSegment(path);
  if (isMatchSegment(segment) || isIndexSegment(segment)) return { drop: { path } };
  return { unset: { path } };
}

export function draftPathExists(current: unknown, path: string) {
  return walkDraftStructure(current).some((node) => node.path === path);
}

export function matchKeyFromSegment(segment: string) {
  const matched = segment.match(/^\[[^=\]]+=(?:"([^"]+)"|([^\]]+))\]$/);
  return matched?.[1] ?? matched?.[2] ?? null;
}

export function editDraftOp(path: string, value: DraftYValue, current?: unknown): DraftYOp {
  const segment = lastDraftPathSegment(path);
  const exists = current === undefined || draftPathExists(current, path);
  if (isMatchSegment(segment) || isIndexSegment(segment)) {
    if (!exists) {
      const key = matchKeyFromSegment(segment) ?? 'item';
      return {
        append: {
          path: parentDraftPath(path),
          value:
            value && typeof value === 'object' && !Array.isArray(value)
              ? value
              : treeItem(key, value),
        },
      };
    }
    if (typeof value !== 'object' || value === null) {
      return { set: { path: joinDraftPath(path, 'slots/title'), value } };
    }
  }
  return { set: { path, value } };
}

export function createDraftChildOp(
  parent: DraftStructureNode,
  name: string,
  kind: 'field' | 'node' | 'item',
  value: DraftYValue
): DraftYOp {
  const key = name.trim();
  if (kind === 'item' || parent.kind === 'sequence') {
    return {
      append: {
        path: parent.path,
        value: kind === 'node' ? treeItem(key, value) : value,
      },
    };
  }
  if (parent.kind === 'tree') {
    if (kind === 'node') {
      return {
        append: {
          path: joinDraftPath(parent.path, 'children'),
          value: treeItem(key, value),
        },
      };
    }
    return { set: { path: joinDraftPath(parent.path, `slots/${draftPathSegment(key)}`), value } };
  }
  if (kind === 'node') {
    return { define: { path: joinDraftPath(parent.path, draftPathSegment(key)) } };
  }
  return { set: { path: joinDraftPath(parent.path, draftPathSegment(key)), value } };
}

export function buildDraftOp(
  name: DraftYOpName,
  input: {
    path: string;
    to?: string;
    value?: DraftYValue;
    values?: Record<string, DraftYValue>;
    keys?: string[];
    under?: string;
    into?: string | Record<string, string[]>;
    by?: string;
    order?: 'asc' | 'desc';
    equals?: DraftYValue;
    exists?: boolean;
    type?: 'mapping' | 'sequence' | 'scalar';
    from?: string;
  }
): DraftYOp {
  const path = input.path;
  switch (name) {
    case 'define':
      return { define: { path } };
    case 'drop':
      return { drop: { path } };
    case 'rename':
      return { rename: { path, to: required(input.to, 'rename needs a new key') } };
    case 'set':
      return { set: { path, value: input.value ?? '' } };
    case 'unset':
      return { unset: { path } };
    case 'populate':
      return { populate: { path, values: input.values ?? {} } };
    case 'append':
      return { append: { path, value: input.value ?? '' } };
    case 'move':
      return {
        move: { from: input.from ?? path, to: required(input.to, 'move needs a destination') },
      };
    case 'clone':
      return {
        clone: { from: input.from ?? path, to: required(input.to, 'clone needs a destination') },
      };
    case 'nest':
      return {
        nest: {
          path,
          keys: input.keys ?? [],
          under: required(input.under, 'nest needs a wrapper key'),
        },
      };
    case 'split':
      return {
        split: {
          path,
          into:
            input.into && typeof input.into === 'object' && !Array.isArray(input.into)
              ? input.into
              : {},
        },
      };
    case 'fold':
      return { fold: { path } };
    case 'merge':
      return {
        merge: {
          path,
          keys: input.keys ?? [],
          into: required(
            typeof input.into === 'string' ? input.into : undefined,
            'merge needs a target key'
          ),
        },
      };
    case 'sort':
      return {
        sort: {
          path,
          ...(input.by ? { by: input.by } : {}),
          ...(input.order ? { order: input.order } : {}),
        },
      };
    case 'unique':
      return { unique: { path, ...(input.by ? { by: input.by } : {}) } };
    case 'pick':
      return { pick: { path, keys: input.keys ?? [] } };
    case 'omit':
      return { omit: { path, keys: input.keys ?? [] } };
    case 'assert':
      return {
        assert: {
          path,
          ...(input.equals !== undefined ? { equals: input.equals } : {}),
          ...(input.exists !== undefined ? { exists: input.exists } : {}),
          ...(input.type ? { type: input.type } : {}),
        },
      };
  }
}

export function draftOpReason(op: DraftYOp) {
  const name = Object.keys(op)[0] ?? 'edit';
  const body = Object.values(op)[0] as { path?: string; from?: string };
  return `${name} ${body.path ?? body.from ?? ''}`.trim();
}

export function nextAuthoringRequestId() {
  return `manual-${crypto.randomUUID()}`;
}

function required(value: string | undefined, message: string) {
  if (!value?.trim()) throw new TypeError(message);
  return value.trim();
}

function isTreeNode(value: unknown): value is {
  key?: string;
  slots?: Record<string, unknown>;
  children?: unknown[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'key' || key === 'slots' || key === 'children') &&
    keys.includes('slots')
  );
}

function treeItem(key: string, value: DraftYValue): DraftYValue {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return { key, slots: value, children: [] };
  if (value === '') return { key, slots: {}, children: [] };
  return { key, slots: { value }, children: [] };
}

function walkValue(
  value: unknown,
  path: string,
  key: string,
  depth: number,
  parentPath: string | null
): DraftStructureNode[] {
  if (Array.isArray(value)) {
    const keyed = value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as { key?: unknown }).key === 'string'
    );
    const node: DraftStructureNode = {
      path,
      key,
      kind: 'sequence',
      value,
      preview: previewDraftValue(value),
      depth,
      parentPath,
      childKeys: keyed
        ? value.map((item) => String((item as { key: string }).key))
        : value.map((_, index) => String(index)),
      expandable: value.length > 0,
    };
    const children = value.flatMap((item, index) => {
      if (keyed) {
        const itemKey = String((item as { key: string }).key);
        return walkValue(
          item,
          joinDraftPath(path, draftMatchSegment(itemKey)),
          itemKey,
          depth + 1,
          path
        );
      }
      return walkValue(item, joinDraftPath(path, `[${index}]`), String(index), depth + 1, path);
    });
    return [node, ...children];
  }
  if (isTreeNode(value)) {
    const slots = value.slots ?? {};
    const children = Array.isArray(value.children) ? value.children : [];
    const childKeys = [
      ...Object.keys(slots),
      ...children.flatMap((child) =>
        child &&
        typeof child === 'object' &&
        !Array.isArray(child) &&
        typeof (child as { key?: unknown }).key === 'string'
          ? [String((child as { key: string }).key)]
          : []
      ),
    ];
    const node: DraftStructureNode = {
      path,
      key,
      kind: 'tree',
      value,
      preview: previewDraftValue(value),
      depth,
      parentPath,
      childKeys,
      expandable: childKeys.length > 0,
    };
    const slotNodes = Object.entries(slots).flatMap(([slotKey, slotValue]) =>
      walkValue(
        slotValue,
        joinDraftPath(path, `slots/${draftPathSegment(slotKey)}`),
        slotKey,
        depth + 1,
        path
      )
    );
    const childNodes = children.flatMap((child) => {
      if (!child || typeof child !== 'object' || Array.isArray(child)) return [];
      const itemKey =
        typeof (child as { key?: unknown }).key === 'string' ? (child as { key: string }).key : '';
      if (!itemKey) return [];
      return walkValue(
        child,
        joinDraftPath(path, `children/${draftMatchSegment(itemKey)}`),
        itemKey,
        depth + 1,
        path
      );
    });
    return [node, ...slotNodes, ...childNodes];
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    const node: DraftStructureNode = {
      path,
      key,
      kind: 'mapping',
      value,
      preview: previewDraftValue(value),
      depth,
      parentPath,
      childKeys: keys,
      expandable: keys.length > 0,
    };
    const children = Object.entries(value).flatMap(([childKey, childValue]) =>
      walkValue(
        childValue,
        joinDraftPath(path, draftPathSegment(childKey)),
        childKey,
        depth + 1,
        path
      )
    );
    return [node, ...children];
  }
  return [
    {
      path,
      key,
      kind: 'scalar',
      value,
      preview: previewDraftValue(value),
      depth,
      parentPath,
      childKeys: [],
      expandable: false,
    },
  ];
}
