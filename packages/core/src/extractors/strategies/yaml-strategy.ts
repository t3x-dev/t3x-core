/**
 * YAML Extraction Strategy — v2 with correction loop
 *
 * Zero-trust extraction pipeline inspired by Claude Code's tool validation:
 *   1. LLM outputs YAML (one-shot, efficient)
 *   2. Parse → YOps[]
 *   3. Per-YOp gate validation (source, dedup, structure)
 *   4. Auto-fix deterministic issues (extra fields, path separators)
 *   5. If unfixable rejections remain → one correction round with LLM
 *   6. Apply validated YOps → validate integrity → ylint
 *
 * Key difference from Claude Code: Claude validates per-tool-call in a loop.
 * We validate in batch after one-shot YAML output, then do one targeted
 * correction round if needed. Same zero-trust principle, adapted for
 * tree-building where YAML is more efficient than multi-round tool calls.
 */

import type { LLMProvider } from '../../llm/types';
import { autoFixPaths, autoFixYOp } from '../../ops/gates/autofix';
import { validateDedup } from '../../ops/gates/dedup';
import { validateSources } from '../../ops/gates/source';
import type { GateViolation } from '../../ops/gates/types';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { ylint } from '../../ylint';
import { applyYOps } from '../../yops/engine';
import type { YOp } from '../../yops/types';
import { buildCorrectionPrompt } from '../correctionPrompt';
import { buildRepairPrompt } from '../repairPrompt';
import { DEFAULT_STYLE, type ExtractionStyleConfig, styleSummaryLine } from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import { parseYOpsOutput } from '../yopsParser';
import type { ExtractionInput } from '../yopsPrompt';
import { buildYOpsPrompt } from '../yopsPrompt';
import type { ExtractionStrategy } from './types';

const MAX_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;

interface GatedYOp {
  index: number;
  yop: YOp;
  status: 'passed' | 'auto-fixed' | 'rejected';
  fixes?: string[];
  violations?: GateViolation[];
}

export class YamlExtractionStrategy implements ExtractionStrategy {
  readonly name = 'yaml';

  async extract(
    input: ExtractionInput,
    provider: LLMProvider,
    style?: ExtractionStyleConfig,
  ): Promise<ExtractionResult> {
    const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
    const resolved: ExtractionStyleConfig = { ...DEFAULT_STYLE, ...style };
    const styleSummary = styleSummaryLine(resolved);
    let lastError = '';
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // ── Step 1: LLM generates YAML (one-shot) ──
      const { systemPrompt, userPrompt } = buildYOpsPrompt(input, style);
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

      // ── Step 2: Parse YAML → YOps[] ──
      let parseResult = parseYOpsOutput(raw);
      if (!parseResult.ok) {
        const repair = await this.repairRound('yaml_parse', raw, parseResult.error, input.turns, provider, styleSummary);
        totalUsage.inputTokens += repair.usage.inputTokens;
        totalUsage.outputTokens += repair.usage.outputTokens;
        if (!repair.ok) {
          lastError = `Failed to parse LLM output (repair failed): ${parseResult.error}`;
          continue;
        }
        parseResult = { ok: true, format: 'yops', yops: repair.yops };
      }

      // ── Step 3: Per-YOp gate validation + auto-fix ──
      const gated = this.runGatesWithAutoFix(parseResult.yops, input.turns);

      const passed = gated.filter((g) => g.status === 'passed' || g.status === 'auto-fixed');
      const rejected = gated.filter((g) => g.status === 'rejected');

      // ── Step 4: Correction round if needed ──
      let correctedYOps: YOp[] = [];
      if (rejected.length > 0) {
        const correctionResult = await this.correctionRound(rejected, input.turns, provider, styleSummary);
        if (correctionResult.ok) {
          correctedYOps = correctionResult.yops;
          totalUsage.inputTokens += correctionResult.usage.inputTokens;
          totalUsage.outputTokens += correctionResult.usage.outputTokens;
        }
        // If correction fails, we still proceed with what passed
      }

      // ── Step 5: Combine passed + corrected, resolve paths ──
      const allValidYOps = [...passed.map((g) => g.yop), ...correctedYOps];

      if (allValidYOps.length === 0 && parseResult.yops.length > 0) {
        lastError = `All ${parseResult.yops.length} YOps rejected by gates: ${rejected.map((r) => r.violations?.map((v) => v.message).join('; ')).join(' | ')}`;
        continue;
      }

      // ── Step 5b: Resolve partial paths (like Claude Code's backfillObservableInput) ──
      let resolvedYOps = allValidYOps.map((yop) => {
        const pathFix = autoFixPaths(yop, baseSnapshot.trees);
        return pathFix ? pathFix.fixed : yop;
      });

      // ── Step 6: Apply YOps → validate → ylint ──
      let applyResult = applyYOps(baseSnapshot, resolvedYOps);
      if (!applyResult.ok) {
        const errorMsg = applyResult.error?.message ?? 'unknown';
        const repair = await this.repairRound('yops_apply', raw, errorMsg, input.turns, provider, styleSummary);
        totalUsage.inputTokens += repair.usage.inputTokens;
        totalUsage.outputTokens += repair.usage.outputTokens;
        if (!repair.ok) {
          lastError = `Failed to apply YOps (repair failed): ${errorMsg}`;
          continue;
        }
        // Re-run path resolution and apply with repaired YOps
        resolvedYOps = repair.yops.map((yop) => {
          const pathFix = autoFixPaths(yop, baseSnapshot.trees);
          return pathFix ? pathFix.fixed : yop;
        });
        applyResult = applyYOps(baseSnapshot, resolvedYOps);
        if (!applyResult.ok) {
          lastError = `Failed to apply repaired YOps: ${applyResult.error?.message ?? 'unknown'}`;
          continue;
        }
      }

      const snapshot: SemanticContent = {
        trees: applyResult.trees,
        relations: applyResult.relations,
      };

      const validation = validateIntegrity(snapshot);
      if (!validation.valid) {
        lastError = `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`;
        continue;
      }

      const lintResult = ylint(snapshot);

      return { ok: true, yops: resolvedYOps, snapshot, usage: totalUsage, lintResult };
    }

    return { ok: false, error: lastError, usage: totalUsage };
  }

  /**
   * Run gates on each YOp and attempt auto-fix for failures.
   *
   * For each YOp:
   *   1. Run source + dedup gates
   *   2. If errors → try autoFixYOp
   *   3. If auto-fix succeeds → re-validate fixed version
   *   4. If still fails → mark as rejected
   */
  private runGatesWithAutoFix(
    yops: YOp[],
    turns: Array<{ role: string; content: string }>,
  ): GatedYOp[] {
    const sourceGate = validateSources(yops, turns);
    const dedupGate = validateDedup(yops);

    // Build per-op violation map
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
        // Warnings only — pass with advisory
        return { index: i, yop, status: 'passed' as const };
      }

      // Try auto-fix
      const rawOp = yop as unknown as Record<string, unknown>;
      const fixResult = autoFixYOp(rawOp);

      if (fixResult) {
        // Re-validate the fixed version
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

      // Cannot auto-fix → rejected, needs LLM correction
      return {
        index: i,
        yop,
        status: 'rejected' as const,
        violations,
      };
    });
  }

  /**
   * One targeted correction round: send only the rejected YOps + errors to LLM.
   *
   * Claude Code parallel: tool_result with is_error=true → LLM self-corrects.
   * We batch all rejections into one correction prompt.
   */
  private async correctionRound(
    rejected: GatedYOp[],
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary?: string,
  ): Promise<{
    ok: boolean;
    yops: YOp[];
    usage: { inputTokens: number; outputTokens: number };
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
        maxTokens: 2048, // Correction is small
      });

      const parseResult = parseYOpsOutput(genResult.text);
      if (!parseResult.ok) {
        return { ok: false, yops: [], usage: genResult.usage };
      }

      // Re-validate corrected YOps (no second correction — this is the final check)
      const sourceGate = validateSources(parseResult.yops, turns);
      const validYOps = parseResult.yops.filter((_, i) => {
        const errors = sourceGate.violations.filter(
          (v) => v.opIndex === i && v.severity === 'error',
        );
        return errors.length === 0;
      });

      return { ok: true, yops: validYOps, usage: genResult.usage };
    } catch {
      return { ok: false, yops: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }
  }

  /**
   * One targeted repair round: send the error + raw output back to LLM.
   *
   * Claude Code parallel: tool_result with is_error=true -> LLM self-corrects.
   * We send the specific parse/apply error so the LLM knows what to fix.
   */
  private async repairRound(
    kind: 'yaml_parse' | 'yops_apply',
    rawOutput: string,
    errorMessage: string,
    turns: Array<{ role: string; content: string }>,
    provider: LLMProvider,
    styleSummary?: string,
  ): Promise<{
    ok: boolean;
    yops: YOp[];
    usage: { inputTokens: number; outputTokens: number };
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
