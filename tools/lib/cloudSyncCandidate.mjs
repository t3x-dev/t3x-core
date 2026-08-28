export const CLOUD_PACKAGE_SPECS = Object.freeze([
  { name: '@t3x-dev/api', path: 'packages/api' },
  { name: '@t3x-dev/api-client', path: 'packages/api-client' },
  { name: '@t3x-dev/application', path: 'packages/application' },
  { name: '@t3x-dev/core', path: 'packages/core' },
  { name: '@t3x-dev/runner', path: 'apps/runner' },
  { name: '@t3x-dev/storage', path: 'packages/storage' },
  { name: '@t3x-dev/transition', path: 'packages/transition' },
  { name: '@t3x-dev/yops', path: 'packages/yops' },
  { name: '@t3x-dev/yschema', path: 'packages/yschema' },
]);

const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]);

export function createCloudArtifactManifest({ sourceSha, generatedAt, artifacts }) {
  assertFullSha(sourceSha);
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('At least one Cloud artifact is required.');
  }

  const names = new Set();
  for (const artifact of artifacts) {
    if (names.has(artifact.package)) {
      throw new Error(`Duplicate Cloud artifact: ${artifact.package}`);
    }
    names.add(artifact.package);
  }

  return {
    schemaVersion: 1,
    source: {
      repository: 'https://github.com/t3x-dev/t3x-core.git',
      sha: sourceSha,
    },
    generatedAt,
    artifacts: artifacts.map((artifact) => ({ ...artifact })),
  };
}

export function applyCloudArtifactPins({ rootPackage, workspacePackages, artifacts }) {
  const versions = new Map(artifacts.map((artifact) => [artifact.package, artifact.version]));
  const overrides = Object.fromEntries(
    Object.entries(rootPackage.pnpm?.overrides ?? {}).filter(
      ([packageName]) => !packageName.startsWith('@t3x-dev/')
    )
  );

  for (const artifact of artifacts) {
    overrides[artifact.package] = `file:vendor/t3x/${artifact.file}`;
  }

  rootPackage.pnpm = {
    ...(rootPackage.pnpm ?? {}),
    overrides,
  };

  for (const packageJson of workspacePackages) {
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = packageJson[field];
      if (!dependencies) continue;

      for (const dependencyName of Object.keys(dependencies)) {
        const version = versions.get(dependencyName);
        if (version) dependencies[dependencyName] = version;
      }
    }
  }

  return { rootPackage, workspacePackages };
}

export function cloudSyncBranchName(sourceSha) {
  assertFullSha(sourceSha);
  return `sync/core-${sourceSha.slice(0, 12)}`;
}

function assertFullSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`Expected a full 40-character Git SHA, received: ${value}`);
  }
}
