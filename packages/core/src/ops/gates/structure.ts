/**
 * Structure Gate (G4)
 *
 * Validates structural integrity and quality of the result tree.
 * Extracted from: structuralValidator agent + ylint.
 *
 * Post-apply gate: operates on SemanticContent after YOps are applied.
 * Advisory only — violations are warnings, not errors.
 */

import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { ylint } from '../../ylint';
import type { GateResult, GateViolation } from './types';

export function validateStructure(content: SemanticContent): GateResult {
  const violations: GateViolation[] = [];

  // Structural integrity (refs, cycles, IDs)
  const integrity = validateIntegrity(content);
  for (const error of integrity.errors) {
    violations.push({
      gate: 'structure',
      severity: 'warning',
      opIndex: -1,
      message: `integrity: ${error.type}: ${error.message} (${error.location})`,
    });
  }
  for (const warning of integrity.warnings) {
    violations.push({
      gate: 'structure',
      severity: 'warning',
      opIndex: -1,
      message: `integrity: ${warning.type}: ${warning.message} (${warning.location})`,
    });
  }

  // YLint quality checks (4 normal forms)
  const lint = ylint(content);
  for (const w of lint.warnings) {
    violations.push({
      gate: 'structure',
      severity: 'warning',
      opIndex: -1,
      message: `ylint[${w.form}/${w.rule}]: ${w.message} at ${w.path}`,
    });
  }

  // Structure gate is advisory — always passes
  return { gate: 'structure', passed: true, violations };
}
