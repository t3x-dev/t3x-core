import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeProtocolObject } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  bindEspHomeSourceInputs,
  createYamlSourceResourceDescriptor,
  createYamlSourceState,
  createYOpsState,
  ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT,
  ESPHOME_SOURCE_INPUT_MANIFEST_MEDIA_TYPE,
  type EspHomeSourceResourceInput,
} from '..';

const fixtureDirectory = resolve(process.cwd(), 'src/transition-reference/__fixtures__/esphome');
const rootSource = readFileSync(resolve(fixtureDirectory, 'source-fidelity-result.yaml'), 'utf8');
const commonSource = readFileSync(resolve(fixtureDirectory, 'packages/common.yaml'), 'utf8');
const secretNames = ['wifi_ssid', 'wifi_password', 'api_encryption_key'] as const;

function resource(path: string, source: string): EspHomeSourceResourceInput {
  return {
    path,
    source,
    descriptor: createYamlSourceResourceDescriptor(`urn:t3x:test:esphome:${path}`, source),
  };
}

function bind(
  source: string = rootSource,
  resources: readonly EspHomeSourceResourceInput[] = [
    resource('packages/common.yaml', commonSource),
  ],
  availableSecretNames: readonly string[] = secretNames
) {
  return bindEspHomeSourceInputs({
    root: createYamlSourceState(source),
    rootPath: 'device.yaml',
    resources,
    availableSecretNames,
    manifestUri: 'urn:t3x:test:esphome:source-inputs',
  });
}

describe('ESPHome exact-source input binder', () => {
  it('binds the exact Result State, local package bytes, and name-only secret availability', () => {
    const root = createYamlSourceState(rootSource);
    const result = bindEspHomeSourceInputs({
      root,
      rootPath: 'device.yaml',
      resources: [resource('packages/common.yaml', commonSource)],
      availableSecretNames: secretNames,
      manifestUri: 'urn:t3x:test:esphome:source-inputs',
    });

    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') throw new Error('Expected ready source inputs');
    expect(result.manifest).toEqual({
      format: ESPHOME_SOURCE_INPUT_MANIFEST_FORMAT,
      root: {
        path: 'device.yaml',
        state: describeProtocolObject(root),
      },
      files: [
        {
          path: 'packages/common.yaml',
          resource: createYamlSourceResourceDescriptor(
            'urn:t3x:test:esphome:packages/common.yaml',
            commonSource
          ),
        },
      ],
      secretReferences: [
        { name: 'api_encryption_key', availability: 'available' },
        { name: 'wifi_password', availability: 'available' },
        { name: 'wifi_ssid', availability: 'available' },
      ],
      resolution: {
        localIncludes: 'complete',
        packageSemantics: 'delegated_to_esphome',
        commandLineSubstitutions: 'unsupported',
        secretValues: 'transient_unhashed',
      },
    });
    expect(result.manifestResource).toMatchObject({
      uri: 'urn:t3x:test:esphome:source-inputs',
      mediaType: ESPHOME_SOURCE_INPUT_MANIFEST_MEDIA_TYPE,
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(result.files).toEqual([
      {
        path: 'packages/common.yaml',
        source: commonSource,
        resource: createYamlSourceResourceDescriptor(
          'urn:t3x:test:esphome:packages/common.yaml',
          commonSource
        ),
      },
    ]);
    expect(root.value).toBe(rootSource);
    expect(JSON.stringify(result)).not.toContain('resolved-secret-value');
  });

  it('recursively binds literal include maps in canonical path order', () => {
    const root = [
      'packages:',
      '  common: !include { file: packages/common.yaml, vars: { zone: greenhouse } }',
      '',
    ].join('\n');
    const common = 'sensor: !include sensors/uptime.yaml\n';
    const uptime = '- platform: uptime\n  name: Uptime\n';
    const inputs = [
      resource('packages/sensors/uptime.yaml', uptime),
      resource('packages/common.yaml', common),
    ];
    const result = bind(root, inputs, []);

    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') throw new Error('Expected ready source inputs');
    expect(result.files.map((file) => file.path)).toEqual([
      'packages/common.yaml',
      'packages/sensors/uptime.yaml',
    ]);
  });

  it('keeps manifest identity order-independent and changes it with included bytes', () => {
    const root = ['packages:', '  z: !include z.yaml', '  a: !include a.yaml', ''].join('\n');
    const a = resource('a.yaml', 'logger:\n  level: INFO\n');
    const z = resource('z.yaml', 'api:\n');
    const left = bind(root, [z, a], []);
    const right = bind(root, [a, z], []);

    expect(left.outcome).toBe('ready');
    expect(right.outcome).toBe('ready');
    if (left.outcome !== 'ready' || right.outcome !== 'ready') {
      throw new Error('Expected ready source inputs');
    }
    expect(left.manifestResource.digest).toBe(right.manifestResource.digest);
    expect(left.files.map((file) => file.path)).toEqual(['a.yaml', 'z.yaml']);

    const changed = bind(root, [z, resource('a.yaml', 'logger:\n  level: WARN\n')], []);
    expect(changed.outcome).toBe('ready');
    if (changed.outcome !== 'ready') throw new Error('Expected ready source inputs');
    expect(changed.manifestResource.digest).not.toBe(left.manifestResource.digest);

    expect(() => bind(root, [{ ...a, source: 'logger:\n  level: WARN\n' }, z], [])).toThrowError(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        path: '$.resources[0].descriptor',
      })
    );
  });

  it('reports missing files and secret availability as incomplete without a manifest', () => {
    const missingFile = bind(rootSource, [], secretNames);
    expect(missingFile).toEqual({
      outcome: 'incomplete',
      issues: [
        expect.objectContaining({
          code: 'MISSING_RESOURCE',
          reference: 'packages/common.yaml',
        }),
      ],
    });
    expect('manifest' in missingFile).toBe(false);

    const missingSecret = bind(
      rootSource,
      [resource('packages/common.yaml', commonSource)],
      ['wifi_ssid', 'wifi_password']
    );
    expect(missingSecret).toEqual({
      outcome: 'incomplete',
      issues: [
        expect.objectContaining({
          code: 'MISSING_SECRET',
          reference: 'api_encryption_key',
        }),
      ],
    });
    expect('manifest' in missingSecret).toBe(false);
  });

  it('fails closed on syntax whose dependency closure v1 cannot prove', () => {
    const cases = [
      {
        source: 'packages: !include device-$' + '{platform}.yaml\n',
        code: 'UNSUPPORTED_DYNAMIC_INCLUDE',
      },
      {
        source: 'packages:\n  remote: github://example/repository/package.yaml@main\n',
        code: 'UNSUPPORTED_REMOTE_PACKAGE',
      },
      {
        source: 'packages: !include_dir_merge_named packages\n',
        code: 'UNSUPPORTED_INCLUDE_DIRECTORY',
      },
      {
        source: 'value: !custom external-input\n',
        code: 'UNSUPPORTED_TAG',
      },
      {
        source: 'packages: [\n',
        code: 'SOURCE_DEPENDENCY_SCAN_FAILED',
      },
    ];

    for (const fixture of cases) {
      const result = bind(fixture.source, [], []);
      expect(result.outcome, fixture.code).toBe('unsupported');
      if (result.outcome !== 'unsupported') throw new Error('Expected unsupported source inputs');
      expect(result.issues, fixture.code).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: fixture.code })])
      );
      expect('manifest' in result, fixture.code).toBe(false);
    }
  });

  it('rejects cycles and resources outside the reachable include closure', () => {
    const cycle = bind(
      'packages: !include a.yaml\n',
      [
        resource('a.yaml', 'packages: !include b.yaml\n'),
        resource('b.yaml', 'packages: !include a.yaml\n'),
      ],
      []
    );
    expect(cycle.outcome).toBe('unsupported');
    if (cycle.outcome !== 'unsupported') throw new Error('Expected unsupported source inputs');
    expect(cycle.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'INCLUDE_CYCLE' })])
    );

    const unused = bind('logger:\n  level: INFO\n', [resource('unused.yaml', 'api:\n')], []);
    expect(unused).toEqual({
      outcome: 'unsupported',
      issues: [expect.objectContaining({ code: 'UNUSED_RESOURCE', reference: 'unused.yaml' })],
    });
  });

  it('rejects unsafe paths, duplicate inputs, and stale caller descriptors', () => {
    const safe = resource('packages/common.yaml', commonSource);
    for (const path of ['/common.yaml', '../common.yaml', 'packages\\common.yaml']) {
      expect(() => bind('logger:\n', [resource(path, commonSource)], [])).toThrowError(
        expect.objectContaining({ code: 'SCHEMA_INVALID' })
      );
    }
    expect(() => bind('logger:\n', [safe, safe], [])).toThrowError(
      expect.objectContaining({ code: 'SCHEMA_INVALID', path: '$.resources[1].path' })
    );
    expect(() =>
      bindEspHomeSourceInputs({
        root: createYamlSourceState('logger:\n'),
        rootPath: 'device.yaml',
        resources: [],
        availableSecretNames: ['wifi_ssid', 'wifi_ssid'],
        manifestUri: 'urn:t3x:test:esphome:source-inputs',
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'SCHEMA_INVALID',
        path: '$.availableSecretNames[1]',
      })
    );
  });

  it('accepts neither a semantic-tree State nor secret values', () => {
    expect(() =>
      bindEspHomeSourceInputs({
        root: createYOpsState({ logger: { level: 'INFO' } }),
        rootPath: 'device.yaml',
        resources: [],
        availableSecretNames: [],
        manifestUri: 'urn:t3x:test:esphome:source-inputs',
      })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_MEDIA_TYPE' }));

    const secretSentinel = 'resolved-secret-value';
    let error: unknown;
    try {
      bindEspHomeSourceInputs({
        root: createYamlSourceState('wifi:\n  password: !secret wifi_password\n'),
        rootPath: 'device.yaml',
        resources: [],
        availableSecretNames: ['wifi_password'],
        manifestUri: 'urn:t3x:test:esphome:source-inputs',
        secretValues: { wifi_password: secretSentinel },
      } as never);
    } catch (candidate) {
      error = candidate;
    }
    expect(error).toMatchObject({ code: 'SCHEMA_INVALID', path: '$.secretValues' });
    expect(JSON.stringify(error)).not.toContain(secretSentinel);

    error = undefined;
    try {
      bind('packages: !include secrets.yaml\n', [resource('secrets.yaml', secretSentinel)], []);
    } catch (candidate) {
      error = candidate;
    }
    expect(error).toMatchObject({ code: 'SCHEMA_INVALID', path: '$.resources[0].path' });
    expect(JSON.stringify(error)).not.toContain(secretSentinel);

    expect(() =>
      bindEspHomeSourceInputs({
        root: createYamlSourceState(secretSentinel),
        rootPath: 'Secrets.yaml',
        resources: [],
        availableSecretNames: [],
        manifestUri: 'urn:t3x:test:esphome:source-inputs',
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID', path: '$.rootPath' }));
  });
});
