'use client';

import { Pencil } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import styles from './StateOverviewView.module.css';

export function RepositoryDescriptionEditor({
  description,
  onSave,
}: {
  description: string;
  onSave: (description: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusInput = useCallback((element: HTMLTextAreaElement | null) => element?.focus(), []);
  const close = () => {
    setEditing(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  if (editing)
    return (
      <form
        className={styles.descriptionEditor}
        onSubmit={async (event) => {
          event.preventDefault();
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true);
          setError(null);
          try {
            await onSave(draft.trim());
            close();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save the description.');
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Repository description
          <textarea
            ref={focusInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            disabled={busy}
            className={styles.descriptionInput}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className={styles.readmeActions}>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {busy ? 'Saving…' : 'Save description'}
          </Button>
        </div>
      </form>
    );

  return (
    <div className={styles.descriptionRow}>
      {description ? <p className={styles.description}>{description}</p> : null}
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="ghost"
        className={description ? styles.descriptionEdit : styles.addDescription}
        aria-label={description ? 'Edit repository description' : 'Add repository description'}
        onClick={() => {
          setDraft(description);
          setError(null);
          setEditing(true);
        }}
      >
        <Pencil aria-hidden="true" />
        {!description ? 'Add a description' : null}
      </Button>
    </div>
  );
}
