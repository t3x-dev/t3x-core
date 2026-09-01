import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventoryJson from '../../../contracts/repository-writer-inventory.json';

type WriterState = 'canonical' | 'canonical_adapter' | 'legacy_writer';
type Surface = 'webui' | 'rest' | 'cli' | 'mcp';

interface WriterInterface {
  id: string;
  surface: Surface;
  state: WriterState;
  authority: string;
  file: string;
  anchors: string[];
  replacement: string | null;
  removal_gate: string;
  issue?: number;
}

interface CallerGuard {
  symbol: string;
  roots: string[];
  allowed_files: string[];
}

interface WriterInventory {
  schema_version: number;
  canonical_authority: {
    id: string;
    application_command: string;
    commit_authority: string;
    invariants: string[];
  };
  states: WriterState[];
  interfaces: WriterInterface[];
  legacy_caller_guards: CallerGuard[];
  retirement_policy: {
    delete_code_with_last_caller: boolean;
    delete_historical_rows: boolean;
    drop_tables_in_wave_1: boolean;
    required_exit_gates: string[];
  };
}

const inventory = inventoryJson as WriterInventory;
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');

function repositoryPath(file: string): string {
  return resolve(repositoryRoot, file);
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = resolve(directory, entry);
    if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(absolute).isDirectory()) return productionFiles(absolute);
    if (!/\.(?:ts|tsx|mts)$/.test(entry) || /\.(?:test|spec)\./.test(entry)) return [];
    return [absolute];
  });
}

describe('repository writer convergence inventory', () => {
  it('anchors the one canonical authority and its invariants to code', () => {
    expect(inventory.schema_version).toBe(1);
    expect(inventory.states).toEqual(['canonical', 'canonical_adapter', 'legacy_writer']);
    expect(inventory.canonical_authority.id).toBe('transition_control_plane');
    expect(existsSync(repositoryPath(inventory.canonical_authority.application_command))).toBe(
      true
    );
    expect(existsSync(repositoryPath(inventory.canonical_authority.commit_authority))).toBe(true);
    expect(inventory.canonical_authority.invariants).toEqual(
      expect.arrayContaining([
        'deterministic_effect',
        'immutable_review_snapshot',
        'recorded_decision',
        'exact_expected_head_cas',
        'commit_v2',
      ])
    );
  });

  it('keeps every declared interface and anchor executable', () => {
    const ids = inventory.interfaces.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of inventory.interfaces) {
      expect(inventory.states).toContain(entry.state);
      expect(existsSync(repositoryPath(entry.file)), entry.file).toBe(true);
      const source = readFileSync(repositoryPath(entry.file), 'utf8');
      for (const anchor of entry.anchors) {
        expect(source, `${entry.id}: ${anchor}`).toContain(anchor);
      }
      expect(entry.removal_gate, entry.id).not.toBe('');
    }
  });

  it('distinguishes canonical adapters from competing legacy writers on every surface', () => {
    const surfaces: Surface[] = ['webui', 'rest', 'cli', 'mcp'];
    for (const surface of surfaces) {
      const entries = inventory.interfaces.filter((entry) => entry.surface === surface);
      expect(
        entries.some((entry) => entry.state !== 'legacy_writer'),
        surface
      ).toBe(true);
      expect(
        entries.some((entry) => entry.state === 'legacy_writer'),
        surface
      ).toBe(true);
    }

    for (const entry of inventory.interfaces) {
      if (entry.state === 'legacy_writer') {
        expect(entry.authority, entry.id).toBe('legacy_workbench');
        expect(entry.replacement, entry.id).not.toBeNull();
        expect(entry.issue, entry.id).toBeTypeOf('number');
      } else {
        expect(entry.authority, entry.id).toBe(inventory.canonical_authority.id);
        expect(entry.replacement, entry.id).toBeNull();
      }
    }
  });

  it('prevents legacy writer symbols from gaining undeclared first-party callers', () => {
    for (const guard of inventory.legacy_caller_guards) {
      const files = guard.roots.flatMap((root) => productionFiles(repositoryPath(root)));
      const observed = files
        .filter((file) => readFileSync(file, 'utf8').includes(guard.symbol))
        .map((file) => relative(repositoryRoot, file).replaceAll('\\', '/'))
        .sort();
      expect(observed, guard.symbol).toEqual([...guard.allowed_files].sort());
    }
  });

  it('requires caller-first code retirement while preserving historical evidence', () => {
    expect(inventory.retirement_policy).toMatchObject({
      delete_code_with_last_caller: true,
      delete_historical_rows: false,
      drop_tables_in_wave_1: false,
    });
    expect(inventory.retirement_policy.required_exit_gates).toEqual(
      expect.arrayContaining([
        'replacement_is_live',
        'legacy_caller_guard_is_empty',
        'archived_evidence_is_readable',
        'route_and_typed_client_are_removed_together',
        'replay_and_cas_tests_pass',
      ])
    );
  });

  it('does not assign the frozen protocol package to application migration work', () => {
    expect(
      inventory.interfaces.some((entry) => entry.file.startsWith('packages/transition/'))
    ).toBe(false);
  });
});
