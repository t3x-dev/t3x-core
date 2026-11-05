import type { StudioPreview } from '@t3x-dev/api-client';

export function studioPublicationBlocker(preview?: StudioPreview): string | undefined {
  if (
    !preview?.workspace ||
    !preview.freshness?.candidateId ||
    !preview.freshness.candidateRevision
  )
    return 'Save and check the Schema candidate before publishing.';
  if (!preview.adoption.allowed)
    return preview.adoption.reason ?? 'The selected sources cannot be published.';
  if (!preview.report.valid || !preview.impact?.canPublish)
    return 'Resolve definition and content impact checks before publishing.';
}
