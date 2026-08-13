import {
  buildRunnerValidationStatement,
  generationOperationIntroducedScalars,
  generationValueAtPath,
  parseProposalGenerationPreparation,
  proposalGenerationPreparationResource,
  RUNNER_VALIDATION_PREDICATE_TYPE,
  type SourceSupportAssessment,
  verifyProposalGenerationPosture,
} from '@t3x-dev/core';
import { canonicalizeProtocolValue, type ProtocolValue } from '@t3x-dev/transition';
import type { TransitionNativeStatementProvider } from './transition-control-plane';
import {
  PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE,
  PROPOSAL_POSTURE_VERIFIER_ACTOR,
  PROPOSAL_POSTURE_VERIFIER_ENVIRONMENT,
  PROPOSAL_POSTURE_VERIFIER_TOOL,
  PROPOSAL_POSTURE_VERIFIER_WORKFLOW,
} from './transition-control-plane/applicable-policy';

export { PROPOSAL_GENERATION_POSTURE_PROVIDER_SOURCE } from './transition-control-plane/applicable-policy';

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
  assessClaim?(input: {
    claim: 'intent' | 'rationale';
    value: string;
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

const DETERMINISTIC_STRUCTURAL_OPERATIONS = new Set(['move', 'nest', 'sort', 'unique']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteContainsValue(quote: string, value: string): boolean {
  const normalizedQuote = normalizeText(quote);
  const normalizedValue = normalizeText(value);
  if (normalizedValue.length === 0) return false;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedValue)}(?=$|[^\\p{L}\\p{N}])`,
    'u'
  ).test(normalizedQuote);
}

function deterministicSupport(operations: readonly ProtocolValue[], quotes: readonly string[]) {
  const names = operations.map(operationName);
  if (names.every((name) => name !== null && DETERMINISTIC_STRUCTURAL_OPERATIONS.has(name))) {
    return true;
  }
  const values = operations.flatMap((operation) =>
    generationOperationIntroducedScalars(
      operation as Parameters<typeof generationOperationIntroducedScalars>[0]
    )
  );
  return (
    values.length > 0 &&
    values.every((value) => quotes.some((quote) => quoteContainsValue(quote, value)))
  );
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

function independentVerifier(
  verifier: ProposalGenerationSupportVerifier | undefined,
  preparation: ReturnType<typeof parseProposalGenerationPreparation>
): ProposalGenerationSupportVerifier | undefined {
  return verifier === undefined ||
    (verifier.provider === preparation.provider && verifier.model === preparation.model)
    ? undefined
    : verifier;
}

function proposalClaim(
  proposal: { predicate: ProtocolValue },
  claim: 'intent' | 'rationale'
):
  | { mode: 'unspecified' }
  | {
      mode: 'stated' | 'inferred' | 'authored';
      value: string;
      evidence: Array<{ locator: { scheme: string; value: ProtocolValue } }>;
    }
  | null {
  if (!isRecord(proposal.predicate)) return null;
  const value = proposal.predicate[claim];
  if (!isRecord(value) || typeof value.mode !== 'string') return null;
  if (value.mode === 'unspecified') return { mode: 'unspecified' };
  if (
    !['stated', 'inferred', 'authored'].includes(value.mode) ||
    typeof value.value !== 'string' ||
    !Array.isArray(value.evidence)
  ) {
    return null;
  }
  return {
    mode: value.mode as 'stated' | 'inferred' | 'authored',
    value: value.value,
    evidence: value.evidence as Array<{
      locator: { scheme: string; value: ProtocolValue };
    }>,
  };
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
      const verifier = independentVerifier(input?.supportVerifier, preparation);
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
        if (verifier === undefined) {
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

      const claimFindings: Array<{
        severity: 'error';
        code: string;
        message: string;
        path: string;
      }> = [];
      for (const claimName of ['intent', 'rationale'] as const) {
        const claim = proposalClaim(context.proposal, claimName);
        if (claim === null || claim.mode === 'unspecified') continue;
        if (
          claimName === 'intent' &&
          preparation.profile.id === 'source_only' &&
          claim.mode !== 'stated'
        ) {
          claimFindings.push({
            severity: 'error',
            code: 'SOURCE_ONLY_CLAIM_MODE_NOT_ALLOWED',
            message: 'source_only intent must be source-backed stated content or unspecified.',
            path: '$.proposal.intent.mode',
          });
          continue;
        }
        if (claim.mode !== 'stated') continue;
        const quotes = evidenceQuotes(claim);
        let outcome: 'supported' | 'unsupported' | 'indeterminate' = quotes.some((quote) =>
          quoteContainsValue(quote, claim.value)
        )
          ? 'supported'
          : 'indeterminate';
        if (outcome === 'indeterminate' && verifier?.assessClaim !== undefined) {
          outcome = await verifier.assessClaim({
            claim: claimName,
            value: claim.value,
            evidenceQuotes: quotes,
            preparation,
            base: context.base.value,
            result: context.result.value,
          });
        }
        if (outcome !== 'supported') {
          claimFindings.push({
            severity: 'error',
            code:
              outcome === 'unsupported'
                ? 'CLAIM_SOURCE_SUPPORT_FAILED'
                : 'CLAIM_SOURCE_SUPPORT_REQUIRED',
            message:
              outcome === 'unsupported'
                ? `The cited Source does not support the stated ${claimName}.`
                : `The stated ${claimName} requires a conclusive source-support assessment.`,
            path: `$.proposal.${claimName}.evidence`,
          });
        }
      }

      const baseChanges = preparation.bindings.flatMap((binding) => {
        const operations = binding.operationIndexes.map(
          (index) => context.effect.operations[index]!
        );
        const structural = operations.every((operation) =>
          DETERMINISTIC_STRUCTURAL_OPERATIONS.has(operationName(operation) ?? '')
        );
        return binding.paths.flatMap((path) => {
          const before = generationValueAtPath(context.base.value, path);
          const after = generationValueAtPath(context.result.value, path);
          return before !== undefined && !sameValue(before, after)
            ? [
                {
                  groupId: binding.groupId,
                  path,
                  kind: 'explicit_claim_replacement' as const,
                  structural,
                },
              ]
            : [];
        });
      });
      const report = verifyProposalGenerationPosture({
        preparation,
        sourceSupport: support,
        conflicts: baseChanges
          .filter((conflict) => !conflict.structural)
          .map((conflict) => ({
            groupId: conflict.groupId,
            path: conflict.path,
            kind: conflict.kind,
          })),
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
      const conflictFindings = baseChanges.map((conflict) => ({
        severity: 'warning' as const,
        code: 'BASE_VALUE_CONFLICT',
        message: `Change Group ${conflict.groupId} differs from the immutable Base value.`,
        path: conflict.path,
      }));
      const findings = [
        ...report.issues.map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          path: issue.path,
        })),
        ...claimFindings,
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
            outcome: report.outcome === 'failed' || claimFindings.length > 0 ? 'failed' : 'passed',
            summary:
              report.outcome === 'passed' && claimFindings.length === 0
                ? `${report.posture} posture verification passed.`
                : `${report.posture} posture verification failed with ${
                    report.issues.filter((issue) => issue.severity === 'error').length +
                    claimFindings.length
                  } error(s).`,
            findings,
          },
        }),
      };
    },
  };
}
