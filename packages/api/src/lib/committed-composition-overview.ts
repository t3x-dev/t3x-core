import {
  createStateRendererRegistry,
  exportCommittedState,
  StateRenderError,
} from '@t3x-dev/application';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import {
  type CompileYSchemaCompositionV2Input,
  canonicalizeCompositionValue,
  compileYSchemaCompositionV2,
  renderYSchemaMarkdown,
} from '@t3x-dev/yschema';

/** RFC 6901 pointer into the full committed State value. No inherited properties. */
function atPointer(
  value: ProtocolValue,
  pointer: string
): { present: boolean; value: ProtocolValue } {
  if (pointer === '') return { present: true, value };
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) {
    throw new StateRenderError('Invalid State pointer');
  }
  let current = value;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, key) ||
      (Array.isArray(current) && !/^(0|[1-9][0-9]*)$/.test(key))
    ) {
      return { present: false, value: null };
    }
    current = (current as Record<string, ProtocolValue>)[key]!;
  }
  return { present: true, value: current };
}

function record(value: ProtocolValue) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
const digest = /^sha256:[a-f0-9]{64}$/;
const escapePointer = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1');

/** Pure application projection over a committed instance and its pinned V2
 * composition. `source` is resolver-supplied data; every selected module must
 * match a hash in the manifest bound inside this exact State. No live ref lookup. */
export async function buildCommittedCompositionOverview(
  input: Omit<Parameters<typeof exportCommittedState>[0], 'format'> & {
    bindingPointer: string;
    contentPointer?: string;
    source: CompileYSchemaCompositionV2Input;
  }
) {
  // Snapshot before the compiler's async hashes: caller mutation cannot switch
  // the selected revision or module bytes while this projection is resolving.
  const state = JSON.parse(canonicalizeProtocolValue(input.state as unknown as ProtocolValue));
  const commit = JSON.parse(canonicalizeProtocolValue(input.commit as unknown as ProtocolValue));
  const source: CompileYSchemaCompositionV2Input = JSON.parse(
    canonicalizeCompositionValue(input.source)
  );
  const request = {
    commitDigest: input.commitDigest,
    expectedStateDigest: input.expectedStateDigest,
    state,
    commit,
  };
  const bindingPointer = input.bindingPointer;
  const contentPointer = input.contentPointer ?? '';
  const exported = exportCommittedState({ ...request, format: 'json' });
  const value: ProtocolValue = JSON.parse(exported.content);
  const binding = record(atPointer(value, bindingPointer).value);
  if (
    !binding ||
    binding.compositionId !== source.composition.id ||
    binding.compositionRevision !== source.composition.revision ||
    typeof binding.compositionHash !== 'string' ||
    !digest.test(binding.compositionHash) ||
    typeof binding.schemaHash !== 'string' ||
    !digest.test(binding.schemaHash)
  ) {
    throw new StateRenderError('Exact composition binding is missing or does not match');
  }
  if (source.composition.modules.some((entry) => !entry.hash || !digest.test(entry.hash))) {
    throw new StateRenderError('Every selected module must have an immutable hash');
  }
  const content = atPointer(value, contentPointer);
  if (!content.present) throw new StateRenderError('Committed instance content is unavailable');
  const compiled = await compileYSchemaCompositionV2(source);
  if (!compiled.report.valid) {
    throw new StateRenderError(
      `Composition cannot resolve: ${compiled.report.issues
        .filter((issue) => issue.blocking)
        .map((issue) => issue.code)
        .join(', ')}`
    );
  }
  if (
    compiled.compositionHash !== binding.compositionHash ||
    compiled.compiledSchemaHash !== binding.schemaHash
  ) {
    throw new StateRenderError('Composition or schema hash does not match the committed binding');
  }
  const registry = createStateRendererRegistry([
    {
      key: 't3x.yschema-markdown',
      version: 1,
      priority: 0,
      matchers: [
        {
          kind: 'exact',
          identity: source.composition.id,
          versions: [`r${source.composition.revision}`],
        },
      ],
      modelSchema: 't3x.render/yschema-markdown/v1',
      render: () => ({
        markdown: renderYSchemaMarkdown({ schema: compiled.schema, tree: content.value }),
      }),
      acceptsModel: (model) => typeof record(model)?.markdown === 'string',
    },
  ]);
  const rendered = registry.render({
    ...request,
    binding: {
      stateDigest: exported.sourceState.digest,
      identity: source.composition.id,
      version: `r${source.composition.revision}`,
      hash: compiled.compiledSchemaHash,
      capabilities: [],
    },
  });
  const modules = compiled.renderPlan.map((entry) => {
    const artifact = source.modules.find(
      (item) => item.canonicalName === entry.artifact && item.version === entry.version
    )!;
    return {
      kind: 'module' as const,
      artifact: entry.artifact,
      version: entry.version,
      title: artifact.title,
      description: artifact.description,
      nodes: entry.nodePaths.map((schemaPath) => {
        const pointer = `${contentPointer}/${schemaPath.split('/').map(escapePointer).join('/')}`;
        const definition = compiled.schema.nodes[schemaPath]!;
        return {
          schemaPath,
          pointer,
          present: atPointer(value, pointer).present,
          description: definition.description ?? null,
          required: definition.required === true,
        };
      }),
    };
  });
  return {
    ...rendered,
    contentKind: 'committed-instance' as const,
    bindingPointer,
    contentPointer,
    compositionHash: compiled.compositionHash,
    definition: compiled.schema,
    modules,
    // These are compiler schema paths, not instance JSON pointers (especially
    // for repeated nodes). Do not invent repeated instance origin mappings.
    origins: { coordinate: 'yschema-path' as const, byPath: compiled.originsByPath },
    renderPlan: compiled.renderPlan,
  };
}
