'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useStateExport } from '@/hooks/commits/useStateExport';

export function StateExportButton({
  projectId,
  commitDigest,
}: {
  projectId: string;
  commitDigest: string;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'json' | 'yaml'>('yaml');
  const { pending, error, downloaded, supported, download, reset } = useStateExport(
    projectId,
    commitDigest
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="canvas-outline"
          className="h-7 px-2.5 text-xs"
          disabled={!supported}
        >
          <Download className="size-3.5" /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export State</DialogTitle>
          <DialogDescription>Download the complete committed value.</DialogDescription>
        </DialogHeader>
        <p className="break-all font-mono text-xs text-[var(--text-secondary)]">{commitDigest}</p>
        <fieldset disabled={pending} className="flex gap-2">
          <legend className="mb-2 text-sm font-medium">Format</legend>
          {(['yaml', 'json'] as const).map((value) => (
            <label
              key={value}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-[var(--stroke-default)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="state-export-format"
                value={value}
                checked={format === value}
                onChange={() => {
                  setFormat(value);
                  reset();
                }}
              />
              {value.toUpperCase()}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-[var(--text-tertiary)]">
          {format === 'yaml'
            ? 'Normalized YAML; original comments and formatting are not preserved.'
            : 'JSON State value.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-[var(--status-error)]">
            {error}
          </p>
        )}
        {downloaded && <output className="text-sm">Download started.</output>}
        <Button type="button" onClick={() => download(format)} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {pending ? 'Preparing…' : 'Download'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
