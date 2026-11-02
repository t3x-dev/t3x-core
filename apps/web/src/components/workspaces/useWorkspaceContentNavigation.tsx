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
export function useWorkspaceContentNavigation(dirty: boolean, discard: () => void) {
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const current = useRef({ dirty, discard });
  current.current = { dirty, discard };
  const skip = useRef(false);
  const skipTraversal = useRef(false);
  const requestNavigation = useCallback((navigate: () => void) => {
    if (!current.current.dirty) return navigate();
    pending.current = navigate;
    setOpen(true);
  }, []);
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Content changes</DialogTitle>
            <DialogDescription>
              Save the selected local changes in Changes before continuing. They are not included in
              a Review yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                current.current.discard();
                setOpen(false);
                const navigate = pending.current;
                pending.current = null;
                navigate?.();
              }}
            >
              Discard local changes and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}
