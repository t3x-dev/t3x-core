import { ContextFlowFile } from '../types';
export interface ImporterConfig {
    preserveMetadata?: boolean;
    autoExtractKnowledge?: boolean;
    tags?: string[];
}
export declare abstract class BaseImporter {
    abstract readonly name: string;
    abstract readonly supportedFormats: string[];
    /**
     * Import from source format to ContextFlow
     */
    abstract import(input: string | Buffer, config?: ImporterConfig): Promise<ContextFlowFile>;
    /**
     * Validate if input is supported by this importer
     */
    abstract canImport(input: any): boolean;
    /**
     * Get importer metadata
     */
    getMetadata(): {
        name: string;
        supportedFormats: string[];
    };
}
