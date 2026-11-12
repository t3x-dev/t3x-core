'use client';

import {
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  List,
  Maximize2,
  Minus,
  Search,
} from 'lucide-react';
import type { StructuredDiffKind } from '@/domain/diff/structuredStateDiff';
import { formatDate, relativeTime } from '@/domain/format/formatters';
import type { StatePointRow } from '@/domain/project/stateViewModel';
import { cn } from '@/utils/cn';
import inspectionStyles from './StateInspection.module.css';

export function StateFieldTable<Row extends StatePointRow>({
  rows,
  getModifiedAt,
  query,
  onQueryChange,
  onExpandAll,
  onCollapseAll,
  selectedRowId,
  isExpanded,
  onSelectRow,
}: {
  rows: Row[];
  getModifiedAt?: (row: Row) => string | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  selectedRowId?: string;
  isExpanded: (row: Row) => boolean;
  onSelectRow: (row: Row) => void;
}) {
  return (
    <div className={inspectionStyles.dataTable}>
      <div className={inspectionStyles.tb}>
        <label className={inspectionStyles.find}>
          <Search />
          <input
            aria-label="Find a field or value"
            placeholder="Find a field or value..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button className={inspectionStyles.gb} type="button" onClick={onExpandAll}>
          <Maximize2 />
          Expand all
        </button>
        <button className={inspectionStyles.gb} type="button" onClick={onCollapseAll}>
          <Minus />
          Collapse all
        </button>
      </div>
      <section
        className={inspectionStyles.treeScroll}
        aria-label="State structure rows"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this region.
        tabIndex={0}
      >
        <table
          className={cn(inspectionStyles.tree, getModifiedAt && inspectionStyles.modifiedTree)}
        >
          <thead>
            <tr className={inspectionStyles.th2}>
              <th>Field</th>
              <th>Value</th>
              <th>{getModifiedAt ? 'Last modified' : 'Type'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isContainer = row.expandable || row.type === 'object' || row.type === 'array';
              const expanded = isExpanded(row);
              const select = () => onSelectRow(row);
              const modifiedAt = getModifiedAt?.(row);
              return (
                <tr
                  key={row.id}
                  className={cn(inspectionStyles.rw, isContainer && inspectionStyles.containerRow)}
                  aria-selected={selectedRowId === row.id}
                  tabIndex={0}
                  onClick={select}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      select();
                    }
                  }}
                >
                  <td
                    className={inspectionStyles.k}
                    style={{ paddingLeft: `min(${row.depth} * var(--tree-indent), 45%)` }}
                  >
                    <span className={inspectionStyles.chev}>
                      {row.expandable ? (
                        <button
                          type="button"
                          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.key}`}
                          aria-expanded={expanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            select();
                          }}
                        >
                          {expanded ? <ChevronDown /> : <ChevronRight />}
                        </button>
                      ) : null}
                    </span>
                    <span className={inspectionStyles.ti}>
                      {row.type === 'array' ? <List /> : isContainer ? <Box /> : <FileText />}
                    </span>
                    <span className={inspectionStyles.nm} title={row.path}>
                      {row.key}
                    </span>
                  </td>
                  <td
                    className={cn(
                      inspectionStyles.val,
                      (row.value === '' || row.value === 'empty') && inspectionStyles.em
                    )}
                    title={row.value}
                  >
                    <StateValueCell row={row} />
                  </td>
                  <td
                    className={getModifiedAt ? inspectionStyles.modifiedAt : inspectionStyles.ty}
                    aria-label={
                      getModifiedAt && !modifiedAt ? 'Last modified time unavailable' : undefined
                    }
                  >
                    {modifiedAt ? (
                      <time dateTime={modifiedAt} title={formatDate(modifiedAt)}>
                        {relativeTime(modifiedAt)}
                      </time>
                    ) : getModifiedAt ? (
                      '—'
                    ) : (
                      row.type
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="p-4 text-sm text-[var(--text-secondary)]">
            {query.trim() ? 'No matching fields.' : 'No stored fields in this version.'}
          </p>
        ) : null}
      </section>
      <footer className={inspectionStyles.tnote}>
        <Eye />
        Values are shown as stored. Schema details explain their meaning.
      </footer>
    </div>
  );
}

type StateValueRow = StatePointRow & {
  diff?: { kind: StructuredDiffKind; exact: boolean; beforeValue: string; afterValue: string };
};
export function StateValueCell({ row }: { row: StateValueRow }) {
  if (row.status === 'missing') {
    return (
      <span className="inline-flex h-5 w-fit items-center rounded-[5px] bg-[var(--status-warning-muted)] px-1.5 font-sans text-xs font-semibold leading-4 text-[var(--status-warning)]">
        Missing
      </span>
    );
  }

  const value = row.diff?.kind === 'removed' ? row.diff.beforeValue : row.value;
  const title =
    row.diff?.exact && row.diff.kind === 'modified'
      ? `${row.diff.beforeValue} -> ${row.diff.afterValue}`
      : value;

  if (value === '-') {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate font-normal leading-5 text-[var(--text-primary)]',
        stateStructureValueTypographyClass(value),
        stateStructureValueToneClass(row.diff?.kind),
        !row.diff && value.toLowerCase() === 'empty' && 'text-[var(--text-tertiary)]'
      )}
      title={title}
    >
      {value}
    </span>
  );
}

export function stateStructureValueTypographyClass(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'empty') {
    return 'font-sans text-xs italic tracking-normal';
  }
  if (!/\s/.test(value.trim())) {
    return 'font-mono text-[13px] tracking-normal';
  }
  if (/^-?\d+(?:\.\d+)?\s+items?$/i.test(value.trim())) {
    return 'font-mono text-[13px] tracking-normal tabular-nums';
  }
  return 'font-sans text-[13px] tracking-normal';
}

function stateStructureValueToneClass(kind: StructuredDiffKind | undefined): string {
  if (kind === 'added') {
    return 'text-[var(--diff-added-text)]';
  }
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  if (kind === 'modified') return 'text-[var(--diff-modified-text)]';
  return 'text-[var(--text-primary)]';
}
