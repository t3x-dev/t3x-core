import { describeProtocolObject, parseProposalStatement, parseState } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import fixtures from '../__fixtures__/profiles-v1.json';
import { buildHumanConfirmationStatement, buildYSchemaValidationStatement } from '../builders';
import {
  parseHumanConfirmationStatement,
  parseReplayVerificationStatement,
  parseYSchemaValidationStatement,
} from '../profiles';

describe('Transition Statement profiles', () => {
  it('strict-parses the language-neutral v1 fixtures', () => {
    expect(parseReplayVerificationStatement(fixtures.replay)).toEqual(fixtures.replay);
    expect(parseYSchemaValidationStatement(fixtures.yschema)).toEqual(fixtures.yschema);
    expect(parseHumanConfirmationStatement(fixtures.humanConfirmation)).toEqual(
      fixtures.humanConfirmation
    );
  });

  it('rejects the wrong subject kind or subject count for every profile', () => {
    expect(() =>
      parseReplayVerificationStatement({
        ...fixtures.replay,
        subjects: fixtures.yschema.subjects,
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        subjects: fixtures.replay.subjects,
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseHumanConfirmationStatement({
        ...fixtures.humanConfirmation,
        subjects: [...fixtures.humanConfirmation.subjects, ...fixtures.humanConfirmation.subjects],
      })
    ).toThrowError(expect.objectContaining({ code: 'NON_CANONICAL_VALUE' }));
  });

  it('rejects unknown fields and impossible YSchema outcome combinations', () => {
    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        predicate: { ...fixtures.yschema.predicate, summary: 'looks fine' },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        predicate: {
          ...fixtures.yschema.predicate,
          outcome: 'failed',
          valid: true,
          ready: true,
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        predicate: {
          ...fixtures.yschema.predicate,
          outcome: 'failed',
          valid: false,
          ready: false,
          errors: [],
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('rejects fabricated not-run Statements and non-canonical confirmations', () => {
    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        predicate: {
          ...fixtures.yschema.predicate,
          outcome: 'not_run',
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseHumanConfirmationStatement({
        ...fixtures.humanConfirmation,
        predicate: { confirms: ['rationale', 'intent'] },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));

    expect(() =>
      parseHumanConfirmationStatement({
        ...fixtures.humanConfirmation,
        actor: { kind: 'agent', id: 'agent:self-approver' },
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('rejects an external profile parser being used for a core predicate', () => {
    expect(() =>
      parseYSchemaValidationStatement({
        ...fixtures.yschema,
        predicateType: 't3x.proposal/v1',
      })
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
  });

  it('changes Statement identity for tool/environment runs without changing State identity', () => {
    const state = parseState({
      schema: 't3x/state/v1',
      codec: { mediaType: 'application/yaml', version: '1' },
      value: { enabled: true },
    });
    const before = describeProtocolObject(state);
    const fixture = parseYSchemaValidationStatement(fixtures.yschema);
    const predicate = fixture.predicate;
    const first = buildYSchemaValidationStatement({
      state,
      actor: fixture.actor,
      predicate,
    });
    const second = buildYSchemaValidationStatement({
      state,
      actor: fixture.actor,
      predicate: {
        ...predicate,
        tool: { ...predicate.tool, version: '0.7.0' },
        environment: {
          mode: 'bound',
          resource: {
            uri: 'urn:t3x:test:environment:ci',
            mediaType: 'application/json',
            digest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          },
        },
      },
    });

    expect(first.subjects).toEqual(second.subjects);
    expect(describeProtocolObject(first)).not.toEqual(describeProtocolObject(second));
    expect(describeProtocolObject(state)).toEqual(before);
  });

  it('attaches human confirmation without rewriting the Proposal', () => {
    const proposal = parseProposalStatement({
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
        rationale: { mode: 'unspecified' },
      },
    });
    const before = describeProtocolObject(proposal);
    const confirmation = buildHumanConfirmationStatement({
      proposal,
      actor: { kind: 'human', id: 'user:reviewer' },
      predicate: { confirms: ['intent'] },
    });

    expect(confirmation.subjects).toEqual([before]);
    expect(describeProtocolObject(proposal)).toEqual(before);
  });
});
