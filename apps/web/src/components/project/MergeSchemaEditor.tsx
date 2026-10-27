'use client';

import type { MergeSchemaResolution, SchemaContentMigrationCommand } from '@t3x-dev/api-client';
import { useId, useState } from 'react';
import {
  newPreparationChange,
  type PreparationChange,
  PreparationChangeForm,
  type PreparationValue,
  preparationCommands,
} from '@/components/schemas/SchemaPreparationFields';
import type { ApiPullRequestMergeReview } from '@/domain/project/pullRequestMergeReview';
import { walkDraftStructure } from '@/domain/workspaces/draftStructure';
import styles from './PullRequestMergeReview.module.css';

const json = (value: unknown) => (value === undefined ? 'Absent' : JSON.stringify(value, null, 2));
const removes = (choice: MergeSchemaResolution['choices'][string] | undefined) =>
  typeof choice === 'object' && choice !== null && 'remove' in choice;
function editableValue(value: unknown): PreparationValue {
  if (Array.isArray(value))
    return {
      type: 'array',
      text: '',
      children: value.map((item, i) => ({
        id: crypto.randomUUID(),
        name: String(i),
        value: editableValue(item),
      })),
    };
  if (value !== null && typeof value === 'object')
    return {
      type: 'object',
      text: '',
      children: Object.entries(value).map(([name, item]) => ({
        id: crypto.randomUUID(),
        name,
        value: editableValue(item),
      })),
    };
  return {
    type:
      value === null
        ? 'null'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'text',
    text: String(value ?? ''),
    children: [],
  };
}
function editableCommand(command: SchemaContentMigrationCommand): PreparationChange {
  return {
    ...newPreparationChange(),
    kind: command.kind,
    path: command.kind === 'move' ? command.from : command.path,
    destination:
      command.kind === 'move' ? command.to : command.kind === 'rename_node' ? command.toKey : '',
    value: editableValue('value' in command ? command.value : ''),
  };
}

/** Same concrete migration controls as Schema preparation; no independent mutation engine. */
export function MergeSchemaEditor({
  review,
  resolution,
  sourceBranch,
  targetBranch,
  onChange,
  stale = false,
}: {
  review: NonNullable<ApiPullRequestMergeReview['schema_merge']>;
  resolution: MergeSchemaResolution;
  sourceBranch: string;
  targetBranch: string;
  onChange: (value: MergeSchemaResolution, valid: boolean) => void;
  stale?: boolean;
}) {
  const pathsId = useId();
  const [changes, setChanges] = useState(() => resolution.commands.map(editableCommand));
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(resolution.choices).flatMap(([path, choice]) =>
        typeof choice === 'object' && 'value' in choice ? [[path, json(choice.value)]] : []
      )
    )
  );
  const [error, setError] = useState<string>();
  const [invalidPaths, setInvalidPaths] = useState<Set<string>>(new Set());
  function update(
    choices: MergeSchemaResolution['choices'],
    edits: PreparationChange[],
    invalid = invalidPaths
  ) {
    try {
      const commands = preparationCommands(edits);
      setError(undefined);
      onChange({ choices, commands }, invalid.size === 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid content edits.');
      onChange({ ...resolution, choices }, false);
    }
  }
  const paths = review.before ? walkDraftStructure(review.before).map((node) => node.path) : [];
  return (
    <section aria-label="Resolve Schema and content together" className={styles.schemaEditor}>
      <h3>Resolve Schema & content</h3>
      <p>Changes stay in this merge draft. Save and recheck the complete result before merging.</p>
      {(review.conflicts ?? []).map((conflict) => (
        <fieldset key={conflict.path}>
          <legend>{conflict.path}</legend>
          <div className={styles.schemaSides}>
            <div>
              <b>Base</b>
              <pre>{json(conflict.base)}</pre>
            </div>
            <div>
              <b>{targetBranch}</b>
              <pre>{json(conflict.target)}</pre>
            </div>
            <div>
              <b>{sourceBranch}</b>
              <pre>{json(conflict.source)}</pre>
            </div>
          </div>
          <div className={styles.bulkActions}>
            {(['target', 'source'] as const).map((side) => (
              <button
                type="button"
                key={side}
                aria-pressed={resolution.choices[conflict.path] === side}
                onClick={() => {
                  const invalid = new Set(invalidPaths);
                  invalid.delete(conflict.path);
                  setInvalidPaths(invalid);
                  update({ ...resolution.choices, [conflict.path]: side }, changes, invalid);
                }}
              >
                Use {side === 'source' ? sourceBranch : targetBranch}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={removes(resolution.choices[conflict.path])}
              onClick={() => {
                const invalid = new Set(invalidPaths);
                invalid.delete(conflict.path);
                setInvalidPaths(invalid);
                update(
                  { ...resolution.choices, [conflict.path]: { remove: true } },
                  changes,
                  invalid
                );
              }}
            >
              Remove definition value
            </button>
            <button
              type="button"
              onClick={() => {
                const choices = { ...resolution.choices };
                delete choices[conflict.path];
                const invalid = new Set(invalidPaths);
                invalid.delete(conflict.path);
                setInvalidPaths(invalid);
                update(choices, changes, invalid);
              }}
            >
              Reset choice
            </button>
          </div>
          <label>
            Custom value (JSON)
            <textarea
              aria-label={`Custom Schema value ${conflict.path}`}
              rows={3}
              value={custom[conflict.path] ?? ''}
              placeholder="Enter a JSON value"
              onChange={(event) => {
                const text = event.target.value;
                setCustom({ ...custom, [conflict.path]: text });
                const invalid = new Set(invalidPaths);
                try {
                  const value = JSON.parse(text);
                  invalid.delete(conflict.path);
                  setInvalidPaths(invalid);
                  update({ ...resolution.choices, [conflict.path]: { value } }, changes, invalid);
                } catch {
                  invalid.add(conflict.path);
                  setInvalidPaths(invalid);
                  onChange(resolution, false);
                }
              }}
            />
          </label>
        </fieldset>
      ))}
      <details open={Boolean(review.issues?.length || changes.length)}>
        <summary>Prepare affected content</summary>
        <p>Move or edit values explicitly. Nothing is silently removed or converted.</p>
        <datalist id={pathsId}>
          {paths.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
        {changes.map((change, index) => (
          <PreparationChangeForm
            key={change.id}
            change={change}
            index={index}
            pathsId={pathsId}
            onChange={(next) => {
              const edits = changes.map((item) => (item.id === change.id ? next : item));
              setChanges(edits);
              update(resolution.choices, edits);
            }}
            onRemove={() => {
              const edits = changes.filter((item) => item.id !== change.id);
              setChanges(edits);
              update(resolution.choices, edits);
            }}
          />
        ))}
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            const edits = [...changes, newPreparationChange()];
            setChanges(edits);
            update(resolution.choices, edits);
          }}
        >
          Add content change
        </button>
      </details>
      {invalidPaths.size > 0 && (
        <p role="alert">Enter valid JSON for each custom Schema value, or choose a branch.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {review.definition_error && <p role="alert">{review.definition_error}</p>}
      {!!review.issues?.length && (
        <ul aria-label="Merged content issues">
          {review.issues.map((issue, i) => (
            <li key={`${issue.path}:${i}`}>
              <code>{issue.path}</code> {issue.message}
            </li>
          ))}
        </ul>
      )}
      {review.after != null && (
        <details>
          <summary>
            {stale
              ? 'Previous checked preview · recheck after editing'
              : 'Complete merged content preview'}
          </summary>
          <pre>{json(review.after)}</pre>
        </details>
      )}
    </section>
  );
}
