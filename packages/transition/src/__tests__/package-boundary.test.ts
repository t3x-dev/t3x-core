import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name?: string;
  private?: boolean;
  main?: string;
  module?: string;
  types?: string;
  exports?: {
    '.'?: {
      types?: string;
      import?: string;
      require?: string;
    };
  };
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

  it('exposes loadable ESM and CommonJS entry points', async () => {
    expect(manifest.main).toBe('./dist/index.cjs');
    expect(manifest.module).toBe('./dist/index.js');
    expect(manifest.types).toBe('./dist/index.d.ts');
    expect(manifest.exports?.['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    });

    await expect(import('../../dist/index.js')).resolves.toBeDefined();
    const require = createRequire(import.meta.url);
    expect(require('../../dist/index.cjs')).toBeDefined();
  });
});
