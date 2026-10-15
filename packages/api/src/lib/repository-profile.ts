import { RepositoryProfileSchema } from '@t3x-dev/api-client';

/** The storage key is reserved; HTTP clients use repository_profile directly. */
export function projectMetadataFields(metadataJson: string | null) {
  const metadata = metadataJson ? JSON.parse(metadataJson) : null;
  const profile = metadata?.repository_profile;
  if (metadata) delete metadata.repository_profile;
  return {
    metadata,
    repository_profile: RepositoryProfileSchema.parse({
      readme: profile?.readme ?? '',
      tags: profile?.tags ?? [],
    }),
  };
}
