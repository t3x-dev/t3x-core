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
 * PR20 stub: always throws. PR21 will implement per-shape checks.
 */
export function assertLeafSource(_source: unknown): asserts _source is LeafSource {
  // Stub — PR21 replaces this with the real assertion.
  throw new Error('assertLeafSource not yet implemented (PR20 stub)');
}
