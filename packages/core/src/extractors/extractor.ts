/**
 * Extractor Orchestrator
 *
 * Delegates to an ExtractionStrategy (default: YamlExtractionStrategy).
 * Callers can inject ToolUseExtractionStrategy for tool-use mode.
 */

import type { LLMProvider } from '../llm/types';
import type { SemanticContent } from '../semantic/types';
import type { YOp } from '../t3x-yops/types';
import type { ExtractionStyleConfig } from './extractionStyleConfig';
import type { ExtractionStrategy } from './strategies/types';
import { YamlExtractionStrategy } from './strategies/yaml-strategy';
import type { ExtractionInput, ExtractionTurn } from './yopsPrompt';

// ── Result Type ──

export type ExtractionResult =
  | {
      ok: true;
      yops: YOp[];
      snapshot: SemanticContent;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; error: string; usage: { inputTokens: number; outputTokens: number } };

// ── Re-export input types ──

export type { ExtractionInput, ExtractionTurn };

// ── Class ──

export class Extractor {
  private readonly strategy: ExtractionStrategy;

  constructor(
    private readonly provider: LLMProvider,
    strategy?: ExtractionStrategy
  ) {
    this.strategy = strategy ?? new YamlExtractionStrategy();
  }

  async extract(input: ExtractionInput, style?: ExtractionStyleConfig): Promise<ExtractionResult> {
    return this.strategy.extract(input, this.provider, style);
  }
}
