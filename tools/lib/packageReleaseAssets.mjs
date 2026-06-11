export function buildReleaseAssetUploadPlan({
  packageRecords,
  assetPaths,
  releaseRecords,
  env = process.env,
}) {
  const normalizedAssetPaths = normalizeAssetPaths(assetPaths);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';

  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required to upload release assets');
  }

  const releaseTag = resolveProductReleaseTag(packageRecords, releaseRecords);
  return {
    releaseTag,
    assetPaths: normalizedAssetPaths,
    args: ['release', 'upload', releaseTag, ...normalizedAssetPaths, '--clobber'],
    env: {
      ...env,
      GH_TOKEN: token,
    },
    skippedReason: null,
  };
}

export function buildPackageReleaseAssetUploadPlan({
  packageRecord,
  assetPaths,
  env = process.env,
}) {
  const normalizedAssetPaths = normalizeAssetPaths(assetPaths);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';

  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required to upload package release assets');
  }

  const release = packageReleaseFor(packageRecord);
  return {
    ...release,
    assetPaths: normalizedAssetPaths,
    createArgs: [
      'release',
      'create',
      release.releaseTag,
      '--title',
      release.releaseTitle,
      '--notes',
      release.releaseNotes,
    ],
    uploadArgs: ['release', 'upload', release.releaseTag, ...normalizedAssetPaths, '--clobber'],
    env: {
      ...env,
      GH_TOKEN: token,
    },
  };
}

export function resolveProductReleaseTag(packageRecords, releaseRecords) {
  const expectedPackages = normalizePackageRecords(packageRecords);
  const matchingReleases = normalizeReleaseRecords(releaseRecords).filter((release) =>
    releaseDeclaresPackageRecords(release, expectedPackages)
  );

  if (matchingReleases.length === 0) {
    throw new Error(
      `no product GitHub Release declares package releases: ${expectedPackages
        .map((record) => `${record.name}@${record.version}`)
        .join(', ')}`
    );
  }

  if (matchingReleases.length > 1) {
    throw new Error(
      `multiple product GitHub Releases declare package releases: ${matchingReleases
        .map((release) => release.tagName)
        .join(', ')}`
    );
  }

  return matchingReleases[0].tagName;
}

function normalizePackageRecords(packageRecords) {
  if (!Array.isArray(packageRecords) || packageRecords.length === 0) {
    throw new Error('package release assets require at least one package record');
  }

  return packageRecords.map((record) => {
    if (!record || typeof record.name !== 'string' || record.name.length === 0) {
      throw new Error('package release assets require every package record to include a name');
    }
    if (typeof record.version !== 'string' || record.version.length === 0) {
      throw new Error('package release assets require every package record to include a version');
    }
    return {
      name: record.name,
      version: record.version,
    };
  });
}

function packageReleaseFor(packageRecord) {
  if (!packageRecord || typeof packageRecord.name !== 'string') {
    throw new Error('package release assets require a package record with a name');
  }
  if (typeof packageRecord.version !== 'string' || packageRecord.version.length === 0) {
    throw new Error('package release assets require a package record with a version');
  }

  if (packageRecord.name === '@t3x-dev/local') {
    return {
      releaseTag: `t3x-local-v${packageRecord.version}`,
      releaseTitle: `t3x-local v${packageRecord.version}`,
      releaseNotes: `Package release for @t3x-dev/local@${packageRecord.version}.`,
    };
  }

  if (packageRecord.name === '@t3x-dev/yops') {
    return {
      releaseTag: `t3x-yops-v${packageRecord.version}`,
      releaseTitle: `t3x-yops v${packageRecord.version}`,
      releaseNotes: `Package release for @t3x-dev/yops@${packageRecord.version}.`,
    };
  }

  throw new Error(`unsupported package release asset package: ${packageRecord.name}`);
}

function normalizeAssetPaths(assetPaths) {
  if (!Array.isArray(assetPaths) || assetPaths.length === 0) {
    throw new Error('package release assets require at least one tarball path');
  }

  return assetPaths.map((assetPath) => {
    if (typeof assetPath !== 'string' || assetPath.length === 0) {
      throw new Error('package release assets require non-empty tarball paths');
    }
    return assetPath;
  });
}

function normalizeReleaseRecords(releaseRecords) {
  if (!Array.isArray(releaseRecords) || releaseRecords.length === 0) {
    throw new Error('package release assets require product GitHub Release records');
  }

  return releaseRecords
    .map((release) => ({
      tagName: release?.tagName ?? release?.tag_name ?? '',
      body: release?.body ?? '',
    }))
    .filter((release) => release.tagName.startsWith('t3x-v'));
}

function releaseDeclaresPackageRecords(release, expectedPackages) {
  const entries = parsePackageReleaseEntries(release.body);

  return expectedPackages.every((record) => entries.get(record.name) === record.version);
}

function parsePackageReleaseEntries(body) {
  const packageReleaseSection =
    body.match(/(?:^|\n)## Package Releases\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
  const entries = new Map();

  for (const line of packageReleaseSection.split('\n')) {
    const match = line
      .trim()
      .match(/^-\s+(`?@t3x-dev\/[a-z0-9-]+`?)\s*:\s*`?(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`?/);
    if (!match) {
      continue;
    }

    entries.set(match[1].replace(/^`|`$/g, ''), match[2].replace(/^v/, ''));
  }

  return entries;
}
