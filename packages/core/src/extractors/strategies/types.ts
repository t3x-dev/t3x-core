/**
 * Extraction Strategy Interface
 *
 * Defines the contract for extraction strategies (YAML vs tool-use).
 * Both strategies produce the same ExtractionResult type.
 */

import type { LLMProvider } from '../../llm/types';
import type { ExtractionStyleConfig } from '../extractionStyleConfig';
import type { ExtractionResult } from '../extractor';
import type { ExtractionInput } from '../yopsPrompt';

export interface ExtractionStrategy {
  readonly name: string;

  extract(
    input: ExtractionInput,
    provider: LLMProvider,
    style?: ExtractionStyleConfig
  ): Promise<ExtractionResult>;
}
