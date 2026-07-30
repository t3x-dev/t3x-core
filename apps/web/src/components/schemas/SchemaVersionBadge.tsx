import { Badge } from '@/components/ui/badge';
import { formatSchemaReleaseName } from '@/domain/schemas/selectors';
import type { SchemaRelease, SchemaReleaseStatus } from '@/types/schemas';

const STATUS_LABELS: Record<SchemaReleaseStatus, string> = {
  draft: 'Draft',
  active: 'Published',
  deprecated: 'Historical',
};

interface SchemaVersionBadgeProps {
  isCurrent?: boolean;
  release: SchemaRelease;
}

export function SchemaVersionBadge({ isCurrent = false, release }: SchemaVersionBadgeProps) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <span className="truncate [font-weight:650] text-[var(--text-primary)]">
        {formatSchemaReleaseName(release)}
      </span>
      <Badge variant={isCurrent ? 'success' : getSchemaStatusTone(release.status)}>
        {isCurrent ? 'Current' : STATUS_LABELS[release.status]}
      </Badge>
    </span>
  );
}

export function getSchemaStatusLabel(status: SchemaReleaseStatus): string {
  return STATUS_LABELS[status];
}

export function getSchemaStatusTone(status: SchemaReleaseStatus): 'commit' | 'pending' | 'warning' {
  if (status === 'draft') return 'pending';
  if (status === 'deprecated') return 'warning';
  return 'commit';
}
