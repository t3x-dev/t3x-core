'use client';

import { Download, FileArchive, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { exportCfpack, exportLedger } from '@/lib/api/export';
import { cn } from '@/lib/utils';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

type ExportFormat = 'cfpack' | 'ledger';

export function ExportDialog({ open, onOpenChange, projectId, projectName }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('cfpack');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob =
        format === 'cfpack' ? await exportCfpack(projectId) : await exportLedger(projectId);

      const dateStr = new Date().toISOString().slice(0, 10);
      const ext = format === 'cfpack' ? 'cfpack' : 'jsonl';
      const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';
      const filename = `${safeName}-${dateStr}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(`Exported ${filename}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
          <DialogDescription>Choose an export format</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <FormatOption
            selected={format === 'cfpack'}
            onClick={() => setFormat('cfpack')}
            icon={<FileArchive className="h-5 w-5" />}
            title="Full Archive (.cfpack)"
            description="Complete backup with all conversations, commits, and extracted data. Best for backup and migration."
            badge="Recommended"
          />
          <FormatOption
            selected={format === 'ledger'}
            onClick={() => setFormat('ledger')}
            icon={<FileText className="h-5 w-5" />}
            title="Stream Records (.jsonl)"
            description="One record per line, streaming format. Best for data analysis and importing into other systems."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormatOption({
  selected,
  onClick,
  icon,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors cursor-pointer',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}
