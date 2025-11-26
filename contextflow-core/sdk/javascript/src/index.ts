/**
 * ContextFlow SDK - Official JavaScript/TypeScript SDK for the ContextFlow specification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContextFlowFile } from './types';
import { ImporterRegistry } from './importers';
import { ExporterRegistry } from './exporters';

export * from './types';
export * from './importers';
export * from './exporters';

/**
 * Main ContextFlow class for reading, writing, and transforming ContextFlow files.
 */
export class ContextFlow {
  private importers: ImporterRegistry;
  private exporters: ExporterRegistry;

  constructor() {
    this.importers = new ImporterRegistry();
    this.exporters = new ExporterRegistry();
  }

  /**
   * Load a ContextFlow file from disk.
   */
  static async load(filePath: string): Promise<ContextFlowFile> {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content) as ContextFlowFile;
  }

  /**
   * Save a ContextFlow file to disk.
   */
  static async save(filePath: string, contextflow: ContextFlowFile): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(contextflow, null, 2),
      'utf8'
    );
  }

  /**
   * Import from external format.
   */
  async import(
    input: string | Buffer,
    options?: { importerName?: string; config?: any }
  ): Promise<ContextFlowFile> {
    let importer;
    const importerName = options?.importerName;

    if (importerName) {
      importer = this.importers.get(importerName);
      if (!importer) {
        throw new Error(`Importer not found: ${importerName}`);
      }
    } else {
      // Auto-detect
      const data = typeof input === 'string' ? JSON.parse(input) : JSON.parse(input.toString());
      importer = this.importers.detect(data);
      if (!importer) {
        throw new Error('Could not detect importer for input format');
      }
    }

    return await importer.import(input, options?.config);
  }

  /**
   * Export to external format.
   */
  async export(
    contextflow: ContextFlowFile,
    exporterName: string,
    config?: any
  ): Promise<string | object> {
    const exporter = this.exporters.get(exporterName);
    if (!exporter) {
      throw new Error(`Exporter not found: ${exporterName}`);
    }

    return await exporter.export(contextflow, config);
  }

  /**
   * List available importers.
   */
  listImporters(): string[] {
    return this.importers.list();
  }

  /**
   * List available exporters.
   */
  listExporters(): string[] {
    return this.exporters.list();
  }

  /**
   * Get importer registry (for registering custom importers).
   */
  getImporterRegistry(): ImporterRegistry {
    return this.importers;
  }

  /**
   * Get exporter registry (for registering custom exporters).
   */
  getExporterRegistry(): ExporterRegistry {
    return this.exporters;
  }
}

// Convenience exports
export const load = ContextFlow.load;
export const save = ContextFlow.save;
