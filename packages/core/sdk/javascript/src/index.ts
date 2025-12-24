/**
 * T3X SDK - Official JavaScript/TypeScript SDK for the T3X specification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { T3XFile } from './types';
import { ImporterRegistry } from './importers';
import { ExporterRegistry } from './exporters';

export * from './types';
export * from './importers';
export * from './exporters';

/**
 * Main T3X class for reading, writing, and transforming T3X files.
 */
export class T3X {
  private importers: ImporterRegistry;
  private exporters: ExporterRegistry;

  constructor() {
    this.importers = new ImporterRegistry();
    this.exporters = new ExporterRegistry();
  }

  /**
   * Load a T3X file from disk.
   */
  static async load(filePath: string): Promise<T3XFile> {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content) as T3XFile;
  }

  /**
   * Save a T3X file to disk.
   */
  static async save(filePath: string, t3x: T3XFile): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(t3x, null, 2),
      'utf8'
    );
  }

  /**
   * Import from external format.
   */
  async import(
    input: string | Buffer,
    options?: { importerName?: string; config?: any }
  ): Promise<T3XFile> {
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
    t3x: T3XFile,
    exporterName: string,
    config?: any
  ): Promise<string | object> {
    const exporter = this.exporters.get(exporterName);
    if (!exporter) {
      throw new Error(`Exporter not found: ${exporterName}`);
    }

    return await exporter.export(t3x, config);
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
export const load = T3X.load;
export const save = T3X.save;
