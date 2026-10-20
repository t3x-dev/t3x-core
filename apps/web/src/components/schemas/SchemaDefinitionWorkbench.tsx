'use client';

import { StudioSchemaEditLocalContributionSchema } from '@t3x-dev/api-client';
import { dump, JSON_SCHEMA, load } from 'js-yaml';
import {
  ChevronRight,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Lock,
  PencilRuler,
  Save,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WorkspaceYOpsEditor } from '@/components/workspaces/WorkspaceYOpsEditor';
import { SchemaDefinitionStructure } from './SchemaDefinitionStructure';

type LocalContribution = Record<string, unknown>;

const EMPTY_CONTRIBUTION: LocalContribution = { nodes: {} };

export function SchemaDefinitionWorkbench({
  open,
  onOpenChange,
  baseSchema,
  resultSchema,
  initialContribution,
  initialDefinition,
  pending = false,
  recoveryLabel,
  previewError,
  onPreview,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseSchema?: Record<string, unknown>;
  resultSchema?: Record<string, unknown>;
  initialContribution?: LocalContribution;
  initialDefinition?: LocalContribution;
  pending?: boolean;
  recoveryLabel?: string;
  previewError?: string;
  onPreview: (contribution: LocalContribution) => void;
  onSave: (contribution: LocalContribution, intent: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'structure' | 'yaml'>('structure');
  const [contribution, setContribution] = useState<LocalContribution>(EMPTY_CONTRIBUTION);
  const [yaml, setYaml] = useState('nodes: {}\n');
  const [intent, setIntent] = useState('Edit the Workspace-local Schema definition.');
  const [error, setError] = useState<string>();
  const [structureError, setStructureError] = useState<string>();
  const initialized = useRef(false);

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    // Preview echoes the edited definition back through these props. Do not
    // reinitialize an open editor or clear errors in other unfinished fields.
    if (initialized.current) return;
    initialized.current = true;
    const next = structuredClone(initialDefinition ?? initialContribution ?? EMPTY_CONTRIBUTION);
    setContribution(next);
    setYaml(renderYaml(next));
    setError(undefined);
    setStructureError(undefined);
  }, [initialDefinition, initialContribution, open]);

  function commit(next: LocalContribution) {
    setContribution(next);
    setYaml(renderYaml(next));
    setError(undefined);
    onPreview(next);
  }

  function parseYamlDraft() {
    try {
      const next = parseContribution(yaml);
      setContribution(next);
      setError(undefined);
      onPreview(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The local contribution is invalid.');
      return null;
    }
  }

  async function save() {
    if (structureError) return;
    const next = mode === 'yaml' ? parseYamlDraft() : contribution;
    if (!next) return;
    try {
      setError(undefined);
      await onSave(next, intent.trim() || 'Edit the Workspace-local Schema definition.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Schema definition could not be saved.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(860px,92dvh)] max-w-[min(1480px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1480px,96vw)]">
        <DialogHeader className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-6 py-4 pr-12 text-left">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]"
            >
              <PencilRuler className="size-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Edit Schema definition</DialogTitle>
              <DialogDescription className="max-w-3xl text-xs leading-relaxed">
                Edit the complete Workspace-local definition. Changes replay as guarded Schema YOps;
                published sources and root constraints remain unchanged. Structure and YAML edit the
                same candidate.
              </DialogDescription>
              {recoveryLabel ? (
                <p className="inline-flex rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                  {recoveryLabel}
                </p>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
          <section className="flex min-h-0 flex-col border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-4 py-2.5">
              <div
                role="tablist"
                aria-label="Definition editor mode"
                className="inline-flex rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-0.5"
              >
                {(['structure', 'yaml'] as const).map((item) => (
                  <button
                    aria-selected={mode === item}
                    disabled={mode === 'structure' && Boolean(structureError)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${mode === item ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    key={item}
                    onClick={() => {
                      if (item === 'structure' && mode === 'yaml' && !parseYamlDraft()) return;
                      setMode(item);
                    }}
                    role="tab"
                    type="button"
                  >
                    {item === 'structure' ? 'Structure' : 'YAML'}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <Button
                disabled={Boolean(structureError)}
                onClick={() => {
                  const next = mode === 'yaml' ? parseYamlDraft() : contribution;
                  if (next) onPreview(next);
                }}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                <Eye className="size-3.5" />
                Preview
              </Button>
            </div>

            {mode === 'yaml' ? (
              <div className="min-h-0 flex-1 bg-[var(--editor-bg)]">
                <WorkspaceYOpsEditor
                  ariaLabel={
                    initialDefinition
                      ? 'Schema definition YAML editor'
                      : 'Local Schema contribution YAML editor'
                  }
                  onChange={setYaml}
                  value={yaml}
                />
              </div>
            ) : (
              <SchemaDefinitionStructure
                value={contribution}
                onChange={commit}
                onValidationChange={setStructureError}
              />
            )}
          </section>

          <section className="grid min-h-0 grid-rows-2 gap-3 bg-[var(--surface-app)] p-4">
            <SchemaNodesPreview label="Base (immutable)" schema={baseSchema} tone="base" />
            <SchemaNodesPreview label="Result preview" schema={resultSchema} tone="result" />
          </section>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-6 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label className="sr-only" htmlFor="schema-edit-intent">
              Change intent
            </label>
            <Input
              className="max-w-xl bg-[var(--surface-panel)] text-xs"
              id="schema-edit-intent"
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Why are you changing this Schema?"
              value={intent}
            />
            {error || structureError || previewError ? (
              <p className="mt-1 text-xs text-[var(--destructive)]" role="alert">
                {error ?? structureError ?? previewError}
              </p>
            ) : null}
          </div>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={pending || Boolean(structureError)}
            onClick={() => void save()}
            variant="commit"
          >
            <Save className="size-4" /> {pending ? 'Saving…' : 'Save candidate'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SchemaNodesPreview({
  label,
  schema,
  tone,
}: {
  label: string;
  schema?: Record<string, unknown>;
  tone: 'base' | 'result';
}) {
  const Icon = tone === 'base' ? Lock : Eye;
  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]"
    >
      <h3 className="flex shrink-0 items-center gap-2 border-b border-[var(--stroke-divider)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span
          aria-hidden="true"
          className={`inline-flex size-5 items-center justify-center rounded-md ${tone === 'base' ? 'bg-[var(--surface-panel)] text-[var(--text-tertiary)]' : 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'}`}
        >
          <Icon className="size-3" />
        </span>
        {label}
      </h3>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-xs text-[var(--text-primary)]">
        {!schema ? (
          <p className="py-2 text-[var(--text-tertiary)]">Preview unavailable</p>
        ) : Object.keys(previewRecord(schema.nodes)).length === 0 ? (
          <p className="py-2 text-[var(--text-tertiary)]">No nodes defined</p>
        ) : (
          <SchemaDefinitionTree schema={schema} />
        )}
      </div>
    </section>
  );
}

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

function parseContribution(source: string): LocalContribution {
  const parsed = load(source, { schema: JSON_SCHEMA }) ?? {};
  return StudioSchemaEditLocalContributionSchema.parse(parsed);
}

function renderYaml(value: unknown): string {
  return dump(value, { noRefs: true, lineWidth: 100, sortKeys: false });
}
