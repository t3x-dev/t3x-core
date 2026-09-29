'use client';

import { Download, FileArchive, FileText, Loader2, PackageOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { toRepoSlug } from '@/domain/project/repoPath';
import type { ProjectExportKind } from '@/hooks/projects/useProjectSettings';
import { SettingsSection } from './SettingsSection';

const EXPORTS: Array<{
  description: string;
  extension: string;
  icon: typeof FileArchive;
  kind: ProjectExportKind;
  label: string;
}> = [
  {
    kind: 'cfpack',
    label: 'Repository archive',
    extension: 'cfpack',
    description: 'Portable JSON archive of the repository for backup or import elsewhere.',
    icon: FileArchive,
  },
  {
    kind: 'ledger',
    label: 'Audit ledger',
    extension: 'jsonl',
    description: 'Line-delimited record of metadata, conversations, turns and commits.',
    icon: FileText,
  },
];

export function ProjectExportSettings({
  onExport,
  projectId,
  projectName,
}: {
  onExport: (kind: ProjectExportKind) => Promise<Blob>;
  projectId: string;
  projectName: string;
}) {
  const [busy, setBusy] = useState<ProjectExportKind | null>(null);

  async function download(kind: ProjectExportKind, extension: string) {
    setBusy(kind);
    try {
      const blob = await onExport(kind);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${toRepoSlug(projectName, projectId)}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Export failed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection
      description="Take a full copy of this repository out of T3X. Exports never change the repository."
      icon={PackageOpen}
      id="export"
      title="Export"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {EXPORTS.map(({ description, extension, icon: Icon, kind, label }) => (
          <div
            className="flex min-w-0 items-start gap-3 rounded-lg border border-[var(--stroke-default)] p-4"
            key={kind}
          >
            <Icon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[var(--accent-commit)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                {label}{' '}
                <span className="font-mono text-xs font-normal text-[var(--text-tertiary)]">
                  .{extension}
                </span>
              </p>
              <p className="mt-0.5 text-xs leading-[17px] text-[var(--text-secondary)]">
                {description}
              </p>
            </div>
            <Button
              aria-label={`Download ${label.toLowerCase()}`}
              disabled={busy !== null}
              onClick={() => void download(kind, extension)}
              size="sm"
              type="button"
              variant="outline"
            >
              {busy === kind ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
