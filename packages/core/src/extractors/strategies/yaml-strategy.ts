/**
 * YAML Extraction Strategy — Zero-Trust Pipeline
 *
 * Inspired by Claude Code's QueryEngine tool validation pattern.
 * Every LLM output passes through 4 deterministic control layers
 * before becoming a committed tree.
 *
 * ┌─────────────────────────────────────────────────┐
 * │  L0: PARSE    "Is this valid YAML/YOps?"        │
 * │  L1: GATE     "Are the ops well-formed?"        │
 * │  L2: ENGINE   "Can the tree accept these ops?"  │
 * └─────────────────────────────────────────────────┘
 *
 * Each layer is deterministic — pass or reject, no scores.
 * LLM is only called for:
 *   - Initial extraction (one-shot)
 *   - Repair rounds (when L0 or L2 fails)
 *   - Correction rounds (when L1 rejects ops)
 *
 * ylint is available as an on-demand quality check (not in pipeline).
 */

import type { YValue } from '@t3x-dev/yops';
import { validateSchema } from '@t3x-dev/yschema';
import type { LLMProvider } from '../../llm/types';
import { autoFixPaths, autoFixYOp } from '../../ops/gates/autofix';
import { validateDedup } from '../../ops/gates/dedup';
import { validateSources } from '../../ops/gates/source';
import type { GateViolation } from '../../ops/gates/types';
import { semanticToPlain } from '../../semantic/serialize';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { applyYOps } from '../../t3x-yops/engine';
import type { YOp, YOpsResult } from '../../t3x-yops/types';
import { buildCorrectionPrompt } from '../correctionPrompt';
import {
  DEFAULT_STYLE,
  type ExtractionStyleConfig,
  styleSummaryLine,
} from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import { buildRepairPrompt } from '../repairPrompt';
import { buildSchemaCorrectionPrompt } from '../schemaCorrectionPrompt';
import { parseYOpsOutput, type YOpsParseResult } from '../yopsParser';
import type { ExtractionInput } from '../yopsPrompt';
import { buildYOpsPrompt } from '../yopsPrompt';
import type { ExtractionStrategy } from './types';

const MAX_RETRIES = 1;
/** Independent retry budget for L3 schema-validation repair (does not affect L0/L1/L2 budget). */
const MAX_SCHEMA_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;

// ── Types ──

interface GatedYOp {
  index: number;
  yop: YOp;
  status: 'passed' | 'auto-fixed' | 'rejected';
  fixes?: string[];
  violations?: GateViolation[];
}

interface L0Result {
  ok: true;
  yops: YOp[];
  parseResult: YOpsParseResult & { ok: true };
}

interface L1Result {
  passed: YOp[];
  rejected: GatedYOp[];
}

interface L2Result {
  ok: true;
  snapshot: SemanticContent;
  resolvedYOps: YOp[];
}

interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

// ── Strategy ──

export class YamlExtractionStrategy implements ExtractionStrategy {
  readonly name = 'yaml';

  async extract(
    input: ExtractionInput,
    provider: LLMProvider,
    style?: ExtractionStyleConfig
  ): Promise<ExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    const resolved: ExtractionStyleConfig = { ...DEFAULT_STYLE, ...style };
    const styleSummary = styleSummaryLine(resolved);
    let lastError = '';
    const totalUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // ── LLM generates YAML (one-shot) ──
      const { systemPrompt, userPrompt } = buildYOpsPrompt(input, { style });
      const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

      let raw: string;
      try {
        const genResult = await provider.generate(combinedPrompt, {
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
        });
        raw = genResult.text;
        totalUsage.inputTokens += genResult.usage.inputTokens;
        totalUsage.outputTokens += genResult.usage.outputTokens;
      } catch (err) {
        lastError = `LLM provider error: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }

      // ── L0: Parse — "Is this valid YAML/YOps?" ──
      const l0 = await this.runL0Parse(raw, input.turns, provider, styleSummary, totalUsage);
      if (!l0.ok) {
        lastError = l0.error;
        continue;
      }

      // ── L1: Gate — "Are the ops well-formed and sourced?" ──
      const l1 = await this.runL1Gate(l0.yops, input.turns, provider, styleSummary, totalUsage);

      // All rejected and nothing passed?
      if (l1.passed.length === 0 && l0.yops.length > 0) {
        lastError = `All ${l0.yops.length} YOps rejected by gates: ${l1.rejected.map((r) => r.violations?.map((v) => v.message).join('; ')).join(' | ')}`;
        continue;
      }

      // ── L2: Engine — "Can the tree accept these ops?" ──
      const l2 = await this.runL2Engine(
        l1.passed,
        baseSnapshot,
        raw,
        input.turns,
        provider,
        styleSummary,
        totalUsage
      );
      if (!l2.ok) {
        lastError = l2.error;
        continue;
      }

      // ── L3: Schema — "Does the tree conform to targetSchema?" ──
      if (input.targetSchema) {
        const plain = semanticToPlain(l2.snapshot) as YValue;
        const vresult = validateSchema(plain, input.targetSchema);
        const errors = vresult.violations.filter((v) => v.severity === 'error');
        if (errors.length > 0) {
          for (let s = 0; s < MAX_SCHEMA_RETRIES; s++) {
            const correction = buildSchemaCorrectionPrompt({
              previousOutput: raw,
              violations: vresult.violations,
            });
            if (!correction) break;
            let repairRaw: string;
            try {
              const repairResult = await provider.generate(
                `${correction.systemPrompt}\n\n---\n\n${correction.userPrompt}`,
                { temperature: TEMPERATURE, maxTokens: MAX_TOKENS }
              );
              repairRaw = repairResult.text;
              totalUsage.inputTokens += repairResult.usage.inputTokens;
              totalUsage.outputTokens += repairResult.usage.outputTokens;
            } catch (err) {
              lastError = `L3 LLM error: ${err instanceof Error ? err.message : String(err)}`;
              break;
            }
            const l0r = await this.runL0Parse(
              repairRaw,
              input.turns,
              provider,
              styleSummary,
              totalUsage
            );
            if (!l0r.ok) {
              lastError = l0r.error;
              continue;
            }
            const l1r = await this.runL1Gate(
              l0r.yops,
              input.turns,
              provider,
              styleSummary,
              totalUsage
            );
            if (l1r.passed.length === 0 && l0r.yops.length > 0) {
              lastError = `L3 all YOps rejected by gates`;
              continue;
            }
            const l2r = await this.runL2Engine(
              l1r.passed,
              baseSnapshot,
              repairRaw,
              input.turns,
              provider,
              styleSummary,
              totalUsage
            );
            if (!l2r.ok) {
              lastError = l2r.error;
              continue;
            }
            const plain2 = semanticToPlain(l2r.snapshot) as YValue;
            const vresult2 = validateSchema(plain2, input.targetSchema);
            const errors2 = vresult2.violations.filter((v) => v.severity === 'error');
            if (errors2.length === 0) {
              return {
                ok: true,
                yops: l2r.resolvedYOps,
                snapshot: l2r.snapshot,
                usage: totalUsage,
              };
            }
            lastError = `Schema validation failed after repair: ${errors2.map((e) => `${e.code} at ${e.path}`).join('; ')}`;
          }
          lastError =
            lastError ||
            `Schema validation failed: ${errors.map((e) => `${e.code} at ${e.path}`).join('; ')}`;
          continue;
        }
      }

      return { ok: true, yops: l2.resolvedYOps, snapshot: l2.snapshot, usage: totalUsage };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L0: PARSE — Raw LLM text → YOp[]
  //
  // Checks: fence stripping, quote normalization, js-yaml syntax,
  //         format detection (tree vs yops), Zod schema validation,
  //         schema auto-fix (dot→slash, camelCase→snake_case)
  // On failure: repair prompt → LLM fixes syntax → re-parse
  // ═══════════════════════════════════════════════════════════════════════════

  private async runL0Parse(
    raw: string,
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary: string,
    usage: LLMUsage
  ): Promise<L0Result | { ok: false; error: string }> {
    let parseResult = parseYOpsOutput(raw);
    if (!parseResult.ok) {
      const repair = await this.repairRound(
        'yaml_parse',
        raw,
        parseResult.error,
        turns,
        provider,
        styleSummary
      );
      usage.inputTokens += repair.usage.inputTokens;
      usage.outputTokens += repair.usage.outputTokens;
      if (!repair.ok) {
        return {
          ok: false,
          error: `Failed to parse LLM output (repair failed): ${parseResult.error}`,
        };
      }
      parseResult = { ok: true, format: 'yops', yops: repair.yops };
    }
    return { ok: true, yops: parseResult.yops, parseResult };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L1: GATE — YOp[] → passed[] + rejected[]
  //
  // Checks: source validation (turn refs, quote matching),
  //         dedup detection (duplicate defines),
  //         path resolution (partial → full path)
  // On failure: auto-fix → re-gate → correction prompt → LLM fixes ops
  // ═══════════════════════════════════════════════════════════════════════════

  private async runL1Gate(
    yops: YOp[],
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary: string,
    usage: LLMUsage
  ): Promise<L1Result> {
    const gated = this.runGatesWithAutoFix(yops, turns);

    const passed = gated.filter((g) => g.status === 'passed' || g.status === 'auto-fixed');
    const rejected = gated.filter((g) => g.status === 'rejected');

    // Correction round for rejected ops
    let correctedYOps: YOp[] = [];
    if (rejected.length > 0) {
      const correctionResult = await this.correctionRound(rejected, turns, provider, styleSummary);
      if (correctionResult.ok) {
        correctedYOps = correctionResult.yops;
        usage.inputTokens += correctionResult.usage.inputTokens;
        usage.outputTokens += correctionResult.usage.outputTokens;
      }
    }

    return {
      passed: [...passed.map((g) => g.yop), ...correctedYOps],
      rejected,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L2: ENGINE — YOp[] + tree → new tree
  //
  // Checks: key validity (snake_case), parent/node existence,
  //         duplicate siblings, relation endpoints, cycle detection,
  //         structural integrity (validateIntegrity)
  // On failure: repair prompt → LLM fixes ops → re-apply
  // ═══════════════════════════════════════════════════════════════════════════

  private async runL2Engine(
    yops: YOp[],
    baseSnapshot: SemanticContent,
    raw: string,
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary: string,
    usage: LLMUsage
  ): Promise<L2Result | { ok: false; error: string }> {
    // Resolve partial paths
    let resolvedYOps = yops.map((yop) => {
      const pathFix = autoFixPaths(yop, baseSnapshot.trees);
      return pathFix ? pathFix.fixed : yop;
    });

    // Apply YOps to tree
    let applyResult: YOpsResult = applyYOps(baseSnapshot, resolvedYOps);
    if (!applyResult.ok) {
      const errorMsg = applyResult.error?.message ?? 'unknown';
      const repair = await this.repairRound(
        'yops_apply',
        raw,
        errorMsg,
        turns,
        provider,
        styleSummary
      );
      usage.inputTokens += repair.usage.inputTokens;
      usage.outputTokens += repair.usage.outputTokens;
      if (!repair.ok) {
        return { ok: false, error: `Failed to apply YOps (repair failed): ${errorMsg}` };
      }
      resolvedYOps = repair.yops.map((yop) => {
        const pathFix = autoFixPaths(yop, baseSnapshot.trees);
        return pathFix ? pathFix.fixed : yop;
      });
      applyResult = applyYOps(baseSnapshot, resolvedYOps);
      if (!applyResult.ok) {
        return {
          ok: false,
          error: `Failed to apply repaired YOps: ${applyResult.error?.message ?? 'unknown'}`,
        };
      }
    }

    const snapshot: SemanticContent = {
      trees: applyResult.trees,
      relations: applyResult.relations,
    };

    // Integrity validation (part of L2 — structural correctness)
    const validation = validateIntegrity(snapshot);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      };
    }

    return { ok: true, snapshot, resolvedYOps };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal: Gate runner with auto-fix
  // ═══════════════════════════════════════════════════════════════════════════

  private runGatesWithAutoFix(
    yops: YOp[],
    turns: Array<{ role: string; content: string }>
  ): GatedYOp[] {
    const sourceGate = validateSources(yops, turns);
    const dedupGate = validateDedup(yops);

    const violationsByOp = new Map<number, GateViolation[]>();
    for (const v of [...sourceGate.violations, ...dedupGate.violations]) {
      if (v.opIndex < 0) continue;
      if (!violationsByOp.has(v.opIndex)) violationsByOp.set(v.opIndex, []);
      violationsByOp.get(v.opIndex)!.push(v);
    }

    return yops.map((yop, i) => {
      const violations = violationsByOp.get(i);
      if (!violations || violations.length === 0) {
        return { index: i, yop, status: 'passed' as const };
      }

      const hasErrors = violations.some((v) => v.severity === 'error');
      if (!hasErrors) {
        return { index: i, yop, status: 'passed' as const };
      }

      // Try auto-fix
      const rawOp = yop as unknown as Record<string, unknown>;
      const fixResult = autoFixYOp(rawOp);

      if (fixResult) {
        const recheck = validateSources([fixResult.fixed], turns);
        const recheckErrors = recheck.violations.filter((v) => v.severity === 'error');
        if (recheckErrors.length === 0) {
          return {
            index: i,
            yop: fixResult.fixed,
            status: 'auto-fixed' as const,
            fixes: fixResult.fixes,
          };
        }
      }

      return {
        index: i,
        yop,
        status: 'rejected' as const,
        violations,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal: LLM recovery rounds
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Correction round — fix rejected YOps by sending errors back to LLM.
   * Claude Code parallel: tool_result with is_error=true → LLM self-corrects.
   */
  private async correctionRound(
    rejected: GatedYOp[],
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary?: string
  ): Promise<{
    ok: boolean;
    yops: YOp[];
    usage: LLMUsage;
  }> {
    const { systemPrompt, userPrompt } = buildCorrectionPrompt({
      rejectedYOps: rejected.map((r) => ({
        index: r.index,
        yop: r.yop,
        violations: r.violations ?? [],
      })),
      turns,
      styleSummary,
    });

    try {
      const genResult = await provider.generate(`${systemPrompt}\n\n---\n\n${userPrompt}`, {
        temperature: TEMPERATURE,
        maxTokens: 2048,
      });

      const parseResult = parseYOpsOutput(genResult.text);
      if (!parseResult.ok) {
        return { ok: false, yops: [], usage: genResult.usage };
      }

      const sourceGate = validateSources(parseResult.yops, turns);
      const validYOps = parseResult.yops.filter((_, i) => {
        const errors = sourceGate.violations.filter(
          (v) => v.opIndex === i && v.severity === 'error'
        );
        return errors.length === 0;
      });

      return { ok: true, yops: validYOps, usage: genResult.usage };
    } catch {
      return { ok: false, yops: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }
  }

  /**
   * Repair round — fix parse/apply errors by sending error back to LLM.
   * Claude Code parallel: tool_result with is_error=true → LLM self-corrects.
   */
  private async repairRound(
    kind: 'yaml_parse' | 'yops_apply',
    rawOutput: string,
    errorMessage: string,
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary?: string
  ): Promise<{
    ok: boolean;
    yops: YOp[];
    usage: LLMUsage;
  }> {
    const { systemPrompt, userPrompt } = buildRepairPrompt({
      kind,
      rawOutput,
      errorMessage,
      turns,
      styleSummary,
    });

    try {
      const genResult = await provider.generate(`${systemPrompt}\n\n---\n\n${userPrompt}`, {
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
      });

      const parseResult = parseYOpsOutput(genResult.text);
      if (!parseResult.ok) {
        return { ok: false, yops: [], usage: genResult.usage };
      }

      return { ok: true, yops: parseResult.yops, usage: genResult.usage };
    } catch {
      return { ok: false, yops: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }
  }
}
