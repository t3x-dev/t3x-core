import { createHash } from 'node:crypto';
import { describeProtocolObject, type ResourceDescriptor } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import type { ExtractionDraft } from '../../extractors/v2/types';
import { createYOpsEffect, createYOpsState } from '../../transition-adapters';
import { compileProposalDraft } from '../compiler';
import {
  bindLLMSourceEvidence,
  bindTurnEvidence,
  createHumanProposalDraft,
  createLegacyExtractionProposalDraft,
} from '../sourceAdapters';

const extraction: ExtractionDraft = {
  schema: 't3x/extraction-draft',
  version: 1,
  mode: 'incremental',
  items: [
    {
      id: 'item_1',
      intent: 'update',
      confidence: 0.86,
      reasoning_type: 'cross_turn',
      target_ref: { path: 'service/replicas' },
      candidate: { value: 4 },
      evidence: [
        {
          turn_tag: 'T1',
          quote: 'Prepare for launch traffic',
          role: 'primary',
        },
      ],
    },
  ],
};

function effect() {
  return createYOpsEffect({
    base: createYOpsState({ service: { replicas: 2 } }),
    operations: [{ set: { path: 'service/replicas', value: 4 } }],
  }).effect;
}

function turnResource(content: string): { resource: ResourceDescriptor; content: string } {
  return {
    resource: {
      uri: 'urn:t3x:test:turn:T1',
      mediaType: 'text/plain',
      digest: `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`,
    },
    content,
  };
}

describe('Proposal source adapters', () => {
  it('represents direct human edits without an LLM or fabricated Claims', () => {
    const omitted = compileProposalDraft({
      draft: createHumanProposalDraft(),
      effect: effect(),
      actor: { kind: 'human', id: 'user:operator' },
    });
    const explained = compileProposalDraft({
      draft: createHumanProposalDraft({ why: 'Prepare for the planned launch' }),
      effect: effect(),
      actor: { kind: 'human', id: 'user:operator' },
    });

    expect(omitted.ok).toBe(true);
    expect(explained.ok).toBe(true);
    if (!omitted.ok || !explained.ok) return;
    expect(omitted.proposal.predicate).toEqual({
      intent: { mode: 'unspecified' },
      rationale: { mode: 'unspecified' },
    });
    expect(explained.proposal.predicate.rationale).toEqual({
      mode: 'authored',
      value: 'Prepare for the planned launch',
      evidence: [],
    });
  });

  it('keeps legacy extraction intent as compatibility metadata, never Proposal intent', () => {
    const mapping = createLegacyExtractionProposalDraft({ extraction });
    const result = compileProposalDraft({
      ...mapping,
      effect: effect(),
      actor: { kind: 'agent', id: 'agent:extractor' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.predicate.intent).toEqual({ mode: 'unspecified' });
    expect(result.report.legacyExtraction?.items[0]).toEqual(
      expect.objectContaining({ operationKind: 'update' })
    );
    expect(result.report.sourceCoverage.unassigned.unverified).toBe(1);
    expect(result.proposal).not.toHaveProperty('operationKind');
  });

  it('creates EvidenceRef only after content digest and quote verification', () => {
    const content = 'Prepare for launch traffic by increasing replicas.';
    const evidence = extraction.items[0].evidence[0];
    const bound = bindTurnEvidence({ evidence, turn: turnResource(content) });

    expect(bound.locator).toEqual({
      scheme: 't3x.text-quote/v1',
      value: { quote: evidence.quote },
    });
    expect(() =>
      bindTurnEvidence({
        evidence,
        turn: { ...turnResource(content), content: 'Different bytes' },
      })
    ).toThrow(/does not match supplied content/);
    expect(() =>
      bindTurnEvidence({
        evidence,
        turn: turnResource('No matching quote here'),
      })
    ).toThrow(/quote is not present/);

    expect(
      bindLLMSourceEvidence({
        source: {
          type: 'llm',
          model: 'model:test',
          at: '2026-07-28T00:00:00.000Z',
          turn_ref: {
            turn_hash: turnResource(content).resource.digest,
            quote: evidence.quote,
          },
        },
        turn: turnResource(content),
      })
    ).toEqual(bound);
    expect(() =>
      bindLLMSourceEvidence({
        source: {
          type: 'llm',
          model: 'model:test',
          at: '2026-07-28T00:00:00.000Z',
          turn_ref: {
            turn_hash: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            quote: evidence.quote,
          },
        },
        turn: turnResource(content),
      })
    ).toThrow(/turn hash does not match/);
  });

  it('keeps legacy calibration and source coverage outside Proposal identity', () => {
    const firstMapping = createLegacyExtractionProposalDraft({ extraction });
    const secondMapping = createLegacyExtractionProposalDraft({
      extraction: {
        ...extraction,
        warnings: ['Provider requested review'],
        items: [{ ...extraction.items[0], confidence: 0.42 }],
      },
      unresolvedQuestions: ['Should this be temporary?'],
      turnResources: {
        T1: turnResource('Prepare for launch traffic by increasing replicas.'),
      },
    });
    const actor = { kind: 'agent', id: 'agent:extractor' } as const;
    const first = compileProposalDraft({ ...firstMapping, effect: effect(), actor });
    const second = compileProposalDraft({ ...secondMapping, effect: effect(), actor });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(describeProtocolObject(first.proposal)).toEqual(describeProtocolObject(second.proposal));
    expect(first.report).not.toEqual(second.report);
  });
});
