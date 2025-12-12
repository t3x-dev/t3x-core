import { BaseExporter } from './base';
export * from './base';
export * from './claude';
export * from './openai';
/**
 * Registry for managing exporters
 */
export declare class ExporterRegistry {
    private exporters;
    constructor();
    /**
     * Register a new exporter
     */
    register(exporter: BaseExporter): void;
    /**
     * Get exporter by name
     */
    get(name: string): BaseExporter | undefined;
    /**
     * List all registered exporters
     */
    list(): string[];
    /**
     * Get all exporters
     */
    getAll(): BaseExporter[];
}
