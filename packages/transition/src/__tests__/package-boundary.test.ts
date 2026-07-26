import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  publishConfig?: { access?: string };
}

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as PackageManifest;

describe('@t3x-dev/transition package boundary', () => {
  it('is an internal package with no runtime package dependencies', () => {
    expect(manifest.name).toBe('@t3x-dev/transition');
    expect(manifest.private).toBe(true);
    expect(manifest.publishConfig?.access).toBe('restricted');
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.optionalDependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
  });
});
