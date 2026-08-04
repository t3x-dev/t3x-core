import type { SchemaRelease, SchemaReleaseFamily, SchemaReleaseStatus } from '@/types/schemas';

export type SchemaReleaseBadgeTone = 'pending' | 'commit' | 'warning';

const SCHEMA_RELEASE_TONES: Record<SchemaReleaseStatus, SchemaReleaseBadgeTone> = {
  draft: 'pending',
  active: 'commit',
  deprecated: 'warning',
};

export function formatSchemaReleaseName(release: SchemaRelease): string {
  return `${release.name} ${release.version}`;
}

export function getSchemaReleaseBadgeTone(release: SchemaRelease): SchemaReleaseBadgeTone {
  return SCHEMA_RELEASE_TONES[release.status];
}

export function groupSchemaReleasesByFamily(releases: SchemaRelease[]): SchemaReleaseFamily[] {
  const families: SchemaReleaseFamily[] = [];
  const familyByName = new Map<string, SchemaReleaseFamily>();

  for (const release of releases) {
    const existing = familyByName.get(release.name);
    if (existing) {
      existing.releases.push(release);
      continue;
    }

    const family = { name: release.name, releases: [release] };
    familyByName.set(release.name, family);
    families.push(family);
  }

  return families;
}
