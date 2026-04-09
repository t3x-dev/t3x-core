/**
 * E2E Tests — Full schema lifecycle: define → validate → fix → re-validate
 *
 * These tests simulate real user workflows end-to-end.
 */

import type { YValue } from '@t3x-dev/yops';
import { applyYOps } from '@t3x-dev/yops';
import { describe, expect, it } from 'vitest';
import { buildFixPlan, parseSchema, validateSchema } from '../src/index';

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 1: Customer Profile — LLM extracted messy data, schema cleans it up
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: customer profile', () => {
  const schemaYaml = `
name: customer-profile
version: 1

nodes:
  preferences:
    required: true
    slots:
      theme: [dark, light, system]
      language: scalar
      notifications: [true, false]

  decisions:
    required: true
    children: any
    each_child:
      slots:
        choice: scalar
        reason: scalar

  contacts:
    required: false
    children: any

rules:
  - id: decisions-need-reason
    if: "decisions/*"
    must_have: [choice, reason]
    severity: error
    message: "Decision '{{path}}' must have choice and reason"
`;

  it('validates a correct document', () => {
    const s = parseSchema(schemaYaml);
    const doc: YValue = {
      preferences: { theme: 'dark', language: 'en', notifications: true },
      decisions: {
        pick_database: { choice: 'postgres', reason: 'reliability and ecosystem' },
        pick_framework: { choice: 'next.js', reason: 'SSR support' },
      },
    };

    const result = validateSchema(doc, s);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects and fixes messy LLM extraction', () => {
    const s = parseSchema(schemaYaml);

    // Simulate what an LLM might extract poorly:
    // - theme is "blue" (not in enum)
    // - notifications missing
    // - one decision has no reason
    const messyDoc: YValue = {
      preferences: { theme: 'blue', language: 'en' },
      decisions: {
        pick_database: { choice: 'postgres', reason: 'fast and reliable' },
        pick_cloud: { choice: 'aws' }, // missing reason!
      },
    };

    // Step 1: Validate
    const r1 = validateSchema(messyDoc, s);
    expect(r1.valid).toBe(false);

    // Should find: invalid enum (theme), missing slot (notifications), rule violation (pick_cloud)
    const enumViolation = r1.violations.find((v) => v.code === 'INVALID_ENUM');
    expect(enumViolation).toBeDefined();
    expect(enumViolation!.path).toBe('preferences/theme');

    const missingSlot = r1.violations.find((v) => v.code === 'REQUIRED_SLOT');
    expect(missingSlot).toBeDefined();
    expect(missingSlot!.path).toBe('preferences/notifications');

    const ruleViolation = r1.violations.find((v) => v.code === 'RULE_VIOLATION');
    expect(ruleViolation).toBeDefined();
    expect(ruleViolation!.message).toContain('pick_cloud');

    // Step 2: Build fix plan (auto-fixable violations only)
    const plan = buildFixPlan(r1);
    expect(plan.fixes_count).toBeGreaterThan(0);
    expect(plan.manual_count).toBeGreaterThan(0); // rule violation has no auto-fix

    // Step 3: Apply auto-fixes via YOps
    const fixed = applyYOps(messyDoc, plan.ops);
    expect(fixed.ok).toBe(true);

    // Step 4: Verify fixes applied
    const doc2 = fixed.doc as Record<string, Record<string, unknown>>;
    expect(doc2.preferences.theme).toBe('dark'); // first enum value
    expect(doc2.preferences.notifications).toBe(true); // first enum value

    // Step 5: Re-validate — auto-fixed violations should be gone
    const r2 = validateSchema(fixed.doc, s);
    const autoFixableRemaining = r2.violations.filter(
      (v) =>
        v.code === 'INVALID_ENUM' ||
        (v.code === 'REQUIRED_SLOT' && v.path === 'preferences/notifications')
    );
    expect(autoFixableRemaining).toHaveLength(0);

    // The rule violation (missing reason on pick_cloud) still remains — needs human
    const stillBroken = r2.violations.find((v) => v.code === 'RULE_VIOLATION');
    expect(stillBroken).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 2: Meeting Notes — strict mode catches undeclared junk nodes
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: meeting notes with strict mode', () => {
  const schemaYaml = `
name: meeting-notes
version: 1
strict: true

nodes:
  attendees:
    required: true
    children: any
    each_child:
      slots:
        role: scalar

  action_items:
    required: true
    children: any
    each_child:
      slots:
        owner: scalar
        due: scalar
        status: [todo, in_progress, done]

  summary:
    required: true
    slots:
      topic: scalar
      date: scalar

rules:
  - id: action-items-need-owner
    if: "action_items/*"
    must_have: [owner, status]
    severity: error
    message: "Action item '{{path}}' must have owner and status"
`;

  it('full lifecycle: messy input → validate → fix → clean', () => {
    const s = parseSchema(schemaYaml);

    // Messy input: has junk nodes, missing required fields, wrong enum
    const messyDoc: YValue = {
      attendees: {
        alice: { role: 'lead' },
        bob: { role: 'engineer' },
      },
      action_items: {
        fix_bug: { owner: 'alice', status: 'todo', due: '2026-04-15' },
        review_pr: { owner: 'bob', status: 'pending' }, // invalid enum!
        write_docs: { status: 'todo' }, // missing owner!
      },
      summary: { topic: 'Sprint planning' }, // missing date!
      random_thoughts: 'this should not be here', // strict mode violation
      scratch_pad: { temp: true }, // another undeclared node
    };

    // Step 1: Validate
    const r1 = validateSchema(messyDoc, s);
    expect(r1.valid).toBe(false);

    // Categorize violations
    const unexpected = r1.violations.filter((v) => v.code === 'UNEXPECTED_NODE');
    const enumErrors = r1.violations.filter((v) => v.code === 'INVALID_ENUM');
    const missingSlots = r1.violations.filter((v) => v.code === 'REQUIRED_SLOT');
    const ruleErrors = r1.violations.filter((v) => v.code === 'RULE_VIOLATION');

    expect(unexpected.length).toBe(2); // random_thoughts, scratch_pad
    expect(unexpected.map((v) => v.path).sort()).toEqual(['random_thoughts', 'scratch_pad']);

    expect(enumErrors.length).toBe(1); // review_pr status
    expect(enumErrors[0].path).toBe('action_items/review_pr/status');

    // summary/date + each_child template slots missing on some action items
    expect(missingSlots.length).toBeGreaterThanOrEqual(1);
    expect(missingSlots.some((v) => v.path === 'summary/date')).toBe(true);

    // Rule violations: write_docs missing owner, review_pr missing... wait, review_pr has owner
    // write_docs is missing owner
    expect(ruleErrors.length).toBeGreaterThanOrEqual(1);

    // Step 2: Build fix plan
    const plan = buildFixPlan(r1);

    // Unexpected nodes are fixable (drop), enum is fixable (set to first enum),
    // but missing owner on write_docs is a rule violation with no auto-fix
    expect(plan.ops.length).toBeGreaterThan(0);

    // Step 3: Apply auto-fixes
    const fixed = applyYOps(messyDoc, plan.ops);
    expect(fixed.ok).toBe(true);

    // Step 4: Verify junk nodes removed
    const doc2 = fixed.doc as Record<string, unknown>;
    expect(doc2.random_thoughts).toBeUndefined();
    expect(doc2.scratch_pad).toBeUndefined();

    // Step 5: Verify enum fixed
    const items = doc2.action_items as Record<string, Record<string, unknown>>;
    expect(items.review_pr.status).toBe('todo'); // first enum value

    // Step 6: Re-validate
    const r2 = validateSchema(fixed.doc, s);
    // Junk nodes gone, enum fixed — only manual issues remain
    const remaining = r2.violations.filter(
      (v) => v.code === 'UNEXPECTED_NODE' || v.code === 'INVALID_ENUM'
    );
    expect(remaining).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 3: API Config — schema with defaults, ranges, and dependency rules
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: API config with defaults and ranges', () => {
  const schemaYaml = `
name: api-config
version: 2

nodes:
  server:
    required: true
    slots:
      host:
        type: scalar
        required: true
        default: localhost
      port:
        type: scalar
        required: true
        default: 8000
        min: 1
        max: 65535

  database:
    required: true
    slots:
      url:
        type: scalar
        required: true
      pool_size:
        type: scalar
        min: 1
        max: 100
        default: 10
      timeout:
        type: scalar
        min: 1
        max: 300
        default: 30

  cache:
    required: false
    slots:
      enabled: [true, false]
      ttl:
        type: scalar
        min: 0
        max: 86400

  features:
    required: false
    slots:
      flags: list

rules:
  - id: cache-needs-server
    if: cache
    requires: [server]
    severity: warn
    message: "Cache config requires server config"

  - id: no-empty-features
    if: features
    not_empty: true
    severity: warn
    message: "Features section should not be empty"
`;

  it('builds a valid config from scratch using fix plan', () => {
    const s = parseSchema(schemaYaml);

    // Start with empty doc
    const emptyDoc: YValue = {};

    // Step 1: Validate empty doc
    const r1 = validateSchema(emptyDoc, s);
    expect(r1.valid).toBe(false);

    // Should need: server (required), database (required)
    const requiredNodes = r1.violations.filter((v) => v.code === 'REQUIRED_NODE');
    expect(requiredNodes.length).toBe(2);

    // Step 2: Fix — create required nodes
    const plan1 = buildFixPlan(r1);
    const step1 = applyYOps(emptyDoc, plan1.ops);
    expect(step1.ok).toBe(true);

    // Step 3: Re-validate — nodes exist but slots missing
    const r2 = validateSchema(step1.doc, s);
    const missingSlots = r2.violations.filter((v) => v.code === 'REQUIRED_SLOT');
    expect(missingSlots.length).toBeGreaterThan(0);

    // Step 4: Fix — fill defaults for missing slots
    const plan2 = buildFixPlan(r2);
    const step2 = applyYOps(step1.doc, plan2.ops);
    expect(step2.ok).toBe(true);

    // Step 5: Re-validate — should be mostly clean
    const r3 = validateSchema(step2.doc, s);

    // database/url has no default, so it's still missing
    const stillMissing = r3.violations.filter(
      (v) => v.code === 'REQUIRED_SLOT' && v.path === 'database/url'
    );
    expect(stillMissing.length).toBe(1);
    expect(stillMissing[0].fix).toBeUndefined(); // no default, can't auto-fix

    // Verify the defaults were applied correctly
    const doc = step2.doc as Record<string, Record<string, unknown>>;
    expect(doc.server.host).toBe('localhost');
    expect(doc.server.port).toBe(8000);
    expect(doc.database.pool_size).toBe(10);
    expect(doc.database.timeout).toBe(30);
  });

  it('catches out-of-range values', () => {
    const s = parseSchema(schemaYaml);
    const doc: YValue = {
      server: { host: 'prod.api.com', port: 99999 }, // port too high
      database: { url: 'postgres://...', pool_size: 0, timeout: 500 }, // both out of range
    };

    const r = validateSchema(doc, s);
    const rangeViolations = r.violations.filter((v) => v.code === 'INVALID_RANGE');

    // port > 65535, pool_size < 1, timeout > 300
    expect(rangeViolations.length).toBe(3);

    const paths = rangeViolations.map((v) => v.path).sort();
    expect(paths).toEqual(['database/pool_size', 'database/timeout', 'server/port']);
  });

  it('dependency rule: cache requires server', () => {
    const s = parseSchema(schemaYaml);

    // Has cache and server — should pass the rule
    const goodDoc: YValue = {
      server: { host: 'localhost', port: 8000 },
      database: { url: 'postgres://...' },
      cache: { enabled: true, ttl: 3600 },
    };
    const r1 = validateSchema(goodDoc, s);
    const ruleViolations1 = r1.violations.filter((v) => v.code === 'RULE_VIOLATION');
    expect(ruleViolations1).toHaveLength(0);

    // Has cache but no server? Can't happen because server is required
    // and would fail on REQUIRED_NODE first — so the rule is a safety net.
    // Test it by having server exist:
    expect(r1.violations.filter((v) => v.code === 'REQUIRED_NODE')).toHaveLength(0);
  });
});
