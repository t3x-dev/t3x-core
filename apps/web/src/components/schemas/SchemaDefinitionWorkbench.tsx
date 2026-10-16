'use client';

import { StudioSchemaEditLocalContributionSchema } from '@t3x-dev/api-client';
import { dump, JSON_SCHEMA, load } from 'js-yaml';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

type LocalContribution = Record<string, unknown>;
type LocalNode = {
  required?: boolean;
  repeated?: boolean;
  slots?: Record<string, Record<string, unknown>>;
  requiredSlots?: string[];
  [key: string]: unknown;
};

const EMPTY_CONTRIBUTION: LocalContribution = { nodes: {} };

export function SchemaDefinitionWorkbench({
  open,
  onOpenChange,
  baseSchema,
  resultSchema,
  initialContribution,
  pending = false,
  recoveryLabel,
  onPreview,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseSchema?: Record<string, unknown>;
  resultSchema?: Record<string, unknown>;
  initialContribution?: LocalContribution;
  pending?: boolean;
  recoveryLabel?: string;
  onPreview: (contribution: LocalContribution) => void;
  onSave: (contribution: LocalContribution, intent: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'structure' | 'yaml'>('structure');
  const [contribution, setContribution] = useState<LocalContribution>(EMPTY_CONTRIBUTION);
  const [yaml, setYaml] = useState('nodes: {}\n');
  const [intent, setIntent] = useState('Edit the Workspace-local Schema definition.');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const next = structuredClone(initialContribution ?? EMPTY_CONTRIBUTION);
    setContribution(next);
    setYaml(renderYaml(next));
    setError(undefined);
  }, [initialContribution, open]);

  const nodes = useMemo(() => localNodes(contribution), [contribution]);

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
        <DialogHeader className="shrink-0 border-b border-[var(--stroke-divider)] px-6 py-4 pr-12 text-left">
          <DialogTitle>Edit Schema definition</DialogTitle>
          <DialogDescription>
            Add a Workspace-local contribution. Published sources remain immutable; Structure and
            YAML edit the same candidate.
          </DialogDescription>
          {recoveryLabel ? (
            <p className="text-[11px] text-[var(--text-tertiary)]">{recoveryLabel}</p>
          ) : null}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
          <section className="flex min-h-0 flex-col border-r border-[var(--stroke-divider)]">
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--stroke-divider)] px-4 py-2">
              {(['structure', 'yaml'] as const).map((item) => (
                <button
                  aria-selected={mode === item}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${mode === item ? 'bg-[var(--active-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
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
              <span className="flex-1" />
              <Button
                onClick={() => {
                  const next = mode === 'yaml' ? parseYamlDraft() : contribution;
                  if (next) onPreview(next);
                }}
                size="sm"
                type="button"
                variant="canvas-outline"
              >
                Preview
              </Button>
            </div>

            {mode === 'yaml' ? (
              <div className="min-h-0 flex-1 bg-[var(--editor-bg)]">
                <WorkspaceYOpsEditor
                  ariaLabel="Local Schema contribution YAML editor"
                  onChange={setYaml}
                  value={yaml}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Local nodes
                    </h3>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      New nodes and Slots compile after the selected sources.
                    </p>
                  </div>
                  <Button
                    onClick={() => commit(addNode(contribution))}
                    size="sm"
                    type="button"
                    variant="canvas-outline"
                  >
                    <Plus className="size-3.5" /> Add node
                  </Button>
                </div>
                {Object.keys(nodes).length ? (
                  Object.entries(nodes).map(([nodeName, node]) => (
                    <LocalNodeEditor
                      key={nodeName}
                      name={nodeName}
                      node={node}
                      onChange={(nextName, nextNode) =>
                        commit(replaceNode(contribution, nodeName, nextName, nextNode))
                      }
                      onRemove={() => commit(removeNode(contribution, nodeName))}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--stroke-strong)] p-8 text-center text-xs text-[var(--text-tertiary)]">
                    No local nodes yet. The base Schema on the right is unchanged.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid min-h-0 grid-rows-2 bg-[var(--surface-subtle)]">
            <SchemaYamlPreview label="Base (immutable)" schema={baseSchema} />
            <SchemaYamlPreview label="Result preview" schema={resultSchema} bordered />
          </section>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--stroke-divider)] px-6 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label className="sr-only" htmlFor="schema-edit-intent">
              Change intent
            </label>
            <Input
              className="max-w-xl"
              id="schema-edit-intent"
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Why are you changing this Schema?"
              value={intent}
            />
            {error ? (
              <p className="mt-1 text-xs text-[var(--destructive)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void save()} variant="commit">
            <Save className="size-4" /> {pending ? 'Saving…' : 'Save candidate'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LocalNodeEditor({
  name,
  node,
  onChange,
  onRemove,
}: {
  name: string;
  node: LocalNode;
  onChange: (name: string, node: LocalNode) => void;
  onRemove: () => void;
}) {
  const slots = node.slots ?? {};
  return (
    <article className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Node name ${name}`}
          className="font-mono text-xs"
          onChange={(event) => onChange(event.target.value, node)}
          value={name}
        />
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
          <input
            checked={node.required === true}
            onChange={(event) => onChange(name, { ...node, required: event.target.checked })}
            type="checkbox"
          />
          required
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
          <input
            checked={node.repeated === true}
            onChange={(event) => onChange(name, { ...node, repeated: event.target.checked })}
            type="checkbox"
          />
          repeated
        </label>
        <Button
          aria-label={`Remove node ${name}`}
          onClick={onRemove}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {Object.entries(slots).map(([slotName, slot]) => (
          <div
            className="grid grid-cols-[minmax(120px,1fr)_110px_auto_auto] items-center gap-2"
            key={slotName}
          >
            <Input
              aria-label={`Slot name ${slotName}`}
              className="font-mono text-xs"
              onChange={(event) =>
                onChange(name, replaceSlot(node, slotName, event.target.value, slot))
              }
              value={slotName}
            />
            <select
              aria-label={`Slot type ${slotName}`}
              className="h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs"
              onChange={(event) =>
                onChange(
                  name,
                  replaceSlot(node, slotName, slotName, { ...slot, type: event.target.value })
                )
              }
              value={typeof slot.type === 'string' ? slot.type : 'string'}
            >
              {['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <input
                checked={node.requiredSlots?.includes(slotName) ?? false}
                onChange={(event) =>
                  onChange(name, setSlotRequired(node, slotName, event.target.checked))
                }
                type="checkbox"
              />
              required
            </label>
            <Button
              aria-label={`Remove slot ${slotName}`}
              onClick={() => onChange(name, removeSlot(node, slotName))}
              size="icon-sm"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          onClick={() => onChange(name, addSlot(node))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" /> Add Slot
        </Button>
      </div>
    </article>
  );
}

function SchemaYamlPreview({
  label,
  schema,
  bordered = false,
}: {
  label: string;
  schema?: Record<string, unknown>;
  bordered?: boolean;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col ${bordered ? 'border-t border-[var(--stroke-divider)]' : ''}`}
    >
      <h3 className="shrink-0 px-4 py-2 text-xs font-semibold text-[var(--text-secondary)]">
        {label}
      </h3>
      <pre className="min-h-0 flex-1 overflow-auto px-4 pb-4 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
        {schema ? renderYaml(schema) : '# Preview unavailable'}
      </pre>
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

function localNodes(contribution: LocalContribution): Record<string, LocalNode> {
  const nodes = contribution.nodes;
  return nodes && typeof nodes === 'object' && !Array.isArray(nodes)
    ? (nodes as Record<string, LocalNode>)
    : {};
}

function nextKey(existing: Record<string, unknown>, prefix: string): string {
  if (!Object.hasOwn(existing, prefix)) return prefix;
  let index = 2;
  while (Object.hasOwn(existing, `${prefix}_${index}`)) index++;
  return `${prefix}_${index}`;
}

function addNode(contribution: LocalContribution): LocalContribution {
  const nodes = localNodes(contribution);
  const name = nextKey(nodes, 'new_node');
  return { ...contribution, nodes: { ...nodes, [name]: { slots: {} } } };
}

function replaceNode(
  contribution: LocalContribution,
  oldName: string,
  name: string,
  node: LocalNode
): LocalContribution {
  const nodes = localNodes(contribution);
  if (name !== oldName && Object.hasOwn(nodes, name)) return contribution;
  const next: Record<string, LocalNode> = {};
  for (const [key, value] of Object.entries(nodes))
    next[key === oldName ? name : key] = key === oldName ? node : value;
  return { ...contribution, nodes: next };
}

function removeNode(contribution: LocalContribution, name: string): LocalContribution {
  const nodes = { ...localNodes(contribution) };
  delete nodes[name];
  return { ...contribution, nodes };
}

function addSlot(node: LocalNode): LocalNode {
  const slots = node.slots ?? {};
  const name = nextKey(slots, 'new_slot');
  return { ...node, slots: { ...slots, [name]: { type: 'string' } } };
}

function replaceSlot(
  node: LocalNode,
  oldName: string,
  name: string,
  slot: Record<string, unknown>
): LocalNode {
  if (name !== oldName && Object.hasOwn(node.slots ?? {}, name)) return node;
  const slots: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(node.slots ?? {}))
    slots[key === oldName ? name : key] = key === oldName ? slot : value;
  const requiredSlots = (node.requiredSlots ?? []).map((key) => (key === oldName ? name : key));
  return { ...node, slots, ...(requiredSlots.length ? { requiredSlots } : {}) };
}

function removeSlot(node: LocalNode, name: string): LocalNode {
  const slots = { ...(node.slots ?? {}) };
  delete slots[name];
  const requiredSlots = (node.requiredSlots ?? []).filter((key) => key !== name);
  return {
    ...node,
    slots,
    ...(requiredSlots.length ? { requiredSlots } : { requiredSlots: undefined }),
  };
}

function setSlotRequired(node: LocalNode, name: string, required: boolean): LocalNode {
  const values = new Set(node.requiredSlots ?? []);
  if (required) values.add(name);
  else values.delete(name);
  const requiredSlots = [...values].sort();
  return { ...node, ...(requiredSlots.length ? { requiredSlots } : { requiredSlots: undefined }) };
}
