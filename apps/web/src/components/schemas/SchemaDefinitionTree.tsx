'use client';
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useState } from 'react';

export function SchemaDefinitionTree({ schema }: { schema: Record<string, unknown> }) {
  return (
    <div className="min-w-full w-max">
      {Object.entries(previewRecord(schema.nodes)).map(([name, node]) => (
        <SchemaPreviewNode key={name} name={name} node={previewRecord(node)} path={name} />
      ))}
    </div>
  );
}

function previewRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function SchemaPreviewTags({ value }: { value: Record<string, unknown> }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-4">
      {Object.entries(value).map(([key, property]) => {
        const text = property === true ? key : `${key}: ${JSON.stringify(property)}`;
        const tone =
          property === true && key === 'required'
            ? 'border-transparent bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]'
            : property === true && key === 'repeated'
              ? 'border-transparent bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
              : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]';
        return (
          <span
            key={key}
            title={text}
            className={`max-w-52 truncate rounded-full border px-2 py-0.5 font-mono text-[10px] font-normal ${tone}`}
          >
            {text}
          </span>
        );
      })}
    </span>
  );
}

function SchemaPreviewNode({
  name,
  node,
  path,
}: {
  name: string;
  node: Record<string, unknown>;
  path: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const slots = previewRecord(node.slots);
  const children = previewRecord(node.children);
  const requiredSlots = Array.isArray(node.requiredSlots) ? node.requiredSlots : [];
  const attributes = Object.fromEntries(
    Object.entries(node).filter(
      ([key]) =>
        !['slots', 'requiredSlots'].includes(key) && (key !== 'children' || node.children === 'any')
    )
  );
  const FolderIcon = expanded ? FolderOpen : Folder;
  return (
    <div>
      <button
        type="button"
        aria-label={`Node ${path}`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-md px-1.5 text-left transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-commit)]"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-[var(--accent-commit)]" />
        <span className="font-mono font-medium">{name}</span>
        <SchemaPreviewTags value={attributes} />
      </button>
      {expanded ? (
        <div className="ml-3.5 border-l border-[var(--stroke-default)] pl-3">
          {Object.entries(slots).map(([slotName, slot]) => (
            <section
              key={slotName}
              aria-label={`Slot ${path}/${slotName}`}
              className="flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-1.5 hover:bg-[var(--hover-bg)]"
            >
              <FileText
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[var(--text-tertiary)]"
              />
              <span className="font-mono">{slotName}</span>
              <SchemaPreviewTags
                value={{
                  ...previewRecord(slot),
                  ...(requiredSlots.includes(slotName) ? { required: true } : {}),
                }}
              />
            </section>
          ))}
          {Object.entries(children).map(([childName, child]) => (
            <SchemaPreviewNode
              key={childName}
              name={childName}
              node={previewRecord(child)}
              path={`${path}/${childName}`}
            />
          ))}
          {Object.keys(slots).length === 0 && Object.keys(children).length === 0 ? (
            <p className="py-2 text-[11px] text-[var(--text-tertiary)]">
              {node.children === 'any' ? 'Any children allowed' : 'No slots or child nodes'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
