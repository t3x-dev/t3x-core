import { decodeRepositorySemanticState } from '@t3x-dev/core';
import type { ProtocolValue } from '@t3x-dev/transition';
import {
  type createStatePresentation,
  createStatePresentation as verifyPresentation,
} from '../repository/statePresentation';
import { createStateRendererRegistry, StateRenderError } from './registry';

type Presentation = ReturnType<typeof createStatePresentation>;
const registry = createStateRendererRegistry([]);
const escapePointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
function valueType(value: ProtocolValue) {
  return value === null
    ? ('null' as const)
    : Array.isArray(value)
      ? ('array' as const)
      : (typeof value as 'object' | 'string' | 'number' | 'boolean');
}

/** Generic Overview projection. Author content is separately authenticated;
 * tags and field names never select schemas or claim module boundaries. */
export function buildCommittedStateOverview(
  input: Pick<
    Parameters<typeof registry.render>[0],
    'commitDigest' | 'commit' | 'state' | 'expectedStateDigest'
  > & {
    presentation?: { commitDigest: string; snapshot: Presentation };
    expectedPresentationDigest?: string;
  }
) {
  const render = registry.render({ ...input, schemaResolution: 'not-requested' });
  let author: Presentation | null = null;
  if (input.presentation) {
    if (input.presentation.commitDigest !== render.context.sourceCommit.digest) {
      throw new StateRenderError('Author presentation belongs to another commit');
    }
    const saved = input.presentation.snapshot;
    if (saved.document.schema !== 't3x.dev/state-presentation/v1') {
      throw new StateRenderError('Unknown author presentation schema');
    }
    author = verifyPresentation({
      ...saved.document,
      avatarPath: saved.document.avatarPath ?? undefined,
    });
    if (saved.digest !== author.digest)
      throw new StateRenderError('Author presentation digest mismatch');
  }
  if (input.expectedPresentationDigest && input.expectedPresentationDigest !== author?.digest) {
    throw new StateRenderError('Requested author presentation is unavailable');
  }
  const value = render.context.value;
  let reading: { kind: 'semantic-content'; value: unknown } | null = null;
  try {
    reading = { kind: 'semantic-content', value: decodeRepositorySemanticState(input.state) };
  } catch {
    // Unknown or invalid codecs keep the complete generic State representation.
  }
  const entries: Array<[string, ProtocolValue]> =
    value !== null && typeof value === 'object' ? Object.entries(value) : [];
  return {
    revision: {
      commitDigest: render.context.sourceCommit.digest,
      stateDigest: render.context.sourceState.digest,
      presentationDigest: author?.digest ?? null,
    },
    author,
    reading,
    summary: {
      kind: 'sections' as const,
      rootType: valueType(value),
      total: entries.length,
      // Compact summary only. Full State remains in the render and recovery.
      truncated: entries.length > 100,
      items: entries.slice(0, 100).map(([key, child]) => ({
        key,
        pointer: `/${escapePointer(key)}`,
        type: valueType(child),
        childCount: child !== null && typeof child === 'object' ? Object.keys(child).length : null,
      })),
    },
    render,
  };
}
