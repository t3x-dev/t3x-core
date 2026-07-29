import {
  describeProtocolObject,
  type ProposalStatement,
  parseProposalStatement,
  parseStatement,
  type Statement,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import fixtures from '../__fixtures__/profiles-v1.json';
import { deriveAssuranceReport } from '../assurance';
import {
  parseHumanConfirmationStatement,
  parseReplayVerificationStatement,
  parseYSchemaValidationStatement,
} from '../profiles';

function proposal(): ProposalStatement {
  return parseProposalStatement({
    schema: 't3x/statement/v1',
    subjects: [
      {
        kind: 'effect',
        schema: 't3x/effect/v1',
        digest: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    ],
    actor: { kind: 'agent', id: 'agent:planner' },
    predicateType: 't3x.proposal/v1',
    predicate: {
      intent: { mode: 'inferred', value: 'Enable the sensor', evidence: [] },
      rationale: { mode: 'authored', value: 'Requested maintenance', evidence: [] },
    },
  });
}

function failedYSchemaStatement(): ReturnType<typeof parseYSchemaValidationStatement> {
  return parseYSchemaValidationStatement({
    ...fixtures.yschema,
    predicate: {
      ...fixtures.yschema.predicate,
      run: {
        id: 'run:yschema:failed',
        recordedAt: '2026-07-27T23:59:59.000Z',
      },
      outcome: 'failed',
      valid: true,
      ready: false,
      gaps: [
        {
          code: 'REQUIRED_SLOT_MISSING',
          path: 'device/name',
          message: 'Required slot is missing.',
        },
      ],
    },
  });
}

describe('Transition assurance projection', () => {
  it('reports scope-relative absence without claiming that execution never ran', () => {
    const report = deriveAssuranceReport({
      observationScope: { completeness: 'partial', sources: ['offline-pack'] },
      statements: [],
    });

    expect(report.observationScope).toEqual({
      completeness: 'partial',
      sources: ['offline-pack'],
    });
    expect(report.replay.observation).toBe('no_statement_observed');
    expect(report.validation.observation).toBe('no_statement_observed');
    expect(JSON.stringify(report)).not.toContain('not_run');
  });

  it('preserves conflicting runs and valid/ready as independent facts', () => {
    const passed = parseYSchemaValidationStatement(fixtures.yschema);
    const failed = failedYSchemaStatement();
    const report = deriveAssuranceReport({
      observationScope: { completeness: 'complete', sources: ['local-store'] },
      statements: [failed, passed],
      proposal: proposal(),
      objectIntegrity: 'verified',
    });

    expect(report.validation.observation).toBe('observed');
    expect(report.validation.outcomes).toEqual(['failed', 'passed']);
    expect(report.validation.runs).toHaveLength(2);
    expect(
      report.validation.runs.flatMap((run) =>
        run.predicate.outcome === 'unsupported' ? [] : [[run.predicate.valid, run.predicate.ready]]
      )
    ).toEqual(
      expect.arrayContaining([
        [true, true],
        [true, false],
      ])
    );
    expect(
      report.validation.runs.flatMap((run) =>
        run.predicate.outcome === 'failed' ? run.predicate.gaps : []
      )
    ).toEqual([expect.objectContaining({ code: 'REQUIRED_SLOT_MISSING' })]);
    expect(report.claims).toMatchObject({
      observation: 'supplied',
      intent: 'inferred',
      rationale: 'authored',
    });
  });

  it('treats unknown profile versions as observed but unsupported', () => {
    const unknown = parseStatement({
      ...fixtures.yschema,
      predicateType: 't3x.dev/yschema-validation/v2',
      predicate: { future: true },
    });
    const report = deriveAssuranceReport({
      observationScope: { completeness: 'complete', sources: ['local-store'] },
      statements: [unknown],
    });

    expect(report.validation).toMatchObject({
      observation: 'observed',
      outcomes: ['unsupported'],
      runs: [],
    });
    expect(report.validation.unsupportedProfiles[0]).toMatchObject({
      predicateType: 't3x.dev/yschema-validation/v2',
    });
  });

  it('uses digest ordering rather than issuer-claimed run time', () => {
    const earlyClaim = parseYSchemaValidationStatement(fixtures.yschema);
    const lateClaim = failedYSchemaStatement();
    const report = deriveAssuranceReport({
      observationScope: { completeness: 'complete', sources: ['local-store'] },
      statements: [lateClaim, earlyClaim],
    });

    expect(report.validation.runs.map((run) => run.statement.digest)).toEqual(
      [...report.validation.runs.map((run) => run.statement.digest)].sort()
    );
    expect(report.validation.runs.map((run) => run.statement)).toEqual(
      expect.arrayContaining([
        describeProtocolObject(earlyClaim),
        describeProtocolObject(lateClaim),
      ])
    );
  });

  it('keeps replay and human confirmation independent from validation', () => {
    const replay = parseReplayVerificationStatement(fixtures.replay);
    const confirmation = parseHumanConfirmationStatement(fixtures.humanConfirmation);
    const report = deriveAssuranceReport({
      observationScope: { completeness: 'complete', sources: ['local-store'] },
      statements: [replay, failedYSchemaStatement(), confirmation] as Statement[],
    });

    expect(report.replay.outcomes).toEqual(['verified']);
    expect(report.validation.outcomes).toEqual(['failed']);
    expect(report.humanConfirmation.observation).toBe('observed');
  });

  it('rejects ambiguous observation scopes instead of silently deduplicating them', () => {
    expect(() =>
      deriveAssuranceReport({
        observationScope: {
          completeness: 'complete',
          sources: ['local-store', 'local-store'],
        },
        statements: [],
      })
    ).toThrow('must be unique');
  });
});
