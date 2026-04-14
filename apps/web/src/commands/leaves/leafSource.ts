import { LeafSourceValidationError } from './errors';

/**
 * LeafSource — provenance for leaf creation (v2 §2.4).
 *
 * Leaves are output artefacts (tweet / email / eval / deploy_agent)
 * derived from a parent commit plus constraints. Creation carries a
 * `source` discriminator so the commands layer can distinguish
 * "user hit New Leaf" from "regeneration agent re-emitted output".
 *
 * Shape (mirrors YOps LLMSource / HumanSource strength parallel):
 *   - UserSource : human-initiated. Author is optional metadata.
 *   - AgentSource: LLM or automation. Requires `model` + `timestamp`
 *                  for defence-in-depth (prevents blank writes).
 *
 * `assertLeafSource` is the single runtime entry that
 * `commands/leaves/createLeaf` calls before the infra write.
 */

export interface UserSource {
  type: 'user';
  author?: string;
}

export interface AgentSource {
  type: 'agent';
  model: string;
  timestamp: string;
}

export type LeafSource = UserSource | AgentSource;

/**
 * Runtime assertion that `source` conforms to LeafSource. Throws
 * LeafSourceValidationError on any structural defect.
 *
 * Rules:
 *   - source must be a non-null object
 *   - source.type must be `'user'` or `'agent'`
 *   - when type === 'agent', both `model` and `timestamp` must be
 *     non-empty strings (medium-strength defence-in-depth)
 *   - user source has no required fields beyond the discriminator
 */
export function assertLeafSource(source: unknown): asserts source is LeafSource {
  if (source === null || source === undefined || typeof source !== 'object') {
    throw new LeafSourceValidationError('source', 'source must be a non-null object');
  }
  const s = source as Record<string, unknown>;
  if (s.type === 'user') {
    return;
  }
  if (s.type === 'agent') {
    if (typeof s.model !== 'string' || s.model.length === 0) {
      throw new LeafSourceValidationError('source.model');
    }
    if (typeof s.timestamp !== 'string' || s.timestamp.length === 0) {
      throw new LeafSourceValidationError('source.timestamp');
    }
    return;
  }
  throw new LeafSourceValidationError(
    'source.type',
    `source.type must be 'user' or 'agent' (got ${String(s.type)})`
  );
}
