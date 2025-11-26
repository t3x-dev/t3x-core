import { ContextFlowFile } from '../types';

export interface ExporterConfig {
  includeMetadata?: boolean;
  maxTokens?: number;
  format?: 'json' | 'markdown' | 'text';
}

export abstract class BaseExporter {
  abstract readonly name: string;
  abstract readonly targetPlatform: string;

  /**
   * Export ContextFlow to target platform format
   */
  abstract export(contextflow: ContextFlowFile, config?: ExporterConfig): Promise<string | object>;

  /**
   * Get exporter metadata
   */
  getMetadata() {
    return {
      name: this.name,
      targetPlatform: this.targetPlatform,
    };
  }
}
