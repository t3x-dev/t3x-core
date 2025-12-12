import { T3XFile } from '../types';

export interface ImporterConfig {
  preserveMetadata?: boolean;
  autoExtractKnowledge?: boolean;
  tags?: string[];
}

export abstract class BaseImporter {
  abstract readonly name: string;
  abstract readonly supportedFormats: string[];

  /**
   * Import from source format to T3X
   */
  abstract import(
    input: string | Buffer,
    config?: ImporterConfig
  ): Promise<T3XFile>;

  /**
   * Validate if input is supported by this importer
   */
  abstract canImport(input: any): boolean;

  /**
   * Get importer metadata
   */
  getMetadata() {
    return {
      name: this.name,
      supportedFormats: this.supportedFormats,
    };
  }
}
