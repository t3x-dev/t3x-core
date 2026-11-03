import type { StatePointRow } from './stateViewModel';

export interface StateFieldTreeRow extends StatePointRow {
  parentPath: string | null;
  collapseByDefault?: boolean;
}

export function filterStateStructureRows<Row extends StateFieldTreeRow>(
  rows: Row[],
  query: string
): Row[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const includedIds = new Set<string>();
  for (const row of rows) {
    const matches = [row.path, row.key, row.type, row.value, row.statusLabel].some((value) =>
      value.toLowerCase().includes(normalized)
    );
    if (!matches) continue;

    includedIds.add(row.id);
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      includedIds.add(ancestorPath);
      ancestorPath = rowById.get(ancestorPath)?.parentPath ?? null;
    }
  }

  return rows.filter((row) => includedIds.has(row.id));
}

export function filterCollapsedStateRows<Row extends StateFieldTreeRow>(
  rows: Row[],
  isExpanded: (row: Row) => boolean
): Row[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return rows.filter((row) => {
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      const ancestor = rowById.get(ancestorPath);
      if (ancestor?.expandable && !isExpanded(ancestor)) return false;
      ancestorPath = ancestor?.parentPath ?? null;
    }
    return true;
  });
}

export function isStateStructureRowExpanded(
  row: StateFieldTreeRow,
  overrides: Record<string, boolean>,
  expandChanged = false
): boolean {
  return overrides[row.id] ?? (expandChanged || !row.collapseByDefault);
}
