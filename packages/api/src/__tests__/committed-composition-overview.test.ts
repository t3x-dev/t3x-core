import { createYOpsState } from '@t3x-dev/core';
import { type CommitV2, describeProtocolObject } from '@t3x-dev/transition';
import {
  compileYSchemaCompositionV2,
  sha256CompositionValue,
  type YSchemaCompositionDraftV2,
  type YSchemaModuleArtifactV2,
} from '@t3x-dev/yschema';
import { expect, it } from 'vitest';
import { buildCommittedCompositionOverview } from '../lib/committed-composition-overview';

async function fixture(tags: string[] = []) {
  const module: YSchemaModuleArtifactV2 = {
    apiVersion: 't3x.dev/yschema-module/v2',
    canonicalName: 'team/cases',
    version: '1.0.0',
    title: 'Cases',
    description: 'Author module description',
    status: 'active',
    source: 'team',
    tags,
    compatibility: { yschema: ['0.1'] },
    provides: [],
    imports: [],
    contribution: {
      nodes: {
        cases: {
          required: true,
          description: 'Explicit node description',
          slots: { title: { type: 'string' } },
        },
        optional: { slots: { title: { type: 'string' } } },
      },
    },
  };
  const composition: YSchemaCompositionDraftV2 = {
    apiVersion: 't3x.dev/yschema-composition/v2',
    id: 'team/evaluation',
    revision: 1,
    status: 'draft',
    modules: [
      {
        canonicalName: module.canonicalName,
        version: module.version,
        hash: await sha256CompositionValue(module),
        presentationOrder: 0,
      },
    ],
  };
  const source = { composition, modules: [module] };
  const compiled = await compileYSchemaCompositionV2(source);
  const state = createYOpsState({
    binding: {
      compositionId: composition.id,
      compositionRevision: composition.revision,
      compositionHash: compiled.compositionHash,
      schemaHash: compiled.compiledSchemaHash,
    },
    'actual/work': { cases: { title: 'Actual committed case' }, extra: ['001', 'yes'] },
  });
  const commit: CommitV2 = {
    schema: 't3x/commit/v2',
    parents: [],
    decision: { kind: 'statement', schema: 't3x/statement/v1', digest: `sha256:${'a'.repeat(64)}` },
    result: describeProtocolObject(state),
  };
  return {
    state,
    commit,
    commitDigest: describeProtocolObject(commit).digest,
    source,
    bindingPointer: '/binding',
    contentPointer: '/actual~1work',
  };
}

it('renders committed content through the shared Tier-0 adapter with declared summary and origins', async () => {
  const input = await fixture();
  const result = await buildCommittedCompositionOverview(input);
  expect(result.renderer.key).toBe('t3x.yschema-markdown');
  expect(result.model).toMatchObject({
    markdown: expect.stringContaining('Actual committed case'),
  });
  expect(result.status).toEqual({
    state: 'loaded',
    schema: 'resolved',
    renderer: 'selected',
    validation: 'not-run',
  });
  expect(result.contentKind).toBe('committed-instance');
  expect(result.modules).toEqual([
    {
      kind: 'module',
      artifact: 'team/cases',
      version: '1.0.0',
      title: 'Cases',
      description: 'Author module description',
      nodes: [
        {
          schemaPath: 'cases',
          pointer: '/actual~1work/cases',
          present: true,
          description: 'Explicit node description',
          required: true,
        },
        {
          schemaPath: 'optional',
          pointer: '/actual~1work/optional',
          present: false,
          description: null,
          required: false,
        },
      ],
    },
  ]);
  expect(result.origins).toMatchObject({
    coordinate: 'yschema-path',
    byPath: { 'cases/title': { artifact: 'team/cases', version: '1.0.0' } },
  });
  expect(JSON.parse(result.recovery.json)).toEqual(input.state.value);
});
it('is deterministic and does not let tags choose a renderer', async () => {
  const input = await fixture();
  expect(await buildCommittedCompositionOverview(input)).toEqual(
    await buildCommittedCompositionOverview(input)
  );
  const tagged = await buildCommittedCompositionOverview(
    await fixture(['renderer:admin', 'finance', 'dog-care'])
  );
  expect(tagged.renderer.key).toBe('t3x.yschema-markdown');
});
it('snapshots input before async resolution and retains historical content', async () => {
  const input = await fixture();
  const promise = buildCommittedCompositionOverview(input);
  input.source.modules[0]!.title = 'Changed during hashing';
  input.state.value = { replacement: true };
  const result = await promise;
  expect(result.modules[0]!.title).toBe('Cases');
  expect(result.model).toMatchObject({
    markdown: expect.stringContaining('Actual committed case'),
  });
});
it('rejects digest mismatch before rendering', async () => {
  const input = await fixture();
  input.state.value = { changed: true };
  await expect(buildCommittedCompositionOverview(input)).rejects.toThrow('do not match');
});
it('rejects changed module bytes, missing artifacts, and unpinned modules', async () => {
  const modified = await fixture();
  modified.source.modules[0]!.description = 'Changed';
  await expect(buildCommittedCompositionOverview(modified)).rejects.toThrow(
    'ARTIFACT_HASH_MISMATCH'
  );
  const missing = await fixture();
  missing.source.modules = [];
  await expect(buildCommittedCompositionOverview(missing)).rejects.toThrow('MODULE_NOT_FOUND');
  const unpinned = await fixture();
  delete unpinned.source.composition.modules[0]!.hash;
  await expect(buildCommittedCompositionOverview(unpinned)).rejects.toThrow('immutable hash');
});
it('rejects a changed composition revision or manifest even if schema content stays equal', async () => {
  const revision = await fixture();
  revision.source.composition.revision = 2;
  await expect(buildCommittedCompositionOverview(revision)).rejects.toThrow('binding');
  const manifest = await fixture();
  manifest.source.composition.modules[0]!.presentationOrder = 10;
  await expect(buildCommittedCompositionOverview(manifest)).rejects.toThrow('hash does not match');
});
it.each([
  '/missing',
  '/binding/__proto__',
  '/binding/~2bad',
])('rejects unavailable or malformed binding pointers %s', async (bindingPointer) => {
  await expect(
    buildCommittedCompositionOverview({ ...(await fixture()), bindingPointer })
  ).rejects.toThrow();
});
it('rejects missing content without replacing it with another root', async () => {
  await expect(
    buildCommittedCompositionOverview({ ...(await fixture()), contentPointer: '/missing' })
  ).rejects.toThrow('content is unavailable');
});
it('rejects an unresolved required capability even with correctly pinned new module bytes', async () => {
  const input = await fixture();
  input.source.modules[0]!.imports = [{ capability: 'missing', version: 1, mode: 'required' }];
  input.source.composition.modules[0]!.hash = await sha256CompositionValue(input.source.modules[0]);
  await expect(buildCommittedCompositionOverview(input)).rejects.toThrow('REQUIRED_IMPORT_MISSING');
});
it('rejects a committed binding with a false schema hash', async () => {
  const input = await fixture();
  const value = structuredClone(input.state.value) as { binding: { schemaHash: string } };
  value.binding.schemaHash = `sha256:${'f'.repeat(64)}`;
  input.state = createYOpsState(value);
  input.commit.result = describeProtocolObject(input.state);
  input.commitDigest = describeProtocolObject(input.commit).digest;
  await expect(buildCommittedCompositionOverview(input)).rejects.toThrow('hash does not match');
});
