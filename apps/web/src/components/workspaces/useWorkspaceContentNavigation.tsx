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

/** Local cards survive tool switches; leaving Compose requires an explicit disposition. */
export function useWorkspaceContentNavigation({
  dirty,
  unapplied,
  busy,
  canSave,
  retryOriginal,
  error,
  save,
  discard,
}: {
  dirty: boolean;
  unapplied: boolean;
  busy: boolean;
  canSave: boolean;
  retryOriginal: boolean;
  error?: string | null;
  save: () => Promise<boolean>;
  discard: () => void;
}) {
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [saveIncomplete, setSaveIncomplete] = useState(false);
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  const skip = useRef(false);
  const skipTraversal = useRef(false);
  const requestNavigation = useCallback((navigate: () => void) => {
    if (!current.current.dirty && !current.current.busy) return navigate();
    pending.current = navigate;
    setSaveIncomplete(false);
    setOpen(true);
  }, []);
  const continueNavigation = () => {
    const navigate = pending.current;
    pending.current = null;
    setOpen(false);
    navigate?.();
  };
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (skip.current) {
        skip.current = false;
        return;
      }
      if (
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
        (link.target && link.target !== '_self') ||
        link.href === location.href
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestNavigation(() => {
        skip.current = true;
        link.click();
        skip.current = false;
      });
    };
    const navigation = (
      window as Window & { navigation?: EventTarget & { traverseTo: (key: string) => unknown } }
    ).navigation;
    const traverse = (raw: Event) => {
      const event = raw as Event & {
        navigationType: string;
        destination: { key: string; url: string };
      };
      if (event.navigationType !== 'traverse') return;
      if (skipTraversal.current) {
        skipTraversal.current = false;
        return;
      }
      if (event.defaultPrevented || !event.cancelable || event.destination.url === location.href)
        return;
      event.preventDefault();
      requestNavigation(() => {
        skipTraversal.current = true;
        navigation?.traverseTo(event.destination.key);
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    navigation?.addEventListener('navigate', traverse);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
      navigation?.removeEventListener('navigate', traverse);
    };
  }, [dirty, requestNavigation]);
  return {
    requestNavigation,
    dialog: (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next) pending.current = null;
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Content changes</DialogTitle>
            <DialogDescription>
              {unapplied
                ? 'Return to the editor to apply your input, or discard it with any other local changes.'
                : 'Save the selected changes, discard local changes, or keep editing.'}
              {retryOriginal
                ? ' Discard only removes local edits. The original save may have completed.'
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-wrap">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                pending.current = null;
                setOpen(false);
              }}
            >
              {unapplied ? 'Return to editor to apply' : 'Keep editing'}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                discard();
                continueNavigation();
              }}
            >
              Discard local changes and continue
            </Button>
            {!unapplied ? (
              <Button
                disabled={busy || !canSave}
                onClick={async () => {
                  if (await save()) continueNavigation();
                  else setSaveIncomplete(true);
                }}
              >
                {retryOriginal ? 'Retry original save and continue' : 'Save selected and continue'}
              </Button>
            ) : null}
          </DialogFooter>
          {saveIncomplete ? (
            <output>{error ?? 'Local changes remain. Save them before continuing.'}</output>
          ) : null}
        </DialogContent>
      </Dialog>
    ),
  };
}
