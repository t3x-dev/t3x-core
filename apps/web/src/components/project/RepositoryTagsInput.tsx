'use client';

import { RepositoryTagsSchema } from '@t3x-dev/api-client';
import { X } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './StateOverviewView.module.css';

export type RepositoryTagsDraft = { tags: string[]; input: string };

export function RepositoryTagsInput({
  value,
  onChange,
  disabled = false,
}: {
  value: RepositoryTagsDraft;
  onChange: (value: RepositoryTagsDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  // Keep the unfinished input in the parent draft so Save includes it even
  // when the user has not pressed Enter or Add.
  const parsed = RepositoryTagsSchema.safeParse([...value.tags, value.input]);
  function addTag() {
    if (parsed.success) onChange({ tags: parsed.data, input: '' });
  }
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor={id}>
        Tags
      </label>
      {value.tags.length ? (
        <fieldset className={styles.tags} aria-label="Selected tags">
          {value.tags.map((tag) => (
            <span key={tag} className="gap-1.5">
              {tag.startsWith('#') ? tag : `#${tag}`}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove tag ${tag}`}
                className="shrink-0 rounded-full p-1 hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                onClick={() =>
                  onChange({ ...value, tags: value.tags.filter((item) => item !== tag) })
                }
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </fieldset>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-tertiary)]"
          >
            {value.input.startsWith('#') ? '' : '#'}
          </span>
          <Input
            id={id}
            className="pl-7"
            placeholder="Add a tag"
            autoComplete="off"
            value={value.input}
            disabled={disabled}
            aria-describedby={`${id}-help${parsed.success ? '' : ` ${id}-error`}`}
            aria-invalid={!parsed.success}
            onChange={(event) => onChange({ ...value, input: event.target.value })}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Enter confirms a Chinese IME candidate before it can add a tag.
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              event.preventDefault();
              addTag();
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label="Add tag"
          disabled={disabled || !value.input.trim() || !parsed.success}
          onClick={addTag}
        >
          Add
        </Button>
      </div>
      <p id={`${id}-help`} className="text-xs text-[var(--text-secondary)]">
        Press Enter or Add to create a tag. Up to 32 tags, 64 characters each. Chinese and custom
        tags are welcome.
      </p>
      {!parsed.success ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-[var(--status-error)]">
          {parsed.error.issues[0]?.message}
        </p>
      ) : null}
    </div>
  );
}
