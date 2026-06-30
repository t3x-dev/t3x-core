import { Badge } from '@/components/ui/badge';
import { formatSchemaReleaseName, getSchemaReleaseBadgeTone } from '@/domain/schemas/selectors';
import type { SchemaRelease, SchemaReleaseStatus } from '@/types/schemas';

const STATUS_LABELS: Record<SchemaReleaseStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  deprecated: 'Deprecated',
};

interface SchemaVersionBadgeProps {
  release: SchemaRelease;
}

export function SchemaVersionBadge({ release }: SchemaVersionBadgeProps) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <span className="truncate font-medium text-[var(--text-primary)]">
        {formatSchemaReleaseName(release)}
      </span>
      <Badge variant={getSchemaReleaseBadgeTone(release)}>{STATUS_LABELS[release.status]}</Badge>
    </span>
  );
}

export function getSchemaStatusLabel(status: SchemaReleaseStatus): string {
  return STATUS_LABELS[status];
}
