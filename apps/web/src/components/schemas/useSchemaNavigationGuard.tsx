'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type SchemaEditorNavigation = {
  requestNavigation: (navigate: () => void) => void;
  save?: () => Promise<boolean>;
};

// Feature-detected: history traversal can be cancelled before a client router unmounts the editor.
type TraversalEvent = Event & {
  navigationType: string;
  destination: { key: string; url: string };
};
type BrowserNavigation = EventTarget & { traverseTo: (key: string) => unknown };

export function useSchemaNavigationGuard(options: {
  dirty: boolean;
  canSave: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}) {
  const current = useRef(options);
  current.current = options;
  const skipLink = useRef(false);
  const skipTraversal = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestNavigation = useCallback((navigate: () => void) => {
    if (!current.current.dirty) return navigate();
    pending.current = navigate;
    setError('');
    setOpen(true);
  }, []);

  useEffect(() => {
    function click(event: MouseEvent) {
      if (skipLink.current) {
        skipLink.current = false;
        return;
      }
      if (
        !current.current.dirty ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.download ||
        (link.target && link.target !== '_self')
      )
        return;
      const destination = new URL(link.href, location.href);
      if (
        destination.pathname === location.pathname &&
        destination.search === location.search &&
        destination.origin === location.origin
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestNavigation(() => {
        skipLink.current = true;
        link.click();
        skipLink.current = false;
      });
    }
    const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation;
    function traverse(raw: Event) {
      const event = raw as TraversalEvent;
      if (event.navigationType !== 'traverse') return;
      if (skipTraversal.current) {
        skipTraversal.current = false;
        return;
      }
      if (!current.current.dirty || !event.cancelable || event.destination.url === location.href)
        return;
      event.preventDefault();
      requestNavigation(() => {
        skipTraversal.current = true;
        navigation?.traverseTo(event.destination.key);
      });
    }
    document.addEventListener('click', click, true);
    navigation?.addEventListener('navigate', traverse);
    return () => {
      document.removeEventListener('click', click, true);
      navigation?.removeEventListener('navigate', traverse);
    };
  }, [requestNavigation]);

  async function continueNavigation(save: boolean) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (save && !(await current.current.save())) {
        setError('The candidate could not be saved. Your edits are still here.');
        return;
      }
      if (!save) current.current.discard();
      const navigate = pending.current;
      pending.current = null;
      setOpen(false);
      navigate?.();
    } finally {
      setSaving(false);
    }
  }

  return {
    requestNavigation,
    dialog: (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>Save Schema edits before leaving?</DialogTitle>
            <DialogDescription>
              These edits have not been saved to the Workspace candidate.
            </DialogDescription>
          </DialogHeader>
          {!options.canSave ? (
            <p className="text-sm">
              Resolve invalid fields or a stale candidate before saving. You can stay here or
              discard the edits.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Stay here
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => void continueNavigation(false)}
            >
              Discard & continue
            </Button>
            <Button
              disabled={saving || !options.canSave}
              onClick={() => void continueNavigation(true)}
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}
