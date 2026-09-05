import {
  type CommitV2,
  canonicalizeProtocolValue,
  type ProtocolValue,
  type State,
} from '@t3x-dev/transition';
import { exportCommittedState } from '../repository/exportState';

/** Only an application resolver may supply this binding, after verifying the
 * immutable artifact and its binding to this State. Never accept catalog tags
 * or an HTTP body as a resolved binding. Registry dispatch does not resolve IO. */
export interface ResolvedRenderBinding {
  stateDigest: string;
  identity: string;
  version: string;
  hash: string;
  family?: string;
  capabilities: Array<{ name: string; version: number }>;
  defaultRenderer?: { key: string; version: number };
}

export type RendererMatcher =
  | { kind: 'exact'; identity: string; versions: string[] }
  | { kind: 'family'; family: string }
  | { kind: 'capability'; name: string; version: number };

export interface StateRenderContext {
  sourceCommit: ReturnType<typeof exportCommittedState>['sourceCommit'];
  sourceState: ReturnType<typeof exportCommittedState>['sourceState'];
  value: ProtocolValue;
  binding: ResolvedRenderBinding | null;
  validation: 'not-run' | 'passed' | 'failed';
}

/** Trusted, locally registered adapters only. Model validators must be pure;
 * schemas cannot install or execute code. React belongs in Web adapters. */
export interface StateRendererRegistration {
  key: string;
  version: number;
  priority: number;
  matchers: RendererMatcher[];
  modelSchema: string;
  render(context: StateRenderContext): ProtocolValue;
  acceptsModel(model: ProtocolValue): boolean;
}

export class StateRenderError extends Error {}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalizeProtocolValue(value as ProtocolValue)) as T;
}

function rank(registration: StateRendererRegistration, binding: ResolvedRenderBinding): number {
  let best = 0;
  for (const matcher of registration.matchers) {
    if (
      matcher.kind === 'exact' &&
      matcher.identity === binding.identity &&
      matcher.versions.includes(binding.version)
    )
      best = 3;
    else if (matcher.kind === 'family' && matcher.family === binding.family)
      best = Math.max(best, 2);
    else if (
      matcher.kind === 'capability' &&
      binding.capabilities.some(
        (item) => item.name === matcher.name && item.version === matcher.version
      )
    )
      best = Math.max(best, 1);
  }
  return best;
}

/** No network, mutable HEAD lookup, validation execution, or State writes. */
export function createStateRendererRegistry(registrations: StateRendererRegistration[]) {
  const keys = new Set<string>();
  const entries = registrations.map((entry) => {
    if (
      !entry.key ||
      entry.key === 't3x.generic' ||
      keys.has(entry.key) ||
      !Number.isSafeInteger(entry.version) ||
      entry.version < 1 ||
      !Number.isSafeInteger(entry.priority) ||
      !entry.modelSchema ||
      entry.matchers.length === 0
    )
      throw new StateRenderError('Invalid or duplicate renderer registration');
    keys.add(entry.key);
    return Object.freeze({ ...entry, matchers: freeze(clone(entry.matchers)) });
  });

  return {
    render(input: {
      commitDigest: string;
      commit: CommitV2;
      state: State;
      expectedStateDigest?: string;
      binding?: ResolvedRenderBinding;
      schemaResolution?: 'unbound' | 'unavailable' | 'not-requested';
      validation?: { stateDigest: string; schemaHash?: string; verdict: 'passed' | 'failed' };
    }) {
      // Export is the shared integrity gate and canonical serialization contract.
      const json = exportCommittedState({ ...input, format: 'json' });
      const yaml = exportCommittedState({ ...input, format: 'yaml' });
      if (input.binding && input.schemaResolution) {
        throw new StateRenderError('Resolved and unresolved schema context cannot be combined');
      }
      if (input.binding && input.binding.stateDigest !== json.sourceState.digest) {
        throw new StateRenderError('Schema binding belongs to another State');
      }
      if (
        input.binding &&
        (!input.binding.identity ||
          !input.binding.version ||
          !/^sha256:[a-f0-9]{64}$/.test(input.binding.hash))
      ) {
        throw new StateRenderError('An immutable schema identity, version and hash are required');
      }
      if (input.validation && input.validation.stateDigest !== json.sourceState.digest) {
        throw new StateRenderError('Validation belongs to another State');
      }
      if (input.validation && input.validation.schemaHash !== input.binding?.hash) {
        throw new StateRenderError('Validation belongs to another schema');
      }
      const context: StateRenderContext = freeze({
        sourceCommit: json.sourceCommit,
        sourceState: json.sourceState,
        value: JSON.parse(json.content),
        binding: input.binding ? clone(input.binding) : null,
        validation: input.validation?.verdict ?? 'not-run',
      });
      const binding = context.binding;
      const candidates = binding ? entries.filter((entry) => rank(entry, binding) > 0) : [];
      candidates.sort(
        (a, b) =>
          rank(b, binding!) - rank(a, binding!) ||
          b.priority - a.priority ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      );
      let selected: StateRendererRegistration | undefined = candidates[0];
      if (binding?.defaultRenderer) {
        selected = candidates.find((entry) => entry.key === binding.defaultRenderer?.key);
        if (!selected || selected.version !== binding.defaultRenderer.version) {
          throw new StateRenderError('Declared renderer is unavailable or incompatible');
        }
      }
      let model: ProtocolValue = { value: context.value };
      if (selected) {
        // A broken registered adapter must not silently look like a successful fallback.
        model = clone(selected.render(context));
        if (!selected.acceptsModel(freeze(model)))
          throw new StateRenderError('Invalid renderer model');
      }
      return {
        context,
        status: {
          state: 'loaded' as const,
          schema: binding ? ('resolved' as const) : (input.schemaResolution ?? 'unbound'),
          renderer: selected ? ('selected' as const) : ('fallback' as const),
          validation: context.validation,
        },
        renderer: selected
          ? { key: selected.key, version: selected.version, modelSchema: selected.modelSchema }
          : { key: 't3x.generic', version: 1, modelSchema: 't3x.render/generic-state/v1' },
        model,
        // All nodes remain recoverable, even when a richer model omits a field.
        recovery: { json: json.content, yaml: yaml.content },
      };
    },
  };
}
