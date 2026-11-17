'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  type FieldTestInputKind,
  parseFieldTestValue,
  testSchemaFieldValue,
} from '@/domain/schemas/fieldValidation';
import type { SchemaDefinition } from '@/domain/schemas/schemaFieldEditing';

export function SchemaFieldValueTest({
  definition,
  required,
  path,
  disclosure = false,
}: {
  definition: SchemaDefinition;
  required: boolean;
  path: string;
  disclosure?: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<FieldTestInputKind>('text');
  const [text, setText] = useState('');
  const [tested, setTested] = useState(false);
  const result = useMemo(() => {
    if (!tested) return undefined;
    try {
      return testSchemaFieldValue(definition, required, path, parseFieldTestValue(kind, text));
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not test this value.' };
    }
  }, [tested, definition, required, path, kind, text]);
  const Container = disclosure ? 'details' : 'section';
  return (
    <Container
      aria-label="Test a value"
      className="space-y-3 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
    >
      {disclosure ? (
        <summary className="cursor-pointer rounded-md text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
          Test a value
        </summary>
      ) : (
        <h3 className="text-xs font-medium">Test a value</h3>
      )}
      <label className="block space-y-1 text-xs" htmlFor={`${id}-type`}>
        <span>Input type</span>
        <select
          id={`${id}-type`}
          className="h-8 w-full rounded-md border px-2"
          value={kind}
          onChange={(event) => {
            const next = event.target.value as FieldTestInputKind;
            setKind(next);
            setText(next === 'boolean' ? 'true' : '');
            setTested(false);
          }}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="json">JSON</option>
          <option value="null">Null</option>
          <option value="missing">Not provided</option>
        </select>
      </label>
      {kind !== 'missing' && kind !== 'null' ? (
        <label className="block space-y-1 text-xs" htmlFor={`${id}-value`}>
          <span>Sample value</span>
          {kind === 'boolean' ? (
            <select
              id={`${id}-value`}
              className="h-8 w-full rounded-md border px-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : kind === 'json' || kind === 'text' ? (
            <Textarea
              id={`${id}-value`}
              rows={2}
              className="min-h-16 text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === 'json' ? '[1, 2, 3]' : 'Try a value…'}
            />
          ) : (
            <Input
              id={`${id}-value`}
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </label>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          {kind === 'missing' ? 'No value is provided.' : 'The value is null.'}
        </p>
      )}
      <Button size="sm" variant="canvas-outline" onClick={() => setTested(true)}>
        Test value
      </Button>
      <div aria-live="polite" className="space-y-2 text-xs">
        {result ? (
          'error' in result ? (
            <p role="alert">{result.error}</p>
          ) : (
            <>
              <strong
                className={
                  result.passed ? 'text-[var(--accent-leaf)]' : 'text-[var(--status-error)]'
                }
              >
                {result.passed ? 'Field rules passed' : 'Field rules failed'}
              </strong>
              <code className="block break-all text-[var(--text-secondary)]">{path}</code>
              {result.issues.length ? (
                <ul className="list-disc space-y-1 pl-4">
                  {result.issues.map((issue, index) => (
                    <li key={`${issue.code}:${index}`}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}
              {result.needsEvidence ? (
                <p>Supporting evidence still needs Workspace context.</p>
              ) : null}
            </>
          )
        ) : null}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Local test only. Relationships and whole-object checks run in Workspace.
      </p>
    </Container>
  );
}
