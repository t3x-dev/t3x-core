import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSchema, validateSchema } from '../src/index';

const schemaYaml = readFileSync(
  join(__dirname, '..', 'examples', 'docker-compose.yschema.yaml'),
  'utf8'
);
const schema = parseSchema(schemaYaml);

const errorCodes = (violations: { severity?: string; code: string }[]) =>
  violations.filter((v) => v.severity === 'error').map((v) => v.code);

describe('docker-compose yschema', () => {
  it('validates a minimal valid tree', () => {
    const tree = { services: { app: { image: 'nginx:1.25' } } };
    expect(errorCodes(validateSchema(tree, schema).violations)).toEqual([]);
  });

  it('errors when a service has no image', () => {
    const tree = { services: { app: { ports: ['80:80'] } } };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('REQUIRED_SLOT');
  });

  it('errors when services is empty', () => {
    const tree = { services: {} };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('RULE_VIOLATION');
  });

  it('errors on bare image tag (no colon)', () => {
    const tree = { services: { app: { image: 'nginx' } } };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('INVALID_PATTERN');
  });

  it('errors on malformed port string', () => {
    const tree = { services: { app: { image: 'nginx:1.25', ports: ['abc'] } } };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('INVALID_ITEM_PATTERN');
  });

  it('errors on depends_on pointing at a missing service', () => {
    const tree = {
      services: {
        app: { image: 'nginx:1.25', depends_on: ['ghost'] },
      },
    };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('REF_NOT_FOUND');
  });

  it('errors on unknown top-level key (strict)', () => {
    const tree = {
      services: { app: { image: 'nginx:1.25' } },
      builds: {},
    };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('UNEXPECTED_NODE');
  });

  it('errors on unknown per-service slot (strict)', () => {
    const tree = {
      services: { app: { image: 'nginx:1.25', porst: ['80:80'] } },
    };
    const codes = errorCodes(validateSchema(tree, schema).violations);
    expect(codes).toContain('UNEXPECTED_SLOT');
  });

  it('emits info-level violation when restart is missing (with YOps fix)', () => {
    const tree = { services: { app: { image: 'nginx:1.25' } } };
    const result = validateSchema(tree, schema);
    const infos = result.violations.filter((v) => v.severity === 'info');
    expect(infos.length).toBeGreaterThan(0);
    const withFix = infos.find((v) => v.fix && v.fix.length > 0);
    expect(withFix).toBeDefined();
  });
});
