/**
 * Boundary test for the workspaceStore draft-proposal mirror state.
 *
 * Six fields describe one logical thing — the user's uncommitted draft
 * proposal — but are read by different surfaces (AfterPanel, Apply,
 * refresh restore). When a writer touches one but not the others, the
 * surfaces silently disagree (PR #952's P1: live swap rewrote draftOps
 * without touching scriptText, so AfterPanel showed Concise while Apply
 * committed Balanced).
 *
 * To prevent this class of drift entirely, the convention "writers
 * update all six together" is enforced by `writeDraftProposal()` in
 * workspaceStore.ts — and this test fails CI if anything in the file
 * writes those fields outside the whitelist.
 *
 * Per-field whitelist (matches `docs/plans/2026-05-03-centralize-draft-
 * proposal-writes.md` §5):
 *
 *   draftOps / draftTree / draftVariants
 *     → writeDraftProposal, clearDraft, restoreDraftFor,
 *       conversationResetState, <store-bootstrap>, migrate
 *
 *   editorOverride (replaces scriptText + scriptDirty as of PR 1)
 *     → above PLUS setEditorOverride, clearEditorOverride
 *
 *   draftsByConversation
 *     → above PLUS setEditorOverride / clearEditorOverride
 *       (snapshot mirroring), partialize (read-only persist callback)
 *
 * "<store-bootstrap>" is the anonymous arrow that is the first argument
 * to `persist()` / `create()` — recognized structurally, not by name.
 *
 * The test scans `ObjectLiteralExpression` nodes (not `set()` call
 * args) so it catches indirect patterns:
 *
 *   const baseUpdate = { draftOps: cached };  // literal seen here
 *   set(baseUpdate);                          // (would also slip past
 *                                             //  a set()-only scan)
 *   set({ ...baseUpdate });                   // ditto
 *
 * Type-only constructs (`InterfaceDeclaration`, `TypeLiteralNode`)
 * aren't `ObjectLiteralExpression`s, so type definitions like
 * `setDraft: (input: { ops; tree }) => void` are skipped naturally.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const STORE_FILE = resolve(__dirname, '../../store/workspaceStore.ts');

const STRUCTURAL_FIELDS = ['draftOps', 'draftTree', 'draftVariants'] as const;
// PR 1 collapsed the prior `scriptText` + `scriptDirty` field pair into
// a single `editorOverride: string | null`. The boundary still applies
// to the new field — it's the override piece of the proposal mirror.
const EDITOR_FIELD = 'editorOverride' as const;
const SNAPSHOT_FIELD = 'draftsByConversation' as const;
const PROPOSAL_FIELDS: readonly string[] = [...STRUCTURAL_FIELDS, EDITOR_FIELD, SNAPSHOT_FIELD];

const STRUCTURAL_WHITELIST = new Set([
  'writeDraftProposal',
  'clearDraft',
  'restoreDraftFor',
  'conversationResetState',
  '<store-bootstrap>',
  // `migrate` runs on persist rehydration to convert v1 entries to v2
  // PersistedDraft shape. It writes draftsByConversation as part of
  // returning the migrated state — a one-time, well-scoped construction.
  'migrate',
]);

// The user-facing override setters — the only places that may write the
// editor override field outside the writer.
const EDITOR_WHITELIST = new Set([
  ...STRUCTURAL_WHITELIST,
  'setEditorOverride',
  'clearEditorOverride',
]);
// `partialize` is the persist config callback that names which subset
// of state to write to localStorage. It necessarily mentions
// `draftsByConversation` because that's the persisted field — the
// reference is read-only, not a state mutation, but the AST scan can't
// distinguish without dataflow analysis. Whitelist explicitly so the
// allowed-write list stays accurate. `setEditorOverride` and
// `clearEditorOverride` mirror the editor override into the snapshot,
// so they need snapshot write rights too.
const SNAPSHOT_WHITELIST = new Set([
  ...STRUCTURAL_WHITELIST,
  'setEditorOverride',
  'clearEditorOverride',
  'partialize',
]);

function whitelistFor(field: string): Set<string> {
  if ((STRUCTURAL_FIELDS as readonly string[]).includes(field)) return STRUCTURAL_WHITELIST;
  if (field === EDITOR_FIELD) return EDITOR_WHITELIST;
  if (field === SNAPSHOT_FIELD) return SNAPSHOT_WHITELIST;
  // Should never reach here — tests below iterate PROPOSAL_FIELDS.
  return new Set();
}

/**
 * Walk parent chain to find the enclosing function and return its
 * "name." Names come from a few different AST shapes:
 *
 *   function foo() {}                    → FunctionDeclaration.name
 *   const foo = () => {}                 → VariableDeclaration.name
 *   { foo: () => {} }                    → PropertyAssignment.name
 *   foo() {}  (in object/class body)     → MethodDeclaration.name
 *
 * Anonymous arrows passed directly to `persist(...)` / `create(...)`
 * map to "<store-bootstrap>" so the initial state literal can write
 * fields without tripping the test.
 *
 * Returns "<anonymous>" for any function we can't name; the test
 * treats that as a violation regardless of field, since unnamed
 * functions in workspaceStore.ts are unusual and worth flagging.
 */
function enclosingFunctionName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      // Anonymous arrow handed to a known store-bootstrap call.
      if (parent && ts.isCallExpression(parent)) {
        const callee = parent.expression;
        if (ts.isIdentifier(callee) && (callee.text === 'persist' || callee.text === 'create')) {
          return '<store-bootstrap>';
        }
      }
      return '<anonymous>';
    }
    current = current.parent;
  }
  return '<top-level>';
}

interface Violation {
  field: string;
  enclosing: string;
  line: number;
  text: string;
}

/**
 * Some object literals look like state writes by key name but are
 * actually shapes-by-contract handed to a helper. The helper itself
 * is responsible for the eventual state mutation, and IS whitelisted.
 * Skip these to avoid double-flagging:
 *
 *   writeDraftProposal(s, { ... text, dirty })   — input contract
 *   writeDraftSnapshot(map, id, { scriptText })  — PersistedDraft shape
 *
 * The skip is structural: the literal must be a direct argument to
 * one of the named callees. Adding an indirection (assigning to a
 * variable first) would make the literal flag again — by design,
 * because that's exactly the pattern that would let drift sneak in.
 */
const SHAPE_HELPER_CALLEES = new Set(['writeDraftProposal', 'writeDraftSnapshot']);

function isShapeHelperArgument(literal: ts.ObjectLiteralExpression): boolean {
  const parent = literal.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  const callee = parent.expression;
  return ts.isIdentifier(callee) && SHAPE_HELPER_CALLEES.has(callee.text);
}

function findViolations(): Violation[] {
  const source = readFileSync(STORE_FILE, 'utf8');
  const sf = ts.createSourceFile(STORE_FILE, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node) && !isShapeHelperArgument(node)) {
      for (const prop of node.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
        ) {
          const fieldName = prop.name.text;
          if (PROPOSAL_FIELDS.includes(fieldName)) {
            const enclosing = enclosingFunctionName(node);
            const allowed = whitelistFor(fieldName);
            if (!allowed.has(enclosing)) {
              const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
              violations.push({
                field: fieldName,
                enclosing,
                line: line + 1,
                text: prop.getText(sf),
              });
            }
          }
        }
        // Shorthand assignment (`{ draftOps }`) is also a write — same
        // shape, different node kind. PropertyAssignment covers
        // `field: value` and ShorthandPropertyAssignment covers `field`.
        if (ts.isShorthandPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const fieldName = prop.name.text;
          if (PROPOSAL_FIELDS.includes(fieldName)) {
            const enclosing = enclosingFunctionName(node);
            const allowed = whitelistFor(fieldName);
            if (!allowed.has(enclosing)) {
              const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
              violations.push({
                field: fieldName,
                enclosing,
                line: line + 1,
                text: prop.getText(sf),
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return violations;
}

describe('workspaceStore proposal boundary', () => {
  it('only whitelisted functions write proposal mirror fields', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      // Build a readable failure so a future regression points at the
      // exact line and field that broke the contract.
      const detail = violations
        .map(
          (v) =>
            `  ${STORE_FILE}:${v.line}\n    field "${v.field}" written in "${v.enclosing}" (not whitelisted)\n    text: ${v.text}`
        )
        .join('\n\n');
      const allowedSummary = PROPOSAL_FIELDS.map(
        (f) => `    ${f}: { ${[...whitelistFor(f)].join(', ')} }`
      ).join('\n');
      throw new Error(
        `workspaceStore.ts writes proposal mirror fields outside the whitelist.\n` +
          `If you need a new write site, route it through writeDraftProposal() instead, OR\n` +
          `update the whitelist in this test if and only if the new path is genuinely\n` +
          `responsible for keeping the six fields in lockstep.\n\n` +
          `Violations:\n${detail}\n\n` +
          `Whitelist (per field):\n${allowedSummary}`
      );
    }
    expect(violations).toEqual([]);
  });

  it('whitelist references functions that actually exist in the store', () => {
    // Guard against typos: a whitelist entry for "wrtieDraftProposal"
    // would silently never match. Read the source and confirm every
    // named whitelist entry appears as a function/method/property in
    // the file. (`<store-bootstrap>` and `<anonymous>` are intentional
    // synthetic names.)
    const source = readFileSync(STORE_FILE, 'utf8');
    const allNames = new Set<string>([
      ...STRUCTURAL_WHITELIST,
      ...EDITOR_WHITELIST,
      ...SNAPSHOT_WHITELIST,
    ]);
    for (const name of allNames) {
      if (name.startsWith('<')) continue; // synthetic
      // Look for either `function name(` or `name:` (property setter).
      const present =
        source.includes(`function ${name}(`) || new RegExp(`\\b${name}\\s*:`).test(source);
      expect(present, `whitelist entry "${name}" not found in workspaceStore.ts`).toBe(true);
    }
  });
});
