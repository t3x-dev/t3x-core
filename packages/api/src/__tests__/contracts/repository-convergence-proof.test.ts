import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import conversationInventoryJson from '../../../contracts/conversation-contract-inventory.json';
import proofJson from '../../../contracts/repository-convergence-proof.json';
import writerInventoryJson from '../../../contracts/repository-writer-inventory.json';

interface Evidence {
  id: string;
  file: string;
  anchors: string[];
}

interface Claim {
  id: string;
  evidence: string[];
}

interface ConvergenceProof {
  schema_version: number;
  canonical_flow: string[];
  evidence: Evidence[];
  claims: Claim[];
  authority_inventories: Record<string, string>;
  retired_route_gates: string[];
  non_claims: string[];
}

interface WriterInventory {
  interfaces: Array<{ surface: string; state: string; authority: string }>;
  canonical_authority: { id: string };
  retirement_policy: {
    delete_historical_rows: boolean;
    drop_tables_in_wave_1: boolean;
  };
}

interface ConversationInventory {
  contracts: Array<{ owner: string; compatibility: string }>;
  retired_routes: Array<{ method: string; path: string }>;
}

const proof = proofJson as ConvergenceProof;
const writerInventory = writerInventoryJson as WriterInventory;
const conversationInventory = conversationInventoryJson as ConversationInventory;
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');

function repositoryPath(file: string): string {
  return resolve(repositoryRoot, file);
}

describe('repository convergence proof', () => {
  it('defines the complete canonical repository lifecycle in order', () => {
    expect(proof.schema_version).toBe(1);
    expect(proof.canonical_flow).toEqual([
      'source',
      'workspace',
      'proposal',
      'review_snapshot',
      'decision',
      'commit_v2',
      'evidence',
    ]);
  });

  it('anchors every supported claim to executable evidence', () => {
    const evidenceIds = new Set(proof.evidence.map((entry) => entry.id));
    expect(evidenceIds.size).toBe(proof.evidence.length);

    for (const evidence of proof.evidence) {
      expect(existsSync(repositoryPath(evidence.file)), evidence.file).toBe(true);
      const source = readFileSync(repositoryPath(evidence.file), 'utf8');
      expect(evidence.anchors.length, evidence.id).toBeGreaterThan(0);
      for (const anchor of evidence.anchors) {
        expect(source, `${evidence.id}: ${anchor}`).toContain(anchor);
      }
    }

    expect(proof.claims.map((claim) => claim.id)).toEqual(
      expect.arrayContaining([
        'deterministic-incremental-updates',
        'replay-verifiable-transitions',
        'optimistic-concurrency-protection',
        'one-active-mutation-authority',
        'immutable-governance-evidence',
        'historical-compatibility-without-historical-authority',
        'provider-independent-domain-history',
      ])
    );
    for (const claim of proof.claims) {
      expect(claim.evidence.length, claim.id).toBeGreaterThan(0);
      for (const evidenceId of claim.evidence) {
        expect(evidenceIds.has(evidenceId), `${claim.id}: ${evidenceId}`).toBe(true);
      }
    }
  });

  it('proves every first-party surface uses canonical authority', () => {
    expect(Object.values(proof.authority_inventories)).toEqual(
      expect.arrayContaining([
        'packages/api/contracts/repository-writer-inventory.json',
        'packages/api/contracts/conversation-contract-inventory.json',
      ])
    );

    const surfaces = new Set(writerInventory.interfaces.map((entry) => entry.surface));
    expect(surfaces).toEqual(new Set(['webui', 'rest', 'cli', 'mcp']));
    expect(writerInventory.interfaces.some((entry) => entry.state === 'legacy_writer')).toBe(false);
    expect(
      writerInventory.interfaces.every(
        (entry) => entry.authority === writerInventory.canonical_authority.id
      )
    ).toBe(true);
    expect(
      conversationInventory.contracts.some(
        (contract) =>
          contract.owner === 'legacy_conversation_workflow' ||
          contract.compatibility === 'compatibility'
      )
    ).toBe(false);
  });

  it('keeps retired routes closed and historical evidence intact', () => {
    const retiredRoutes = new Set(
      conversationInventory.retired_routes.map((route) => `${route.method} ${route.path}`)
    );
    for (const route of proof.retired_route_gates) {
      expect(retiredRoutes.has(route), route).toBe(true);
    }
    expect(writerInventory.retirement_policy).toMatchObject({
      delete_historical_rows: false,
      drop_tables_in_wave_1: false,
    });
  });

  it('records the distributed-system capabilities this architecture does not claim', () => {
    expect(proof.non_claims).toEqual([
      'debezium-compatible-cdc',
      'general-purpose-event-bus',
      'database-level-change-streaming',
      'distributed-exactly-once-processing',
      'full-event-sourcing-of-every-system-entity',
      'kafka-style-consumer-replay',
      'multi-master-or-offline-collaborative-merging',
      'automatic-conflict-free-rebasing',
    ]);
  });
});
