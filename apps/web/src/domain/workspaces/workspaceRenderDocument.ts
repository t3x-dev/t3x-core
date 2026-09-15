export interface WorkspaceRenderTreeRow {
  afterValue?: string;
  beforeValue?: string;
  changeKind?: 'added' | 'modified' | 'removed';
  changed?: boolean;
  depth: number;
  expandable: boolean;
  id: string;
  key: string;
  parentPath: string | null;
  path: string;
  reason?: string;
  type: string;
  value: string;
}

export interface WorkspaceRenderSection {
  body?: string;
  changed: boolean;
  checkRows: Array<{ id: string; label: string; value: string }>;
  clampBody?: boolean;
  highlight?: string;
  listRows: Array<{ id: string; label: string; value: string }>;
  path: string;
  ready: boolean;
  rowId: string;
  tableRows: Array<{ id: string; label: string; value: string }>;
  title: string;
  updated: boolean;
}

export interface WorkspaceRenderDocument {
  lede: string;
  sections: WorkspaceRenderSection[];
  title: string;
}

const GENERIC_TITLE =
  /^(main workspace|.+ workspace|workspace|root|state|document|candidate|prd)$/i;
const GENERIC_LEDE = /collect source evidence/i;
const LEDE_KEYS = new Set(['headline', 'lede', 'pitch', 'subtitle', 'tagline']);

export function isGenericWorkspaceCopy(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return GENERIC_LEDE.test(trimmed) || GENERIC_TITLE.test(trimmed);
}

export function buildWorkspaceRenderDocument(
  rows: WorkspaceRenderTreeRow[],
  options: { fallbackLede?: string; fallbackTitle?: string; schemaLabel?: string } = {}
): WorkspaceRenderDocument {
  const identity = resolveWorkspaceRenderIdentity(rows, options);
  const sections = buildRenderSections(rows, identity.hiddenKeys);
  const highlightSignatures = new Set(
    sections
      .map((section) => section.highlight)
      .filter((value): value is string => Boolean(value))
      .map(normalizeSignature)
  );
  const lede =
    identity.lede && highlightSignatures.has(normalizeSignature(identity.lede))
      ? ''
      : identity.lede;
  return {
    lede,
    sections,
    title: identity.title,
  };
}

export function resolveWorkspaceRenderIdentity(
  rows: WorkspaceRenderTreeRow[],
  options: { fallbackLede?: string; fallbackTitle?: string; schemaLabel?: string } = {}
): { hiddenKeys: Set<string>; lede: string; title: string } {
  const hiddenKeys = new Set(['id', 'metadata', 'owner', 'schema']);
  const titleRow = rows.find((row) => row.depth <= 1 && row.key.toLowerCase() === 'title');
  const titleFromTree = usableTitle(titleRow ? rowText(titleRow) : undefined);
  const root = rows.find((row) => row.depth === 0);
  const rootTitle = usableTitle(root && !isGenericTitle(root.key) ? humanizeKey(root.key) : '');
  const schemaTitle = usableTitle(titleFromSchemaLabel(options.schemaLabel));
  const title =
    titleFromTree || schemaTitle || rootTitle || options.fallbackTitle?.trim() || 'Document';
  hiddenKeys.add('title');

  const ledeRow = rows.find((row) => {
    if (row.depth > 1 || row.expandable) return false;
    return LEDE_KEYS.has(row.key.toLowerCase());
  });
  const shortDescription = rows.find((row) => {
    if (row.depth > 1 || row.expandable) return false;
    if (row.key.toLowerCase() !== 'description' && row.key.toLowerCase() !== 'objective') {
      return false;
    }
    return isShortLede(rowText(row));
  });
  const ledeFromTree = usableLede(ledeRow ? rowText(ledeRow) : undefined);
  const ledeFromDescription = usableLede(shortDescription ? rowText(shortDescription) : undefined);
  const lede = ledeFromTree || ledeFromDescription || usableLede(options.fallbackLede) || '';
  if (ledeFromTree && ledeRow) hiddenKeys.add(ledeRow.key.toLowerCase());
  if (!ledeFromTree && ledeFromDescription && shortDescription) {
    hiddenKeys.add(shortDescription.key.toLowerCase());
  }

  return { hiddenKeys, lede, title };
}

function buildRenderSections(
  rows: WorkspaceRenderTreeRow[],
  hiddenKeys: Set<string>
): WorkspaceRenderSection[] {
  const root = rows.find((row) => row.depth === 0);
  const rootPath = root ? normalizeRowPath(root.path) : '';
  const topLevel = rows.filter((row) => {
    if (hiddenKeys.has(row.key.toLowerCase())) return false;
    if (row.depth === 1) return true;
    return Boolean(rootPath) && isDirectChildPath(row.path, rootPath);
  });
  const source = topLevel.length > 0 ? topLevel : synthesizeSectionsFromLeaves(rows, hiddenKeys);
  const sections = source
    .map((section) => toRenderSection(rows, section))
    .filter((section) => sectionHasContent(section));
  return dedupeRenderSections(sections);
}

function toRenderSection(
  rows: WorkspaceRenderTreeRow[],
  section: WorkspaceRenderTreeRow
): WorkspaceRenderSection {
  const children = rowsForParent(rows, section);
  const changed = Boolean(section.changed) || children.some((child) => child.changed);
  const title = humanizeKey(section.key);
  const scalarChildren = children.filter((child) => !child.expandable);
  const objectChildren = children.filter((child) => child.expandable);
  const indexedChildren = objectChildren.filter((child) => isIndexKey(child.key));
  const nestedObjects = objectChildren.filter((child) => !isIndexKey(child.key));
  const booleanChildren = scalarChildren.filter((child) => isTruthyReady(rowText(child)));
  const highlightPreferred = isHighlightSection(section.key)
    ? sectionHighlightValue(section, children)
    : undefined;
  const tableCandidates = scalarChildren.filter(
    (child) =>
      !isTruthyReady(child.value) &&
      isTableValue(rowText(child)) &&
      !(highlightPreferred && isHighlightChild(child)) &&
      highlightPreferred !== rowText(child)
  );
  const tableChildren = tableCandidates.length >= 2 ? tableCandidates : [];
  const tableIds = new Set(tableChildren.map((child) => child.id));
  const narrativeChildren = scalarChildren.filter(
    (child) =>
      !tableIds.has(child.id) &&
      !isTruthyReady(child.value) &&
      !(highlightPreferred && isHighlightChild(child)) &&
      Boolean(rowText(child))
  );
  const nestedItems = [...indexedChildren, ...nestedObjects].flatMap((child) =>
    nestedDisplayItems(rows, child)
  );
  const checkRows = [
    ...booleanChildren.map((child) => ({
      id: child.id,
      label: humanizeKey(child.key),
      value: rowText(child),
    })),
    ...nestedItems.filter((item) => item.kind === 'check').map(toDisplayRow),
  ].filter((row) => isCheckLabel(row.label));
  const listRows = [
    ...nestedItems.filter((item) => item.kind === 'list').map(toDisplayRow),
    ...nestedItems
      .filter((item) => item.kind === 'check' && !isCheckLabel(item.label))
      .map(toDisplayRow),
  ];
  const ready = looksReady(section, children);
  const sectionNarrative = firstText(
    isPlaceholderValue(section.value) || isTruthyReady(section.value)
      ? undefined
      : displayValue(section.value)
  );
  const readyDetail = children.find((child) =>
    ['body', 'description', 'detail', 'note', 'summary'].includes(child.key.toLowerCase())
  );
  const bodyFromSection =
    highlightPreferred || ready
      ? undefined
      : firstText(...narrativeChildren.map((child) => rowText(child)), sectionNarrative);
  const readyBody = ready
    ? firstText(
        readyDetail && !isTruthyReady(rowText(readyDetail)) ? rowText(readyDetail) : undefined,
        highlightPreferred && !isTruthyReady(highlightPreferred) ? highlightPreferred : undefined,
        ...narrativeChildren.map((child) => rowText(child)),
        sectionNarrative
      )
    : undefined;
  const leftoverList = ready || highlightPreferred ? [] : listRows;
  const leftoverBody = ready
    ? readyBody
    : bodyFromSection ||
      (checkRows.length === 0 && leftoverList.length === 1 && leftoverList[0]
        ? leftoverList[0].label
        : undefined);

  return {
    body: leftoverBody,
    changed,
    checkRows: ready ? [] : checkRows,
    clampBody: /note/i.test(section.key),
    highlight: highlightPreferred,
    listRows: leftoverBody && leftoverList.length === 1 ? [] : leftoverList,
    path: section.path,
    ready,
    rowId: children[0]?.id ?? section.id,
    tableRows:
      ready || highlightPreferred
        ? []
        : tableChildren.map((child) => ({
            id: child.id,
            label: humanizeKey(child.key),
            value: rowText(child),
          })),
    title,
    updated: changed,
  };
}

function nestedDisplayItems(
  rows: WorkspaceRenderTreeRow[],
  child: WorkspaceRenderTreeRow
): Array<{ id: string; kind: 'check' | 'list'; label: string; value: string }> {
  const nested = rowsForParent(rows, child).filter((row) => !row.expandable);
  const titleChild = nested.find((row) => row.key.toLowerCase() === 'title');
  if (titleChild) {
    const title = rowText(titleChild);
    if (title) return [{ id: child.id, kind: 'check', label: title, value: title }];
  }
  if (nested.length > 0 && nested.every((item) => isIndexKey(item.key))) {
    const kind = arrayItemKind(child.key);
    return nested.flatMap((item) => {
      const text = rowText(item);
      return text ? [{ id: item.id, kind, label: text, value: text }] : [];
    });
  }
  if (nested.length > 0 && nested.every((item) => isIndexKey(item.key) === false)) {
    const kind = arrayItemKind(child.key);
    return nested.flatMap((item) => {
      const text = rowText(item);
      return text ? [{ id: item.id, kind, label: text, value: text }] : [];
    });
  }
  if (isTruthyReady(child.value) || isTruthyReady(child.afterValue)) {
    return [{ id: child.id, kind: 'check', label: humanizeKey(child.key), value: rowText(child) }];
  }
  const leafText = rowText(child);
  if (leafText && !child.expandable) {
    return [{ id: child.id, kind: arrayItemKind(child.key), label: leafText, value: leafText }];
  }
  return [];
}

function toDisplayRow(item: { id: string; label: string; value: string }): {
  id: string;
  label: string;
  value: string;
} {
  return { id: item.id, label: item.label, value: item.value };
}

function arrayItemKind(key: string): 'check' | 'list' {
  if (/avoid|forbid|risk|warn/i.test(key)) return 'list';
  if (/must|require|need|evidence|accept/i.test(key)) return 'check';
  return 'list';
}

function sectionHasContent(section: WorkspaceRenderSection): boolean {
  return Boolean(
    section.highlight ||
      section.ready ||
      section.body ||
      section.tableRows.length > 0 ||
      section.checkRows.length > 0 ||
      section.listRows.length > 0
  );
}

function sectionSignature(section: WorkspaceRenderSection): string | null {
  if (section.highlight) return normalizeSignature(section.highlight);
  if (
    !section.ready &&
    section.checkRows.length === 0 &&
    section.tableRows.length === 0 &&
    section.listRows.length === 0 &&
    section.body
  ) {
    return normalizeSignature(section.body);
  }
  if (
    !section.ready &&
    section.checkRows.length === 0 &&
    section.tableRows.length === 0 &&
    section.listRows.length === 1 &&
    section.listRows[0]
  ) {
    return normalizeSignature(section.listRows[0].label);
  }
  return null;
}

function dedupeRenderSections(sections: WorkspaceRenderSection[]): WorkspaceRenderSection[] {
  const highlights = new Set(
    sections
      .map((section) => section.highlight)
      .filter((value): value is string => Boolean(value))
      .map(normalizeSignature)
  );
  const seen = new Set<string>();
  return sections
    .map((section) => ({
      ...section,
      checkRows: section.checkRows.filter((row) => !highlights.has(normalizeSignature(row.label))),
      listRows: section.listRows.filter((row) => !highlights.has(normalizeSignature(row.label))),
      body:
        section.body && highlights.has(normalizeSignature(section.body)) && !section.highlight
          ? undefined
          : section.body,
    }))
    .filter((section) => sectionHasContent(section))
    .filter((section) => {
      const signature = sectionSignature(section);
      if (!signature) return true;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

function rowsForParent(
  rows: WorkspaceRenderTreeRow[],
  parent: WorkspaceRenderTreeRow
): WorkspaceRenderTreeRow[] {
  const parentPath = normalizeRowPath(parent.path);
  return rows.filter((row) => row.id !== parent.id && isDirectChildPath(row.path, parentPath));
}

function isDirectChildPath(path: string, parentPath: string): boolean {
  const child = normalizeRowPath(path);
  const parent = normalizeRowPath(parentPath);
  if (!child || child === parent) return false;
  if (!parent) return !child.includes('/');
  if (!child.startsWith(`${parent}/`)) return false;
  return !child.slice(parent.length + 1).includes('/');
}

function normalizeRowPath(path: string): string {
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
}

function synthesizeSectionsFromLeaves(
  rows: WorkspaceRenderTreeRow[],
  hiddenKeys: Set<string>
): WorkspaceRenderTreeRow[] {
  return rows.filter(
    (row) => !row.expandable && row.depth > 0 && !hiddenKeys.has(row.key.toLowerCase())
  );
}

function sectionHighlightValue(
  section: WorkspaceRenderTreeRow,
  children: WorkspaceRenderTreeRow[]
): string | undefined {
  const preferredKeys = ['outcome', 'description', 'summary', 'lede', 'body', 'detail'];
  const preferred = children.find((child) => preferredKeys.includes(child.key.toLowerCase()));
  const textChild = children.find((child) => isNarrativeValue(rowText(child)));
  return (
    firstText(preferred ? rowText(preferred) : undefined) ||
    firstText(textChild ? rowText(textChild) : undefined) ||
    firstText(section.afterValue, isPlaceholderValue(section.value) ? undefined : section.value)
  );
}

function looksReady(section: WorkspaceRenderTreeRow, children: WorkspaceRenderTreeRow[]): boolean {
  if (/require/i.test(section.key)) return false;
  const selfReady = isTruthyReady(section.value) || isTruthyReady(section.afterValue);
  const childReady = children.some((child) => isTruthyReady(rowText(child)));
  if (/ready/i.test(section.key)) return selfReady || childReady;
  if (selfReady) {
    return children.filter((child) => !isTruthyReady(rowText(child))).length <= 1;
  }
  return children.length === 1 && isTruthyReady(children[0]?.value);
}

function isHighlightSection(key: string): boolean {
  return ['summary', 'outcome', 'lede'].includes(key.toLowerCase());
}

function isHighlightChild(row: WorkspaceRenderTreeRow): boolean {
  return ['outcome', 'description', 'summary', 'lede', 'body', 'detail'].includes(
    row.key.toLowerCase()
  );
}

function isTruthyReady(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'ready' || normalized === 'yes';
}

function isTableValue(value: string): boolean {
  return value.trim().length > 0 && value.trim().length < 80 && !value.includes('\n');
}

function isNarrativeValue(value: string): boolean {
  return value.trim().length > 24 || /\s/.test(value.trim());
}

function isIndexKey(key: string): boolean {
  return /^\d+$/.test(key);
}

function isPlaceholderValue(value: string): boolean {
  return (
    !value ||
    value === 'empty' ||
    value === 'undefined' ||
    value === '-' ||
    /^\d+ items?$/.test(value)
  );
}

function displayValue(value: string): string {
  if (isPlaceholderValue(value)) return '';
  return value;
}

function rowText(row: WorkspaceRenderTreeRow): string {
  return firstText(row.afterValue, displayValue(row.value)) ?? '';
}

function firstText(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => displayValue(value ?? '')).find(Boolean);
}

function isCheckLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || isTruthyReady(trimmed)) return false;
  if (trimmed.length > 42) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 6;
}

function isShortLede(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 8 && trimmed.length <= 72 && !trimmed.includes('\n');
}

function isGenericTitle(value: string): boolean {
  return GENERIC_TITLE.test(value.trim());
}

function usableTitle(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isGenericTitle(trimmed)) return undefined;
  return trimmed;
}

function usableLede(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || GENERIC_LEDE.test(trimmed) || !isShortLede(trimmed)) return undefined;
  return trimmed;
}

function titleFromSchemaLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const cleaned = label
    .replace(/^t3x\//i, '')
    .replace(/\s+v?\d[\w.-]*$/i, '')
    .replace(/\s+schema$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned || /not bound/i.test(cleaned)) return undefined;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeSignature(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function toDottedPath(path: string): string {
  return path
    .replace(/^\//, '')
    .replace(/\//g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export function inspectorHeading(path: string): string {
  const parts = toDottedPath(path).split('.').filter(Boolean);
  const last = parts.slice(-2);
  if (last.length === 2) return `${humanizeKey(last[0]!)} · ${last[1]}`;
  return humanizeKey(last[0] ?? path);
}

export function humanizeKey(value: string): string {
  if (/^rollout$/i.test(value)) return 'Rollout plan';
  const spaced = value
    .replace(/oncall/gi, 'on_call')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bon call\b/gi, 'on-call')
    .trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function whyHeading(
  row: Pick<WorkspaceRenderTreeRow, 'changed' | 'key' | 'reason'> | null
): string {
  if (row?.reason?.trim()) {
    const compact = row.reason.trim();
    if (compact.length <= 64) return compact;
  }
  if (row?.changed) return `Updated ${humanizeKey(row.key)}`;
  return 'Why this section';
}
