/**
 * E2E: ylint general + schema validation → YOps auto-fix → re-validate
 *
 * Tests the full pipeline:
 *   1. Start with messy LLM-extracted data (TreeNode[])
 *   2. ylint general layer catches structural issues (4 normal forms)
 *   3. Convert to YValue, run schema validation for domain issues
 *   4. Collect all fixes (from both layers)
 *   5. Apply fixes via YOps
 *   6. Re-validate both layers — confirm fixes resolved
 *   7. Show what remains for human review
 */

import { buildFixPlan, parseSchema, validateSchema } from '@t3x-dev/schema';
import type { YOp, YValue } from '@t3x-dev/yops';
import { applyYOps } from '@t3x-dev/yops';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { treesToYValue, yvalueToTrees } from '../../t3x-yops/convert';
import { ylint } from '../../ylint';

// ── Helpers ──

function node(
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = []
): TreeNode {
  return { key, slots: slots as TreeNode['slots'], children };
}

function sc(trees: TreeNode[]): SemanticContent {
  return { trees, relations: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 1: Travel Planning — messy extraction → general lint → schema → fix → clean
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 1: Travel planning — full pipeline', () => {
  // Schema: what a travel plan should look like
  const schemaYaml = `
name: travel-plan
version: 1

nodes:
  destination:
    required: true
    slots:
      city: scalar
      country: scalar
      duration: scalar

  budget:
    required: true
    slots:
      total: scalar
      currency: [USD, EUR, CNY, JPY]
    children:
      breakdown:
        slots:
          food: scalar
          transport: scalar
          accommodation: scalar

  activities:
    required: false
    children: any
    each_child:
      slots:
        type: [sightseeing, dining, adventure, cultural, nightlife]
        priority: [high, medium, low]

rules:
  - id: budget-needs-currency
    if: budget
    must_have: [total, currency]
    severity: error
    message: "Budget must have total and currency"
`;

  // Messy LLM extraction with multiple problems:
  const messyTrees: TreeNode[] = [
    // Problem 1 (general): single-child chain — destination → wrapper → actual data
    node('destination', {}, [
      node('wrapper', {}, [
        node('details', {
          // Problem 2 (general): generic key "details"
          city: 'Hangzhou',
          country: 'China',
          duration: '7 days',
        }),
      ]),
    ]),
    // Problem 3 (schema): budget has wrong currency enum
    // Problem 4 (schema): budget missing 'total' slot
    node(
      'budget',
      {
        currency: 'RMB', // not in enum!
        // total is missing!
      },
      [
        node('breakdown', {
          food: 2000,
          transport: 500,
          accommodation: 3000,
        }),
      ]
    ),
    // Problem 5 (general): scalar compound "and"
    // Problem 6 (schema): invalid activity type enum
    node('activities', {}, [
      node('west_lake', {
        type: 'sightseeing',
        priority: 'high',
        notes: 'walk and boat ride', // compound "and"
      }),
      node('hiking', {
        type: 'outdoor', // not in enum!
        priority: 'medium',
      }),
    ]),
    // Problem 7 (general): list with single item
    node('tags', {
      items: ['travel'], // single-item list
    }),
  ];

  it('step 1: ylint general layer detects structural issues', () => {
    const result = ylint(sc(messyTrees));

    // Should find:
    // - single-child-chain on destination.wrapper (wrapper is single child with single child)
    const chains = result.warnings.filter((w) => w.rule === 'single-child-chain');
    expect(chains.length).toBeGreaterThanOrEqual(1);
    // The innermost chain: wrapper has 1 child (details), and wrapper IS the only child of destination
    const wrapperChain = chains.find((w) => w.path === 'destination.wrapper');
    expect(wrapperChain).toBeDefined();
    expect(wrapperChain!.fix).toEqual([{ fold: { path: 'destination/wrapper' } }]);

    // - generic-container-key on "details"
    const generic = result.warnings.find((w) => w.rule === 'generic-container-key');
    expect(generic).toBeDefined();
    expect(generic!.path).toBe('destination.wrapper.details');

    // - scalar-compound on "walk and boat ride"
    const compound = result.warnings.find((w) => w.rule === 'scalar-compound');
    expect(compound).toBeDefined();
    expect(compound!.path).toContain('west_lake');

    // - list-single-item on tags.items
    const singleList = result.warnings.find((w) => w.rule === 'list-single-item');
    expect(singleList).toBeDefined();
    expect(singleList!.fix).toEqual([{ set: { path: 'tags/items', value: 'travel' } }]);

    // Collect auto-fixable warnings
    const fixable = result.warnings.filter((w) => w.fix !== undefined);
    expect(fixable.length).toBeGreaterThanOrEqual(2); // fold + set at minimum
  });

  it('step 2: schema layer detects domain violations', () => {
    const doc = treesToYValue(messyTrees);
    const schema = parseSchema(schemaYaml);
    const result = validateSchema(doc, schema);

    expect(result.valid).toBe(false);

    // Should find:
    // - INVALID_ENUM on budget/currency (RMB not in [USD, EUR, CNY, JPY])
    const enumV = result.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path === 'budget/currency'
    );
    expect(enumV).toBeDefined();
    expect(enumV!.fix).toEqual([{ set: { path: 'budget/currency', value: 'USD' } }]);

    // - REQUIRED_SLOT on budget/total
    const missingTotal = result.violations.find(
      (v) => v.code === 'REQUIRED_SLOT' && v.path === 'budget/total'
    );
    expect(missingTotal).toBeDefined();
    // No default → no auto-fix
    expect(missingTotal!.fix).toBeUndefined();

    // - INVALID_ENUM on activities/hiking/type ('outdoor' not in enum)
    const hikingType = result.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path === 'activities/hiking/type'
    );
    expect(hikingType).toBeDefined();
    expect(hikingType!.fix).toEqual([
      { set: { path: 'activities/hiking/type', value: 'sightseeing' } },
    ]);

    // - RULE_VIOLATION: budget must have total
    const budgetRule = result.violations.find((v) => v.code === 'RULE_VIOLATION');
    expect(budgetRule).toBeDefined();
  });

  it('step 3: collect all fixes from both layers and apply', () => {
    const doc = treesToYValue(messyTrees);
    const schema = parseSchema(schemaYaml);

    // Collect general layer fixes
    const generalResult = ylint(sc(messyTrees));
    const generalFixes: YOp[] = generalResult.warnings
      .filter((w) => w.fix !== undefined)
      .flatMap((w) => w.fix!);

    // Collect schema layer fixes
    const schemaResult = validateSchema(doc, schema);
    const schemaPlan = buildFixPlan(schemaResult);

    // Total fixes from both layers
    const allFixes = [...generalFixes, ...schemaPlan.ops];
    expect(allFixes.length).toBeGreaterThanOrEqual(3);

    // Apply general fixes first (structural), then schema fixes (domain)
    // General fixes operate on YValue (converted from trees)
    const afterGeneral = applyYOps(doc, generalFixes);
    expect(afterGeneral.ok).toBe(true);

    // Then schema fixes
    const afterSchema = applyYOps(afterGeneral.doc, schemaPlan.ops);
    expect(afterSchema.ok).toBe(true);

    const finalDoc = afterSchema.doc as Record<string, unknown>;

    // Verify: single-item list unwrapped
    expect(finalDoc.tags).toBeDefined();
    expect((finalDoc.tags as Record<string, unknown>).items).toBe('travel'); // scalar, not array

    // Verify: currency fixed from RMB → USD
    const budget = finalDoc.budget as Record<string, unknown>;
    expect(budget.currency).toBe('USD');

    // Verify: hiking type fixed from outdoor → sightseeing
    const activities = finalDoc.activities as Record<string, Record<string, unknown>>;
    expect(activities.hiking.type).toBe('sightseeing');
  });

  it('step 4: re-validate after fixes — show what remains', () => {
    const doc = treesToYValue(messyTrees);
    const schema = parseSchema(schemaYaml);

    // Apply general fixes
    const generalResult = ylint(sc(messyTrees));
    const generalFixes: YOp[] = generalResult.warnings
      .filter((w) => w.fix !== undefined)
      .flatMap((w) => w.fix!);
    const afterGeneral = applyYOps(doc, generalFixes);

    // Apply schema fixes
    const schemaResult = validateSchema(afterGeneral.doc, schema);
    const schemaPlan = buildFixPlan(schemaResult);
    const afterSchema = applyYOps(afterGeneral.doc, schemaPlan.ops);

    // Re-validate general layer on fixed trees
    const fixedTrees = yvalueToTrees(afterSchema.doc);
    const reGeneral = ylint(sc(fixedTrees));

    // Single-item list is gone (fixed to scalar)
    const singleList = reGeneral.warnings.find((w) => w.rule === 'list-single-item');
    expect(singleList).toBeUndefined();

    // Re-validate schema layer
    const reSchema = validateSchema(afterSchema.doc, schema);

    // Currency enum is fixed
    const enumFixed = reSchema.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path === 'budget/currency'
    );
    expect(enumFixed).toBeUndefined();

    // Hiking type is fixed
    const hikingFixed = reSchema.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path === 'activities/hiking/type'
    );
    expect(hikingFixed).toBeUndefined();

    // REMAINING (needs human):
    // 1. budget/total still missing (no default)
    const stillMissingTotal = reSchema.violations.find(
      (v) => v.code === 'REQUIRED_SLOT' && v.path === 'budget/total'
    );
    expect(stillMissingTotal).toBeDefined();

    // 2. scalar-compound "walk and boat ride" still there (no auto-fix)
    const stillCompound = reGeneral.warnings.find((w) => w.rule === 'scalar-compound');
    expect(stillCompound).toBeDefined();

    // 3. generic key "details" still there (no auto-fix, needs domain knowledge)
    // Note: after fold, the tree structure changed — check what remains
    const genericKeys = reGeneral.warnings.filter((w) => w.rule === 'generic-container-key');
    // May or may not be present depending on fold result
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 2: Product Requirements — strict schema catches junk, ylint catches style
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 2: Product requirements — strict schema + general lint', () => {
  const schemaYaml = `
name: product-requirements
version: 1
strict: true

nodes:
  problem:
    required: true
    slots:
      statement: scalar
      impact: [high, medium, low]
      users_affected: scalar

  solution:
    required: true
    slots:
      approach: scalar
      effort: [small, medium, large]
    children: any
    each_child:
      slots:
        description: scalar
        status: [proposed, approved, rejected]

  constraints:
    required: false
    slots:
      timeline: scalar
      budget: scalar
      team_size: scalar
`;

  it('full pipeline: messy input → dual validation → fix → verify', () => {
    // Messy product doc with many issues
    const messyTrees: TreeNode[] = [
      node('problem', {
        statement:
          'Users are frustrated with slow load times and poor mobile experience and outdated UI',
        // compound "and" x2
        impact: 'critical', // not in enum!
        users_affected: 5000,
      }),
      node(
        'solution',
        {
          approach: 'Rebuild the frontend',
          effort: 'large',
        },
        [
          node('phase_one', {
            description: 'Migrate to Next.js',
            status: 'approved',
          }),
          node('phase_two', {
            description: 'Redesign UI components',
            status: 'maybe', // not in enum!
          }),
        ]
      ),
      node('constraints', {
        timeline: 'Q3 2026',
        budget: '200k',
        team_size: 5,
      }),
      // Undeclared junk nodes (strict mode should catch)
      node('meeting_notes', {
        date: '2026-04-01',
        attendees: 'alice, bob, charlie', // multi-fact
      }),
      node('scratch', {
        temp: true,
      }),
    ];

    const doc = treesToYValue(messyTrees);
    const schema = parseSchema(schemaYaml);

    // ── Step 1: General lint ──
    const generalResult = ylint(sc(messyTrees));

    // Should catch: scalar-compound on problem statement
    const compounds = generalResult.warnings.filter((w) => w.rule === 'scalar-compound');
    expect(compounds.length).toBeGreaterThanOrEqual(1);
    expect(compounds[0].path).toContain('problem');

    // Should catch: scalar-multi-fact on meeting_notes.attendees
    const multiFacts = generalResult.warnings.filter((w) => w.rule === 'scalar-multi-fact');
    expect(multiFacts.length).toBeGreaterThanOrEqual(1);

    // ── Step 2: Schema validation ──
    const schemaResult = validateSchema(doc, schema);
    expect(schemaResult.valid).toBe(false);

    // Should catch: UNEXPECTED_NODE on meeting_notes and scratch (strict mode)
    const unexpected = schemaResult.violations.filter((v) => v.code === 'UNEXPECTED_NODE');
    expect(unexpected.length).toBe(2);
    expect(unexpected.map((v) => v.path).sort()).toEqual(['meeting_notes', 'scratch']);

    // Should catch: INVALID_ENUM on problem/impact ('critical' not in enum)
    const impactEnum = schemaResult.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path === 'problem/impact'
    );
    expect(impactEnum).toBeDefined();

    // Should catch: INVALID_ENUM on solution/phase_two/status ('maybe' not in enum)
    const statusEnum = schemaResult.violations.find(
      (v) => v.code === 'INVALID_ENUM' && v.path.includes('phase_two')
    );
    expect(statusEnum).toBeDefined();

    // ── Step 3: Build combined fix plan ──
    const generalFixes: YOp[] = generalResult.warnings
      .filter((w) => w.fix !== undefined)
      .flatMap((w) => w.fix!);
    const schemaPlan = buildFixPlan(schemaResult);

    // Schema should have fixes for: drop meeting_notes, drop scratch, fix enums
    expect(schemaPlan.fixes_count).toBeGreaterThanOrEqual(3);

    // ── Step 4: Apply fixes ──
    const afterGeneral = applyYOps(doc, generalFixes);
    expect(afterGeneral.ok).toBe(true);

    const afterSchema = applyYOps(afterGeneral.doc, schemaPlan.ops);
    expect(afterSchema.ok).toBe(true);

    // ── Step 5: Verify fixes ──
    const finalDoc = afterSchema.doc as Record<string, unknown>;

    // Junk nodes removed
    expect(finalDoc.meeting_notes).toBeUndefined();
    expect(finalDoc.scratch).toBeUndefined();

    // Enums fixed
    const problem = finalDoc.problem as Record<string, unknown>;
    expect(problem.impact).toBe('high'); // first enum value

    const solution = finalDoc.solution as Record<string, Record<string, Record<string, unknown>>>;
    expect(solution.phase_two.status).toBe('proposed'); // first enum value

    // ── Step 6: Re-validate ──
    const reSchema = validateSchema(afterSchema.doc, schema);

    // No more unexpected nodes
    const reUnexpected = reSchema.violations.filter((v) => v.code === 'UNEXPECTED_NODE');
    expect(reUnexpected).toHaveLength(0);

    // No more enum violations
    const reEnums = reSchema.violations.filter((v) => v.code === 'INVALID_ENUM');
    expect(reEnums).toHaveLength(0);

    // Re-run general lint on fixed trees
    const fixedTrees = yvalueToTrees(afterSchema.doc);
    const reGeneral = ylint(sc(fixedTrees));

    // Remaining (human review): compound scalars can't be auto-fixed
    const remainingCompounds = reGeneral.warnings.filter((w) => w.rule === 'scalar-compound');
    expect(remainingCompounds.length).toBeGreaterThanOrEqual(1);

    // Summary: auto-fix resolved structural + domain issues,
    // human still needs to address compound scalars
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E 3: API Config — defaults fill gaps, ranges catch values, iterative fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E 3: API config — iterative fix with defaults', () => {
  const schemaYaml = `
name: api-config
version: 1

nodes:
  server:
    required: true
    slots:
      host:
        type: scalar
        default: localhost
      port:
        type: scalar
        default: 8000
        min: 1
        max: 65535
      debug:
        type: scalar
        default: false

  database:
    required: true
    slots:
      url: scalar
      pool_size:
        type: scalar
        default: 10
        min: 1
        max: 100

  logging:
    required: true
    slots:
      level: [debug, info, warn, error]
      format: [json, text]

rules:
  - id: prod-no-debug
    if: server
    must_not_have: [admin_password]
    severity: error
    message: "Server config should not contain admin_password"
`;

  it('iterative: empty → create nodes → fill defaults → fix enums → clean', () => {
    const schema = parseSchema(schemaYaml);

    // ── Iteration 1: Start with completely empty doc ──
    const empty: YValue = {};
    const r1 = validateSchema(empty, schema);
    expect(r1.valid).toBe(false);

    const missing1 = r1.violations.filter((v) => v.code === 'REQUIRED_NODE');
    expect(missing1.length).toBe(3); // server, database, logging

    // Fix: create required nodes
    const plan1 = buildFixPlan(r1);
    expect(plan1.ops.length).toBe(3); // 3 defines
    const step1 = applyYOps(empty, plan1.ops);
    expect(step1.ok).toBe(true);

    // Verify nodes exist but are empty
    const doc1 = step1.doc as Record<string, Record<string, unknown>>;
    expect(doc1.server).toEqual({});
    expect(doc1.database).toEqual({});
    expect(doc1.logging).toEqual({});

    // ── Iteration 2: Fill missing slots with defaults ──
    const r2 = validateSchema(step1.doc, schema);
    expect(r2.valid).toBe(false);

    const missing2 = r2.violations.filter((v) => v.code === 'REQUIRED_SLOT');
    // server: host, port, debug (all have defaults)
    // database: url (no default), pool_size (has default)
    // logging: level (enum, first value), format (enum, first value)
    expect(missing2.length).toBeGreaterThanOrEqual(5);

    const plan2 = buildFixPlan(r2);
    const step2 = applyYOps(step1.doc, plan2.ops);
    expect(step2.ok).toBe(true);

    // Verify defaults applied
    const doc2 = step2.doc as Record<string, Record<string, unknown>>;
    expect(doc2.server.host).toBe('localhost');
    expect(doc2.server.port).toBe(8000);
    expect(doc2.server.debug).toBe(false);
    expect(doc2.database.pool_size).toBe(10);
    expect(doc2.logging.level).toBe('debug'); // first enum
    expect(doc2.logging.format).toBe('json'); // first enum

    // ── Iteration 3: Re-validate — only unfixable issues remain ──
    const r3 = validateSchema(step2.doc, schema);

    // database/url has no default — still missing
    const urlMissing = r3.violations.find(
      (v) => v.code === 'REQUIRED_SLOT' && v.path === 'database/url'
    );
    expect(urlMissing).toBeDefined();
    expect(urlMissing!.fix).toBeUndefined(); // no default, no enum → can't auto-fix

    // Everything else should be clean
    const otherViolations = r3.violations.filter(
      (v) => !(v.code === 'REQUIRED_SLOT' && v.path === 'database/url')
    );
    expect(otherViolations).toHaveLength(0);

    // ── Step 4: Human fills in the remaining field ──
    const humanFix = applyYOps(step2.doc, [
      { set: { path: 'database/url', value: 'postgres://localhost:5432/myapp' } },
    ]);
    expect(humanFix.ok).toBe(true);

    // Final validation — should be fully clean
    const rFinal = validateSchema(humanFix.doc, schema);
    expect(rFinal.valid).toBe(true);
    expect(rFinal.violations).toHaveLength(0);

    // Also run general lint — should be clean tree
    const finalTrees = yvalueToTrees(humanFix.doc);
    const lintFinal = ylint(sc(finalTrees));
    // No structural issues in a well-built config
    const structuralWarnings = lintFinal.warnings.filter(
      (w) => w.severity === 'warn' || w.severity === 'error'
    );
    expect(structuralWarnings).toHaveLength(0);
  });

  it('catches out-of-range + forbidden field in one pass', () => {
    const schema = parseSchema(schemaYaml);

    const badConfig: YValue = {
      server: {
        host: 'prod.api.com',
        port: 99999, // > 65535
        debug: false,
        admin_password: 'hunter2', // forbidden by rule!
      },
      database: {
        url: 'postgres://...',
        pool_size: 0, // < 1
      },
      logging: {
        level: 'trace', // not in enum
        format: 'json',
      },
    };

    // Schema validation
    const result = validateSchema(badConfig, schema);
    expect(result.valid).toBe(false);

    // Range violations
    const ranges = result.violations.filter((v) => v.code === 'INVALID_RANGE');
    expect(ranges.length).toBe(2); // port + pool_size
    expect(ranges.map((v) => v.path).sort()).toEqual(['database/pool_size', 'server/port']);

    // Enum violation
    const enums = result.violations.filter((v) => v.code === 'INVALID_ENUM');
    expect(enums.length).toBe(1); // logging/level
    expect(enums[0].path).toBe('logging/level');

    // Rule violation: admin_password present
    const rules = result.violations.filter((v) => v.code === 'RULE_VIOLATION');
    expect(rules.length).toBe(1);
    expect(rules[0].message).toContain('admin_password');

    // General lint
    const trees = yvalueToTrees(badConfig);
    const lintResult = ylint(sc(trees));

    // No structural issues in this config — it's well-shaped, just wrong values
    const structuralIssues = lintResult.warnings.filter(
      (w) => w.rule === 'single-child-chain' || w.rule === 'generic-container-key'
    );
    expect(structuralIssues).toHaveLength(0);
  });
});
