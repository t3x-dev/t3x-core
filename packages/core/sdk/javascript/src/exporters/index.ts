import type { BaseExporter } from './base';
import { ClaudeExporter } from './claude';
import { OpenAIExporter } from './openai';

export * from './base';
export * from './claude';
export * from './openai';

/**
 * Registry for managing exporters
 */
export class ExporterRegistry {
  private exporters: Map<string, BaseExporter> = new Map();

  constructor() {
    // Register built-in exporters
    this.register(new ClaudeExporter());
    this.register(new OpenAIExporter());
  }

  /**
   * Register a new exporter
   */
  register(exporter: BaseExporter): void {
    this.exporters.set(exporter.name, exporter);
  }

  /**
   * Get exporter by name
   */
  get(name: string): BaseExporter | undefined {
    return this.exporters.get(name);
  }

  /**
   * List all registered exporters
   */
  list(): string[] {
    return Array.from(this.exporters.keys());
  }

  /**
   * Get all exporters
   */
  getAll(): BaseExporter[] {
    return Array.from(this.exporters.values());
  }
}
