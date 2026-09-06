'use client';
import { ArrowRight, Box, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspaceTransition } from '@/hooks/workspaces/useWorkspaceTransition';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';

type WorkspaceTransitionContent = { trees: WorkspaceYOpsTreeNode[]; relations: unknown[] };

import type { WorkspaceCandidate } from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode, WorkspaceYOpsValue } from '@/types/workspaceYops';
import { ChangeDecisionHandoff } from './ChangeDecisionHandoff';

/** A local human draft. Only the existing native review/decision lifecycle writes a Commit. */
export function WorkspaceContentEditor({ candidate }: { candidate: WorkspaceCandidate }) {
  const { loadDraftContent } = useWorkspaceYOps(candidate);
  const transition = useWorkspaceTransition(candidate);
  const [content, setContent] = useState<WorkspaceTransitionContent>();
  const [error, setError] = useState<string>();
  const [why, setWhy] = useState('');
  const busy = transition.state.phase === 'reviewing';
  useEffect(() => {
    let current = true;
    void loadDraftContent()
      .then((result) => {
        if (!current) return;
        // Realtime draft saves refresh the candidate; never overwrite local author edits.
        setContent((existing) => existing ?? result);
      })
      .catch((cause: unknown) => {
        if (current) setError(String(cause));
      });
    return () => {
      current = false;
    };
  }, [loadDraftContent]);
  function update(trees: WorkspaceYOpsTreeNode[]) {
    if (!content) return;
    transition.reset();
    setContent({ ...content, trees });
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:overflow-hidden lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
      <section aria-label="Edit structured content" className="min-w-0 p-5 lg:overflow-y-auto">
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Edit values and named nodes, then review the exact change.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!content && !error ? <output>Loading current draft…</output> : null}
        <form
          onChange={transition.reset}
          onSubmit={(event) => {
            event.preventDefault();
            if (content) void transition.review(content, why);
          }}
        >
          <fieldset disabled={busy || Boolean(candidate.lastCommitHash)} className="space-y-4">
            {content?.trees.map((node, index) => (
              <NodeEditor
                key={node.key}
                node={node}
                path={node.key}
                onChange={(next) =>
                  update(content.trees.map((item, i) => (i === index ? next : item)))
                }
              />
            ))}
            {content ? (
              <AddName
                label="Root node"
                onAdd={(key) => {
                  if (content.trees.some((node) => node.key === key)) return false;
                  update([...content.trees, { key, slots: {}, children: [] }]);
                  return true;
                }}
              />
            ) : null}
            <label htmlFor="content-change-note" className="block text-xs font-medium">
              Change note
              <Input
                id="content-change-note"
                value={why}
                onChange={(event) => {
                  transition.reset();
                  setWhy(event.target.value);
                }}
                placeholder="Why are you making this change?"
                className="mt-2"
              />
            </label>
            <Button disabled={!content || busy} type="submit">
              Review structured change <ArrowRight className="size-4" />
            </Button>
          </fieldset>
        </form>
      </section>
      <aside
        aria-label="Content preview and review"
        className="min-w-0 space-y-4 lg:overflow-y-auto border-l border-[var(--stroke-divider)] bg-[var(--status-info-muted)]/30 p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Draft preview</h3>
          <span className="font-mono text-xs text-[var(--status-info)]">T3X</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Local draft · not committed</p>
        {content ? (
          <>
            <StateSemanticReader trees={content.trees} />
            {content.relations.length ? (
              <details>
                <summary>Relations</summary>
                <StateValueReader value={content.relations} />
              </details>
            ) : null}
          </>
        ) : null}
        {transition.state.error ? (
          <p role="alert" className="text-sm text-[var(--status-error)]">
            {transition.state.error}
          </p>
        ) : null}
        {busy ? <output className="text-sm">Reviewing exact draft…</output> : null}
        {transition.state.view ? (
          <section
            aria-label="Native review result"
            className="border-y border-[var(--stroke-divider)] py-4"
          >
            <h4 className="text-sm font-semibold">
              {transition.state.view.capabilities.accept.disposition === 'allowed'
                ? 'Ready for your decision'
                : 'Review needs attention'}
            </h4>
            <p className="mt-2 text-xs">
              Native validation ·{' '}
              {transition.state.view.checks.validation.outcomes.join(', ') || 'Not observed'}
            </p>
            {transition.state.view.capabilities.accept.reasons.map((reason) => (
              <p key={reason.code} className="mt-2 text-xs text-[var(--status-warning)]">
                {reason.message}
              </p>
            ))}
          </section>
        ) : null}
        {transition.state.reviewSnapshot ? (
          <ChangeDecisionHandoff compact reviewSnapshot={transition.state.reviewSnapshot} />
        ) : null}
      </aside>
    </div>
  );
}
function NodeEditor({
  node,
  path,
  onChange,
}: {
  node: WorkspaceYOpsTreeNode;
  path: string;
  onChange: (node: WorkspaceYOpsTreeNode) => void;
}) {
  return (
    <section
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
      aria-label={`Node ${path}`}
    >
      <header className="flex items-center gap-2 border-b border-[var(--stroke-divider)] px-3 py-2 font-mono text-xs">
        <Box className="size-4 text-[var(--status-info)]" />
        {path}
      </header>
      <div className="space-y-3 p-3">
        {Object.entries(node.slots).map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(90px,1fr)_minmax(0,2fr)_28px] items-start gap-2"
          >
            <label htmlFor={`slot-${path}/${key}`} className="pt-2 text-xs font-medium">
              {key}
            </label>
            <SlotInput
              id={`slot-${path}/${key}`}
              label={`${path}/${key}`}
              value={value}
              onChange={(next) => onChange({ ...node, slots: { ...node.slots, [key]: next } })}
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove field ${path}/${key}`}
              onClick={() => {
                const slots = { ...node.slots };
                delete slots[key];
                onChange({ ...node, slots });
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
        <AddName
          label={`Field in ${path}`}
          onAdd={(key, type) => {
            if (Object.hasOwn(node.slots, key)) return false;
            const value =
              type === 'boolean'
                ? false
                : type === 'number'
                  ? 0
                  : type === 'object'
                    ? {}
                    : type === 'array'
                      ? []
                      : '';
            onChange({ ...node, slots: { ...node.slots, [key]: value } });
            return true;
          }}
          types
        />
        {node.children.map((child, index) => (
          <div key={child.key} className="relative pl-3">
            <NodeEditor
              node={child}
              path={`${path}/${child.key}`}
              onChange={(next) =>
                onChange({
                  ...node,
                  children: node.children.map((item, i) => (i === index ? next : item)),
                })
              }
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove node ${path}/${child.key}`}
              onClick={() =>
                onChange({ ...node, children: node.children.filter((_, i) => i !== index) })
              }
            >
              Remove node
            </Button>
          </div>
        ))}
        <AddName
          label={`Child node in ${path}`}
          onAdd={(key) => {
            if (node.children.some((child) => child.key === key)) return false;
            onChange({ ...node, children: [...node.children, { key, slots: {}, children: [] }] });
            return true;
          }}
        />
      </div>
    </section>
  );
}
function AddName({
  label,
  onAdd,
  types = false,
}: {
  label: string;
  onAdd: (key: string, type: string) => boolean;
  types?: boolean;
}) {
  const [key, setKey] = useState('');
  const [type, setType] = useState('string');
  const [error, setError] = useState('');
  return (
    <details className="text-xs text-[var(--text-secondary)]">
      <summary
        className="cursor-pointer py-1 text-[var(--status-info)]"
        aria-label={`Show ${label}`}
      >
        {types ? '+ Add field' : '+ Add node'}
      </summary>
      <div className="mt-2 flex gap-2">
        <Input
          aria-label={label}
          placeholder={types ? 'Field name' : 'Node name'}
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setError('');
          }}
          className="h-8 font-mono text-xs"
        />
        {types ? (
          <select
            aria-label={`${label} type`}
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-xs"
          >
            {['string', 'number', 'boolean', 'object', 'array'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Add ${label}`}
          disabled={!key.trim()}
          onClick={(event) => {
            if (!/^[a-z][a-z0-9_]*$/.test(key)) {
              setError('Use lowercase letters, numbers and underscores; start with a letter.');
              return;
            }
            if (!onAdd(key, type)) {
              setError('This name already exists.');
              return;
            }
            setKey('');
            setError('');
            event.currentTarget.closest('details')?.removeAttribute('open');
          }}
        >
          <Plus className="size-3" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[var(--status-error)]">
          {error}
        </p>
      ) : null}
    </details>
  );
}
function SlotInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: WorkspaceYOpsValue;
  onChange: (value: WorkspaceYOpsValue) => void;
}) {
  const [raw, setRaw] = useState(JSON.stringify(value));
  const [invalid, setInvalid] = useState(false);
  if (typeof value === 'boolean')
    return (
      <input
        id={id}
        aria-label={label}
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-2 size-4 justify-self-start"
      />
    );
  if (typeof value === 'string' || typeof value === 'number')
    return (
      <Input
        id={id}
        aria-label={label}
        type={typeof value === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(event) => {
          const next = typeof value === 'number' ? event.target.valueAsNumber : event.target.value;
          if (typeof next !== 'number' || Number.isFinite(next)) onChange(next);
        }}
        className="h-8 text-xs"
      />
    );
  return (
    <div>
      <textarea
        id={id}
        aria-label={label}
        aria-invalid={invalid}
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          event.currentTarget.setCustomValidity('');
          try {
            const next: WorkspaceYOpsValue = JSON.parse(event.target.value);
            onChange(next);
            setInvalid(false);
          } catch {
            setInvalid(true);
            event.currentTarget.setCustomValidity('Enter valid JSON before reviewing.');
          }
        }}
        className="w-full rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 font-mono text-xs"
      />
      {invalid ? (
        <p role="alert" className="text-xs text-[var(--status-error)]">
          Enter valid JSON before reviewing.
        </p>
      ) : null}
    </div>
  );
}
