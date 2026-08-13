import {
  buildRunnerValidationStatement,
  parseProposalGenerationPreparation,
  proposalGenerationPreparationResource,
  RUNNER_VALIDATION_PREDICATE_TYPE,
  type SourceSupportAssessment,
  verifyProposalGenerationPosture,
} from '@t3x-dev/core';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import type { TransitionNativeStatementProvider } from './transition-control-plane';
import {
  PROPOSAL_POSTURE_VERIFIER_ACTOR,
  PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
  PROPOSAL_POSTURE_VERIFIER_TOOL,
  PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
} from './transition-control-plane/applicable-policy';

export const PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE =
  'native:proposal-generation-posture/v1' as const;

export interface ProposalGenerationSupportVerifier {
  /** Must identify a model/provider independent from the generator recorded in the Manifest. */
  provider: string;
  model: string;
  assess(input: {
    groupId: string;
    operations: ProtocolValue[];
    evidenceQuotes: string[];
    preparation: ReturnType<typeof parseProposalGenerationPreparation>;
    base: ProtocolValue;
    result: ProtocolValue;
  }): Promise<'supported' | 'unsupported' | 'indeterminate'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replaceAll(/\s+/g, ' ').trim();
}

function evidenceQuotes(binding: {
  evidence: Array<{ locator: { scheme: string; value: ProtocolValue } }>;
}): string[] {
  return binding.evidence.flatMap((evidence) => {
    if (evidence.locator.scheme !== 't3x.text-quote/v1' || !isRecord(evidence.locator.value)) {
      return [];
    }
    return typeof evidence.locator.value.quote === 'string' ? [evidence.locator.value.quote] : [];
  });
}

function operationName(operation: ProtocolValue): string | null {
  if (!isRecord(operation)) return null;
  return Object.keys(operation)[0] ?? null;
}

function introducedScalars(value: unknown, key?: string): string[] {
  if (key === 'path' || key === 'from' || key === 'to' || key === 'source' || key === 'target') {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => introducedScalars(item));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([childKey, child]) => introducedScalars(child, childKey));
}

const DETERMINISTIC_STRUCTURAL_OPERATIONS = new Set(['move', 'nest', 'sort', 'unique']);

function deterministicSupport(operations: readonly ProtocolValue[], quotes: readonly string[]) {
  const names = operations.map(operationName);
  if (names.every((name) => name !== null && DETERMINISTIC_STRUCTURAL_OPERATIONS.has(name))) {
    return true;
  }
  const normalizedQuotes = quotes.map(normalizeText);
  const values = operations.flatMap((operation) => introducedScalars(operation));
  return (
    values.length > 0 &&
    values.every((value) => {
      const normalized = normalizeText(value);
      return normalized.length > 0 && normalizedQuotes.some((quote) => quote.includes(normalized));
    })
  );
}

function pathParts(path: string): string[] {
  if (path === '$' || path === '') return [];
  return path
    .replace(/^\$\.?/, '')
    .split(/[/.]/)
    .filter(Boolean);
}

function valueAtPath(root: ProtocolValue, path: string): ProtocolValue | undefined {
  let cursor: ProtocolValue | undefined = root;
  for (const part of pathParts(path)) {
    if (Array.isArray(cursor)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part] as ProtocolValue | undefined;
  }
  return cursor;
}

function sameValue(left: ProtocolValue | undefined, right: ProtocolValue | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalizeProtocolValue(left) === canonicalizeProtocolValue(right);
}

function compareResource(
  left: { uri: string; mediaType: string; digest: string },
  right: { uri: string; mediaType: string; digest: string }
): number {
  const a = canonicalizeProtocolValue(left);
  const b = canonicalizeProtocolValue(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createProposalGenerationPostureProvider(input?: {
  supportVerifier?: ProposalGenerationSupportVerifier;
}): TransitionNativeStatementProvider {
  return {
    source: PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE,
    issuer: PROPOSAL_POSTURE_VERIFIER_ACTOR,
    predicateTypes: [RUNNER_VALIDATION_PREDICATE_TYPE],
    async verify(context) {
      if (
        !isRecord(context.preparationFacts) ||
        context.preparationFacts.schema !== 't3x.dev/proposal-generation-preparation/v1'
      ) {
        return { outcome: 'not_applicable' };
      }
      const preparation = parseProposalGenerationPreparation(context.preparationFacts);
      const support: SourceSupportAssessment[] = [];
      for (const binding of preparation.bindings) {
        if (binding.origin !== 'source_backed') continue;
        const operations = binding.operationIndexes.map(
          (index) => context.effect.operations[index]!
        );
        const quotes = evidenceQuotes(binding);
        if (deterministicSupport(operations, quotes)) {
          support.push({
            groupId: binding.groupId,
            outcome: 'supported',
            method: 'deterministic_transform',
          });
          continue;
        }
        const verifier = input?.supportVerifier;
        if (
          verifier === undefined ||
          (verifier.provider === preparation.provider && verifier.model === preparation.model)
        ) {
          support.push({
            groupId: binding.groupId,
            outcome: 'indeterminate',
            method: 'independent_verifier',
          });
          continue;
        }
        support.push({
          groupId: binding.groupId,
          outcome: await verifier.assess({
            groupId: binding.groupId,
            operations,
            evidenceQuotes: quotes,
            preparation,
            base: context.base.value,
            result: context.result.value,
          }),
          method: 'independent_verifier',
        });
      }

      const baseConflicts = preparation.bindings.flatMap((binding) =>
        binding.paths.flatMap((path) => {
          const before = valueAtPath(context.base.value, path);
          const after = valueAtPath(context.result.value, path);
          return before !== undefined && !sameValue(before, after)
            ? [{ groupId: binding.groupId, path, kind: 'explicit_claim_replacement' as const }]
            : [];
        })
      );
      const report = verifyProposalGenerationPosture({
        preparation,
        sourceSupport: support,
        conflicts: baseConflicts,
      });
      const riskFindings = preparation.bindings.flatMap((binding) => {
        const operations = binding.operationIndexes.map(
          (index) => context.effect.operations[index]!
        );
        const destructive = operations.some((operation) =>
          ['drop', 'unset', 'omit'].includes(operationName(operation) ?? '')
        );
        return [
          ...(binding.paths.includes('$')
            ? [
                {
                  severity: 'warning' as const,
                  code: 'ROOT_SCOPE_CHANGE',
                  message: 'Change Group affects the root document.',
                  path: '$',
                },
              ]
            : []),
          ...(destructive
            ? [
                {
                  severity: 'warning' as const,
                  code: 'DESTRUCTIVE_OPERATION',
                  message: 'Change Group contains a destructive YOp.',
                  path: binding.paths[0],
                },
              ]
            : []),
        ];
      });
      const conflictFindings = baseConflicts.map((conflict) => ({
        severity: 'warning' as const,
        code: 'BASE_VALUE_CONFLICT',
        message: 'Generated value differs from the immutable Base value.',
        path: conflict.path,
      }));
      const findings = [
        ...report.issues.map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          path: issue.path,
        })),
        ...conflictFindings,
        ...riskFindings,
      ];
      const inputArtifacts = [
        preparation.profileResource,
        preparation.context.yschema,
        ...preparation.context.sources,
        ...preparation.context.memories,
        ...preparation.context.searchResults,
        preparation.context.userInstruction,
        preparation.context.prompt,
        ...(preparation.context.skill === undefined ? [] : [preparation.context.skill]),
      ].sort(compareResource);
      const inputManifest = proposalGenerationPreparationResource(
        preparation,
        `t3x://projects/${encodeURIComponent(context.projectId)}/transitions/${encodeURIComponent(
          context.transitionId
        )}/preparation`
      );
      return {
        outcome: 'statement',
        statement: buildRunnerValidationStatement({
          state: context.result,
          actor: PROPOSAL_POSTURE_VERIFIER_ACTOR,
          predicate: {
            tool: PROPOSAL_POSTURE_VERIFIER_TOOL,
            run: context.run,
            workflow: PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
            environment: PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
            inputManifest,
            inputArtifacts,
            logs: [],
            outputs: [],
            outcome: report.outcome,
            summary:
              report.outcome === 'passed'
                ? `${report.posture} posture verification passed.`
                : `${report.posture} posture verification failed with ${report.issues.filter((issue) => issue.severity === 'error').length} error(s).`,
            findings,
          },
        }),
      };
    },
  };
}
