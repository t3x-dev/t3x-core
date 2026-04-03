/**
 * YAML Extraction Strategy
 *
 * Extracts semantic content by having the LLM output YAML,
 * then parsing and validating it. This is the original extraction approach.
 *
 * Gate integration: after parse, runs source + dedup gates to filter
 * invalid YOps before applying them. Structure gate runs post-apply (advisory).
 */

import type { LLMProvider } from '../../llm/types';
import { validateDedup } from '../../ops/gates/dedup';
import { validateSources } from '../../ops/gates/source';
import type { SemanticContent } from '../../semantic/types';
import { validateIntegrity } from '../../semantic/validate';
import { ylint } from '../../ylint';
import { applyYOps } from '../../yops/engine';
import type { ExtractionStyleConfig } from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import { parseYOpsOutput } from '../yopsParser';
import type { ExtractionInput } from '../yopsPrompt';
import { buildYOpsPrompt } from '../yopsPrompt';
import type { ExtractionStrategy } from './types';

const MAX_RETRIES = 1;
const TEMPERATURE = 0.1;
const MAX_TOKENS = 8192;

export class YamlExtractionStrategy implements ExtractionStrategy {
	readonly name = 'yaml';

	async extract(
		input: ExtractionInput,
		provider: LLMProvider,
		style?: ExtractionStyleConfig,
	): Promise<ExtractionResult> {
		const baseSnapshot: SemanticContent = input.snapshot ?? { trees: [], relations: [] };
		let lastError = '';
		const totalUsage = { inputTokens: 0, outputTokens: 0 };

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

			const parseResult = parseYOpsOutput(raw);
			if (!parseResult.ok) {
				lastError = `Failed to parse LLM output: ${parseResult.error}`;
				continue;
			}

			// Pre-apply gates: source + dedup — filter out rejected YOps
			const sourceGate = validateSources(parseResult.yops, input.turns);
			const dedupGate = validateDedup(parseResult.yops);

			const rejectedIndices = new Set(
				[...sourceGate.violations, ...dedupGate.violations]
					.filter((v) => v.severity === 'error' && v.opIndex >= 0)
					.map((v) => v.opIndex),
			);

			const validYOps =
				rejectedIndices.size > 0
					? parseResult.yops.filter((_, i) => !rejectedIndices.has(i))
					: parseResult.yops;

			if (validYOps.length === 0 && parseResult.yops.length > 0) {
				lastError = `All ${parseResult.yops.length} YOps rejected by gates: ${[...sourceGate.violations, ...dedupGate.violations].map((v) => v.message).join('; ')}`;
				continue;
			}

			// Apply only validated YOps
			const applyResult = applyYOps(baseSnapshot, validYOps);
			if (!applyResult.ok) {
				lastError = `Failed to apply YOps: ${applyResult.error?.message ?? 'unknown'}`;
				continue;
			}

			const snapshot: SemanticContent = {
				trees: applyResult.trees,
				relations: applyResult.relations,
			};

			// Post-apply validation (same as before)
			const validation = validateIntegrity(snapshot);
			if (!validation.valid) {
				lastError = `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`;
				continue;
			}

			const lintResult = ylint(snapshot);

			return { ok: true, yops: validYOps, snapshot, usage: totalUsage, lintResult };
		}

		return { ok: false, error: lastError, usage: totalUsage };
	}
}
