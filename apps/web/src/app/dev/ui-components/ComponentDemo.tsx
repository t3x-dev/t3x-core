'use client';

import { Info } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { showToast } from '@/components/layout/Toast';
import { Alert } from '@/components/ui/alert';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popconfirm } from '@/components/ui/popconfirm';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function Sample({
  name,
  description,
  children,
}: {
  name: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 border-b border-[var(--stroke-divider)] py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:gap-6">
      <div>
        <h3 className="text-sm font-semibold">{name}</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function ComponentDemo() {
  const [retry, setRetry] = useState(false);
  const [filter, setFilter] = useState('Draft only');
  const [draftName, setDraftName] = useState('Weekly schema');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[var(--surface-app)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:px-10 sm:pt-14">
        <header className="border-b border-[var(--stroke-divider)] pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Feedback &amp; overlays</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Try the shared T3X components with sample data. Actions here do not change a repository.
          </p>
        </header>

        <section aria-labelledby="feedback-heading" className="mt-7">
          <h2 id="feedback-heading" className="text-lg font-semibold">
            Show information
          </h2>
          <Sample
            name="Tooltip"
            description="A short explanation beside a control. Hover or focus to see it."
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="About published versions"
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <Info aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Published versions are read-only.</TooltipContent>
            </Tooltip>
          </Sample>
          <Sample name="Toast" description="Brief feedback after an action. It fades on its own.">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => showToast('Sample link copied', 'success')}
            >
              Show success
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => showToast('Could not copy sample link', 'error')}
            >
              Show error
            </Button>
          </Sample>
          <Sample
            name="Alert"
            description="Keeps the issue and its recovery action where you can find them."
          >
            <div className="w-full">
              <Alert
                title={retry ? 'Preview loaded' : 'Could not load preview'}
                tone={retry ? 'success' : 'error'}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRetry(!retry)}
                  >
                    {retry ? 'Reset example' : 'Retry preview'}
                  </Button>
                }
              >
                <p>
                  {retry
                    ? 'The sample definition is ready.'
                    : 'The previous definition is still visible.'}
                </p>
              </Alert>
            </div>
          </Sample>
          <Sample name="Popover" description="Reveals details or controls next to their trigger.">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  Version details
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                aria-label="Sample version details"
                className="max-w-[var(--radix-popover-content-available-width)]"
              >
                <p className="text-sm font-semibold">Weekly schema</p>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-2 text-sm">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd>1.2.0</dd>
                  <dt className="text-muted-foreground">Visibility</dt>
                  <dd>Private</dd>
                </dl>
              </PopoverContent>
            </Popover>
          </Sample>
        </section>

        <section aria-labelledby="actions-heading" className="mt-7">
          <h2 id="actions-heading" className="text-lg font-semibold">
            Carry out an action
          </h2>
          <Sample
            name="Popconfirm"
            description="Confirms a small, immediate change beside its trigger."
          >
            <Popconfirm
              title="Clear the filter?"
              description="All sample rows will become visible."
              confirmLabel="Clear filter"
              onConfirm={() => {
                setFilter('All rows');
              }}
            >
              <Button type="button" size="sm" variant="outline">
                Clear filter…
              </Button>
            </Popconfirm>
            <output className="text-sm text-muted-foreground">{filter}</output>
            {filter === 'All rows' ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFilter('Draft only')}
              >
                Reset filter
              </Button>
            ) : null}
          </Sample>
          <Sample name="Modal / Dialog" description="Keeps focus on a task such as editing a name.">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  Edit sample name
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit sample name</DialogTitle>
                  <DialogDescription>
                    This name is kept only while this page is open.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="sample-name">Name</Label>
                    <Input
                      id="sample-name"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button">Done</Button>
                    </DialogClose>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
            <output className="min-w-0 break-words text-sm text-muted-foreground">
              {draftName || 'Untitled'}
            </output>
          </Sample>
          <Sample name="Sheet" description="Provides a side panel for longer details or a form.">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  Open sample panel
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sample schema</SheetTitle>
                  <SheetDescription>Inspect the fields in the definition.</SheetDescription>
                </SheetHeader>
                <dl className="mx-4 grid grid-cols-[1fr_auto] gap-3 border-t border-border pt-4 text-sm">
                  <dt>Title</dt>
                  <dd className="text-muted-foreground">Text</dd>
                  <dt>Due date</dt>
                  <dd className="text-muted-foreground">Date</dd>
                  <dt>Complete</dt>
                  <dd className="text-muted-foreground">Boolean</dd>
                </dl>
              </SheetContent>
            </Sheet>
          </Sample>
          <Sample
            name="AlertDialog"
            description="Confirms an action whose consequences need attention."
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={deleted}
              onClick={() => setConfirmOpen(true)}
            >
              Delete sample…
            </Button>
            <AlertDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Delete sample draft?"
              description="This removes the sample draft. Reset the example to try again."
              confirmLabel="Delete sample"
              variant="destructive"
              onConfirm={() => {
                setDeleted(true);
                setConfirmOpen(false);
              }}
            />
            {deleted ? (
              <>
                <output className="text-sm text-muted-foreground">Sample deleted</output>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeleted(false)}>
                  Reset draft
                </Button>
              </>
            ) : null}
          </Sample>
        </section>
      </div>
    </div>
  );
}
