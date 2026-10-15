'use client';

import { RepositoryTagsSchema } from '@t3x-dev/api-client';
import { useId } from 'react';
import styles from './StateOverviewView.module.css';

export function RepositoryTagsInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const parsed = RepositoryTagsSchema.safeParse(value.split('\n'));
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>
        Tags, one per line
      </label>
      <textarea
        id={id}
        className="w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] p-2 text-sm"
        rows={3}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        aria-invalid={!parsed.success}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-help`} className="text-xs text-[var(--text-secondary)]">
        Optional · up to 32 tags, 64 characters each. Chinese and custom tags are welcome. Blank
        lines and exact duplicates are removed; case and order are preserved.
      </p>
      {parsed.success ? (
        <fieldset className={styles.tags} aria-label="Tags preview">
          {parsed.data.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </fieldset>
      ) : (
        <p role="alert" className="text-sm text-[var(--status-error)]">
          {parsed.error.issues[0]?.message}
        </p>
      )}
    </div>
  );
}
