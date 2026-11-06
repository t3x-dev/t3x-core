'use client';

import { type RepositoryProfilePatch, RepositoryProfilePatchSchema } from '@t3x-dev/api-client';
import { BookOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import styles from './StateOverviewView.module.css';

export function StateReadmeEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (patch: RepositoryProfilePatch) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      aria-label="Edit repository README"
      className={styles.readmeEditor}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current) return;
        const parsed = RepositoryProfilePatchSchema.safeParse({ readme: value });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Invalid README.');
          return;
        }
        pending.current = true;
        setBusy(true);
        setError('');
        try {
          await onSave(parsed.data);
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not save README.');
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <header className={styles.readmeHeader}>
        <h2>
          <BookOpen aria-hidden="true" /> README
        </h2>
        <div className={styles.readmeActions}>
          <Button size="sm" variant="outline" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save README'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="w-full">
            {error}
          </p>
        )}
      </header>
      <div className={styles.sourceSheet}>
        <span aria-hidden="true">{value} </span>
        <textarea
          aria-label="Repository README"
          ref={input}
          rows={1}
          disabled={busy}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </form>
  );
}
