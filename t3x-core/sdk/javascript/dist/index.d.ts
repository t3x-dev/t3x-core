/**
 * ContextFlow SDK - Official JavaScript/TypeScript SDK for the ContextFlow specification.
 */
import { ContextFlowFile } from './types';
import { ImporterRegistry } from './importers';
import { ExporterRegistry } from './exporters';
export * from './types';
export * from './importers';
export * from './exporters';
/**
 * Main ContextFlow class for reading, writing, and transforming ContextFlow files.
 */
export declare class ContextFlow {
    private importers;
    private exporters;
    constructor();
    /**
     * Load a ContextFlow file from disk.
     */
    static load(filePath: string): Promise<ContextFlowFile>;
    /**
     * Save a ContextFlow file to disk.
     */
    static save(filePath: string, contextflow: ContextFlowFile): Promise<void>;
    /**
     * Import from external format.
     */
    import(input: string | Buffer, options?: {
        importerName?: string;
        config?: any;
    }): Promise<ContextFlowFile>;
    /**
     * Export to external format.
     */
    export(contextflow: ContextFlowFile, exporterName: string, config?: any): Promise<string | object>;
    /**
     * List available importers.
     */
    listImporters(): string[];
    /**
     * List available exporters.
     */
    listExporters(): string[];
    /**
     * Get importer registry (for registering custom importers).
     */
    getImporterRegistry(): ImporterRegistry;
    /**
     * Get exporter registry (for registering custom exporters).
     */
    getExporterRegistry(): ExporterRegistry;
}
export declare const load: typeof ContextFlow.load;
export declare const save: typeof ContextFlow.save;
