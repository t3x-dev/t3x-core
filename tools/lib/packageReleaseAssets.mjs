export function buildReleaseAssetUploadPlan({
  packageRecords,
  assetPaths,
  releaseRecords,
  env = process.env,
}) {
  const normalizedAssetPaths = normalizeAssetPaths(assetPaths);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';

  if (!token) {
    return {
      releaseTag: null,
      assetPaths: normalizedAssetPaths,
      args: null,
      env: null,
      skippedReason: 'missing-github-token',
    };
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
