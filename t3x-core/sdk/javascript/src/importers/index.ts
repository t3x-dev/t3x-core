import { BaseImporter } from './base';
import { ChatGPTImporter } from './chatgpt';

export * from './base';
export * from './chatgpt';

/**
 * Registry for managing importers with auto-detection
 */
export class ImporterRegistry {
  private importers: Map<string, BaseImporter> = new Map();

  constructor() {
    // Register built-in importers
    this.register(new ChatGPTImporter());
  }

  /**
   * Register a new importer
   */
  register(importer: BaseImporter): void {
    this.importers.set(importer.name, importer);
  }

  /**
   * Get importer by name
   */
  get(name: string): BaseImporter | undefined {
    return this.importers.get(name);
  }

  /**
   * Auto-detect importer based on input data
   */
  detect(input: any): BaseImporter | null {
    for (const importer of this.importers.values()) {
      if (importer.canImport(input)) {
        return importer;
      }
    }
    return null;
  }

  /**
   * List all registered importers
   */
  list(): string[] {
    return Array.from(this.importers.keys());
  }

  /**
   * Get all importers
   */
  getAll(): BaseImporter[] {
    return Array.from(this.importers.values());
  }
}
