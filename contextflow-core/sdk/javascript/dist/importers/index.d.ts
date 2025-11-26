import { BaseImporter } from './base';
export * from './base';
export * from './chatgpt';
/**
 * Registry for managing importers with auto-detection
 */
export declare class ImporterRegistry {
    private importers;
    constructor();
    /**
     * Register a new importer
     */
    register(importer: BaseImporter): void;
    /**
     * Get importer by name
     */
    get(name: string): BaseImporter | undefined;
    /**
     * Auto-detect importer based on input data
     */
    detect(input: any): BaseImporter | null;
    /**
     * List all registered importers
     */
    list(): string[];
    /**
     * Get all importers
     */
    getAll(): BaseImporter[];
}
